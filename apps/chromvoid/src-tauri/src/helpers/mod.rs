mod normalize;
mod redact;
mod rpc;
pub(crate) mod storage;

#[cfg(desktop)]
mod desktop;

#[cfg(test)]
mod tests;

pub(crate) use normalize::*;
pub(crate) use redact::*;
pub(crate) use rpc::*;
pub(crate) use storage::*;

#[cfg(desktop)]
pub(crate) use desktop::*;

pub(crate) fn touch_last_activity(
    last_activity: &std::sync::Mutex<std::time::Instant>,
    context: &str,
) {
    match last_activity.lock() {
        Ok(mut last) => *last = std::time::Instant::now(),
        Err(_) => tracing::warn!("{context}: last activity mutex poisoned"),
    }
}

pub(crate) fn boxed_error(msg: impl Into<String>) -> Box<dyn std::error::Error> {
    msg.into().into()
}
