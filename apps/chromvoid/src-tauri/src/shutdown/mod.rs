mod desktop_exit;
mod signal;
mod sleep_handler;
#[cfg(test)]
mod tests;

pub(crate) use desktop_exit::{
    collect_desktop_exit_cleanup, run_desktop_exit_cleanup, wait_desktop_exit_cleanup,
    DesktopExitCleanupMode,
};
pub(crate) use signal::spawn_shutdown_signal_listener;
pub(crate) use sleep_handler::VaultSleepHandler;
