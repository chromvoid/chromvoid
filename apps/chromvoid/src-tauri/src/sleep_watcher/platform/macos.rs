use super::super::SleepWatcher;
use std::ffi::c_void;

// IOKit / CoreFoundation FFI types
type IOReturn = i32;
type CFRunLoopRef = *mut c_void;
type CFRunLoopSourceRef = *mut c_void;
type CFStringRef = *const c_void;
type IONotificationPortRef = *mut c_void;

/// Wrapper to send raw pointers across threads via mpsc channel.
struct SendPtr(*mut c_void);
// SAFETY: CFRunLoopRef from CFRunLoopGetCurrent is valid across threads; CFRunLoopStop is
// documented as thread-safe.
unsafe impl Send for SendPtr {}

const KIO_MESSAGE_CAN_SYSTEM_SLEEP: u32 = 0xe000_0240;
const KIO_MESSAGE_SYSTEM_WILL_SLEEP: u32 = 0xe000_0280;
const KIO_MESSAGE_SYSTEM_HAS_POWERED_ON: u32 = 0xe000_0300;

#[link(name = "IOKit", kind = "framework")]
extern "C" {
    fn IORegisterForSystemPower(
        refcon: *mut c_void,
        notify_port_ref: *mut IONotificationPortRef,
        callback: extern "C" fn(
            refcon: *mut c_void,
            service: u32,
            message_type: u32,
            message_argument: *mut c_void,
        ),
        notifier_object: *mut u32,
    ) -> u32; // returns io_connect_t (root port)

    fn IOAllowPowerChange(kernel_port: u32, notification_id: isize) -> IOReturn;
    fn IODeregisterForSystemPower(notifier: *mut u32) -> IOReturn;
    fn IOServiceClose(connect: u32) -> IOReturn;
    fn IONotificationPortGetRunLoopSource(notify: IONotificationPortRef) -> CFRunLoopSourceRef;
    fn IONotificationPortDestroy(notify: IONotificationPortRef);
}

#[link(name = "CoreFoundation", kind = "framework")]
extern "C" {
    fn CFRunLoopGetCurrent() -> CFRunLoopRef;
    fn CFRunLoopAddSource(rl: CFRunLoopRef, source: CFRunLoopSourceRef, mode: CFStringRef);
    fn CFRunLoopRun();
    fn CFRunLoopStop(rl: CFRunLoopRef);

    static kCFRunLoopCommonModes: CFStringRef;
}

/// Context passed through `refcon` to the IOKit callback.
struct WatcherContext {
    handler: Box<dyn SleepWatcher>,
    root_port: u32,
}

extern "C" fn power_callback(
    refcon: *mut c_void,
    _service: u32,
    message_type: u32,
    message_argument: *mut c_void,
) {
    // SAFETY: refcon was passed as the ctx_ptr leaked from Box::into_raw on line 109; the Box is freed only
    // after CFRunLoopRun returns (line 159), well after every callback dispatch.
    let ctx = unsafe { &*(refcon as *const WatcherContext) };
    let notification_id = message_argument as isize;

    match message_type {
        KIO_MESSAGE_CAN_SYSTEM_SLEEP => {
            // Allow idle sleep (don't veto)
            // SAFETY: ctx.root_port was returned by IORegisterForSystemPower on line 114; notification_id
            // comes from message_argument supplied by IOKit.
            unsafe {
                IOAllowPowerChange(ctx.root_port, notification_id);
            }
        }
        KIO_MESSAGE_SYSTEM_WILL_SLEEP => {
            ctx.handler.on_sleep();
            // SAFETY: ctx.root_port was returned by IORegisterForSystemPower on line 114; notification_id
            // comes from message_argument supplied by IOKit.
            unsafe {
                IOAllowPowerChange(ctx.root_port, notification_id);
            }
        }
        KIO_MESSAGE_SYSTEM_HAS_POWERED_ON => {
            ctx.handler.on_wake();
        }
        _ => {}
    }
}

pub struct MacOSSleepWatcher {
    run_loop: CFRunLoopRef,
    _thread: std::thread::JoinHandle<()>,
}

// SAFETY: CFRunLoopStop is documented as thread-safe — safe to call from the drop thread.
unsafe impl Send for MacOSSleepWatcher {}
// SAFETY: CFRunLoopStop is documented as thread-safe — safe to call from the drop thread.
unsafe impl Sync for MacOSSleepWatcher {}

impl MacOSSleepWatcher {
    pub fn new(handler: Box<dyn SleepWatcher + 'static>) -> Result<Self, String> {
        // Channel to receive the CFRunLoopRef (wrapped for Send) from the spawned thread.
        let (tx, rx) = std::sync::mpsc::channel::<Result<SendPtr, String>>();

        let thread = std::thread::Builder::new()
            .name("sleep-watcher".into())
            .spawn(move || {
                // Allocate context on the heap; it will be freed after CFRunLoopRun returns.
                let ctx = Box::new(WatcherContext {
                    handler,
                    root_port: 0,
                });
                let ctx_ptr = Box::into_raw(ctx);

                let mut notify_port: IONotificationPortRef = std::ptr::null_mut();
                let mut notifier_object: u32 = 0;

                // SAFETY: ctx_ptr is the Box::into_raw pointer from line 109; notify_port and
                // notifier_object are stack-allocated out-params; power_callback is a 'static extern "C" fn.
                let root_port = unsafe {
                    IORegisterForSystemPower(
                        ctx_ptr as *mut c_void,
                        &mut notify_port,
                        power_callback,
                        &mut notifier_object,
                    )
                };

                if root_port == 0 {
                    // Clean up the leaked context box
                    // SAFETY: ctx_ptr was leaked from Box::into_raw on line 109 and never aliased;
                    // reclaiming exclusive ownership on the failure path before returning.
                    let _ = unsafe { Box::from_raw(ctx_ptr) };
                    let _ = tx.send(Err("IORegisterForSystemPower failed".into()));
                    return;
                }

                // Store root_port in context so the callback can call IOAllowPowerChange
                // SAFETY: ctx_ptr is the Box::into_raw pointer from line 109; we still own it exclusively
                // here (no callback can fire before the run loop source is added below).
                unsafe {
                    (*ctx_ptr).root_port = root_port;
                }

                // SAFETY: notify_port was populated by IORegisterForSystemPower above; the returned source
                // is owned by IOKit.
                let run_loop_source = unsafe { IONotificationPortGetRunLoopSource(notify_port) };

                // SAFETY: returns the current thread's CFRunLoopRef; valid until thread exit.
                let rl = unsafe { CFRunLoopGetCurrent() };

                // SAFETY: rl is the current run loop; run_loop_source is owned by IOKit;
                // kCFRunLoopCommonModes is a 'static CFStringRef.
                unsafe {
                    CFRunLoopAddSource(rl, run_loop_source, kCFRunLoopCommonModes);
                }

                // Signal the parent thread with the run loop ref
                let _ = tx.send(Ok(SendPtr(rl)));

                // Block until CFRunLoopStop is called (from Drop)
                // SAFETY: blocks the spawned thread until CFRunLoopStop is called from Drop; the run loop
                // source we added above keeps the loop alive in the meantime.
                unsafe {
                    CFRunLoopRun();
                }

                // Cleanup IOKit resources
                // SAFETY: notifier_object/root_port/notify_port were populated by the matching
                // IORegisterForSystemPower call above; cleanup runs after CFRunLoopRun returns so no
                // callback is in flight.
                unsafe {
                    IODeregisterForSystemPower(&mut notifier_object);
                    IOServiceClose(root_port);
                    IONotificationPortDestroy(notify_port);
                }

                // Free the context
                // SAFETY: ctx_ptr was leaked from Box::into_raw on line 109; CFRunLoopRun has returned and
                // the IOKit notifier has been deregistered, so no other reference can observe it.
                let _ = unsafe { Box::from_raw(ctx_ptr) };
            })
            .map_err(|e| format!("Failed to spawn sleep-watcher thread: {e}"))?;

        let SendPtr(run_loop) = rx
            .recv()
            .map_err(|_| "sleep-watcher thread exited before sending run loop".to_string())?
            .map_err(|e| e)?;

        Ok(MacOSSleepWatcher {
            run_loop,
            _thread: thread,
        })
    }
}

impl Drop for MacOSSleepWatcher {
    fn drop(&mut self) {
        // SAFETY: self.run_loop was obtained from CFRunLoopGetCurrent on the spawned thread;
        // CFRunLoopStop is documented as thread-safe.
        unsafe {
            CFRunLoopStop(self.run_loop);
        }
        // The thread will exit after CFRunLoopRun returns and clean up IOKit resources.
    }
}
