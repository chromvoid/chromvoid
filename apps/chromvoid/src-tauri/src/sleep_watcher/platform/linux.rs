use super::super::SleepWatcher;
use dbus::blocking::Connection;
use dbus::message::MatchRule;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;
use std::time::Duration;

const LOGIND_PROCESS_TIMEOUT: Duration = Duration::from_millis(1000);

pub struct LinuxSleepWatcher {
    stop: Arc<AtomicBool>,
    thread: Mutex<Option<JoinHandle<()>>>,
}

impl LinuxSleepWatcher {
    pub fn new(handler: Box<dyn SleepWatcher + 'static>) -> Result<Self, String> {
        let handler: Arc<dyn SleepWatcher> = handler.into();
        let stop = Arc::new(AtomicBool::new(false));
        let stop_for_thread = stop.clone();
        let (ready_tx, ready_rx) = std::sync::mpsc::channel::<Result<(), String>>();

        let thread = std::thread::Builder::new()
            .name("sleep-watcher-linux".into())
            .spawn(move || run_logind_loop(handler, stop_for_thread, ready_tx))
            .map_err(|e| format!("Failed to spawn linux sleep-watcher thread: {e}"))?;

        match ready_rx
            .recv()
            .map_err(|_| "linux sleep-watcher exited before readiness".to_string())?
        {
            Ok(()) => Ok(Self {
                stop,
                thread: Mutex::new(Some(thread)),
            }),
            Err(error) => {
                stop.store(true, Ordering::Release);
                let _ = thread.join();
                Err(error)
            }
        }
    }
}

impl Drop for LinuxSleepWatcher {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::Release);
        if let Ok(mut thread) = self.thread.lock() {
            if let Some(thread) = thread.take() {
                let _ = thread.join();
            }
        }
    }
}

fn run_logind_loop(
    handler: Arc<dyn SleepWatcher>,
    stop: Arc<AtomicBool>,
    ready_tx: std::sync::mpsc::Sender<Result<(), String>>,
) {
    let conn = match Connection::new_system() {
        Ok(conn) => conn,
        Err(error) => {
            let _ = ready_tx.send(Err(format!("connect system bus: {error}")));
            return;
        }
    };

    let match_rule = MatchRule::new_signal("org.freedesktop.login1.Manager", "PrepareForSleep");
    let handler_for_match = handler.clone();
    if let Err(error) = conn.add_match(match_rule, move |(sleeping,): (bool,), _, _| {
        if sleeping {
            handler_for_match.on_sleep();
        } else {
            handler_for_match.on_wake();
        }
        true
    }) {
        let _ = ready_tx.send(Err(format!("subscribe logind PrepareForSleep: {error}")));
        return;
    }

    let _ = ready_tx.send(Ok(()));

    while !stop.load(Ordering::Acquire) {
        if let Err(error) = conn.process(LOGIND_PROCESS_TIMEOUT) {
            tracing::warn!("sleep_watcher_linux: logind event loop failed: {error}");
            break;
        }
    }
}
