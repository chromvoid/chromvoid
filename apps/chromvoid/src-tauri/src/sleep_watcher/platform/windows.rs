use super::super::SleepWatcher;
use std::ffi::c_void;
use std::sync::Mutex;
use std::thread::JoinHandle;
use windows_sys::Win32::Foundation::{HINSTANCE, HWND, LPARAM, LRESULT, WPARAM};
use windows_sys::Win32::System::LibraryLoader::GetModuleHandleW;
use windows_sys::Win32::System::Threading::GetCurrentThreadId;
use windows_sys::Win32::UI::WindowsAndMessaging::{
    CreateWindowExW, DefWindowProcW, DestroyWindow, DispatchMessageW, GetMessageW,
    GetWindowLongPtrW, PostThreadMessageW, RegisterClassW, SetWindowLongPtrW, TranslateMessage,
    UnregisterClassW, CREATESTRUCTW, GWLP_USERDATA, HWND_MESSAGE, MSG, PBT_APMRESUMEAUTOMATIC,
    PBT_APMRESUMECRITICAL, PBT_APMRESUMESTANDBY, PBT_APMRESUMESUSPEND, PBT_APMSTANDBY,
    PBT_APMSUSPEND, WM_NCCREATE, WM_POWERBROADCAST, WM_QUIT, WNDCLASSW,
};

pub struct WindowsSleepWatcher {
    thread_id: u32,
    thread: Mutex<Option<JoinHandle<()>>>,
}

struct WatcherContext {
    handler: Box<dyn SleepWatcher>,
}

impl WindowsSleepWatcher {
    pub fn new(handler: Box<dyn SleepWatcher + 'static>) -> Result<Self, String> {
        let (ready_tx, ready_rx) = std::sync::mpsc::channel::<Result<u32, String>>();
        let thread = std::thread::Builder::new()
            .name("sleep-watcher-windows".into())
            .spawn(move || run_message_loop(handler, ready_tx))
            .map_err(|e| format!("Failed to spawn windows sleep-watcher thread: {e}"))?;

        match ready_rx
            .recv()
            .map_err(|_| "windows sleep-watcher exited before readiness".to_string())?
        {
            Ok(thread_id) => Ok(Self {
                thread_id,
                thread: Mutex::new(Some(thread)),
            }),
            Err(error) => {
                let _ = thread.join();
                Err(error)
            }
        }
    }
}

impl Drop for WindowsSleepWatcher {
    fn drop(&mut self) {
        unsafe {
            PostThreadMessageW(self.thread_id, WM_QUIT, 0, 0);
        }
        if let Ok(mut thread) = self.thread.lock() {
            if let Some(thread) = thread.take() {
                let _ = thread.join();
            }
        }
    }
}

fn run_message_loop(
    handler: Box<dyn SleepWatcher + 'static>,
    ready_tx: std::sync::mpsc::Sender<Result<u32, String>>,
) {
    let class_name: Vec<u16> = "ChromVoidSleepWatcher\0".encode_utf16().collect();
    let window_name: Vec<u16> = "ChromVoid Sleep Watcher\0".encode_utf16().collect();

    let hinstance = unsafe { GetModuleHandleW(std::ptr::null()) } as HINSTANCE;
    if hinstance.is_null() {
        let _ = ready_tx.send(Err("GetModuleHandleW failed".to_string()));
        return;
    }

    let window_class = WNDCLASSW {
        style: 0,
        lpfnWndProc: Some(window_proc),
        cbClsExtra: 0,
        cbWndExtra: 0,
        hInstance: hinstance,
        hIcon: std::ptr::null_mut(),
        hCursor: std::ptr::null_mut(),
        hbrBackground: std::ptr::null_mut(),
        lpszMenuName: std::ptr::null(),
        lpszClassName: class_name.as_ptr(),
    };

    if unsafe { RegisterClassW(&window_class) } == 0 {
        let _ = ready_tx.send(Err("RegisterClassW failed".to_string()));
        return;
    }

    let context_ptr = Box::into_raw(Box::new(WatcherContext { handler }));
    let hwnd = unsafe {
        CreateWindowExW(
            0,
            class_name.as_ptr(),
            window_name.as_ptr(),
            0,
            0,
            0,
            0,
            0,
            HWND_MESSAGE,
            std::ptr::null_mut(),
            hinstance,
            context_ptr as *const c_void,
        )
    };

    if hwnd.is_null() {
        let _ = unsafe { Box::from_raw(context_ptr) };
        unsafe {
            UnregisterClassW(class_name.as_ptr(), hinstance);
        }
        let _ = ready_tx.send(Err("CreateWindowExW failed".to_string()));
        return;
    }

    let thread_id = unsafe { GetCurrentThreadId() };
    let _ = ready_tx.send(Ok(thread_id));

    let mut msg = MSG::default();
    loop {
        let result = unsafe { GetMessageW(&mut msg, std::ptr::null_mut(), 0, 0) };
        if result <= 0 {
            break;
        }
        unsafe {
            TranslateMessage(&msg);
            DispatchMessageW(&msg);
        }
    }

    unsafe {
        DestroyWindow(hwnd);
        UnregisterClassW(class_name.as_ptr(), hinstance);
        let _ = Box::from_raw(context_ptr);
    }
}

unsafe extern "system" fn window_proc(
    hwnd: HWND,
    msg: u32,
    wparam: WPARAM,
    lparam: LPARAM,
) -> LRESULT {
    match msg {
        WM_NCCREATE => {
            let create = lparam as *const CREATESTRUCTW;
            if !create.is_null() {
                SetWindowLongPtrW(hwnd, GWLP_USERDATA, (*create).lpCreateParams as isize);
                return 1;
            }
            0
        }
        WM_POWERBROADCAST => {
            let context_ptr = GetWindowLongPtrW(hwnd, GWLP_USERDATA) as *const WatcherContext;
            if !context_ptr.is_null() {
                let context = &*context_ptr;
                match wparam as u32 {
                    PBT_APMSUSPEND | PBT_APMSTANDBY => context.handler.on_sleep(),
                    PBT_APMRESUMEAUTOMATIC
                    | PBT_APMRESUMECRITICAL
                    | PBT_APMRESUMESTANDBY
                    | PBT_APMRESUMESUSPEND => context.handler.on_wake(),
                    _ => {}
                }
            }
            1
        }
        _ => DefWindowProcW(hwnd, msg, wparam, lparam),
    }
}
