mod signal;
mod sleep_handler;
#[cfg(test)]
mod tests;

pub(crate) use signal::{exit_request_should_intercept, spawn_shutdown_signal_listener};
pub(crate) use sleep_handler::VaultSleepHandler;
