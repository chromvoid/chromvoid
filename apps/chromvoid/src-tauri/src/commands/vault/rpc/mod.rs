mod dispatch;
mod helpers;
mod lock_transition;
mod result;

pub(crate) use dispatch::*;
#[cfg(desktop)]
pub(crate) use lock_transition::handle_lock_transition_with_reason;
pub(crate) use lock_transition::lock_vault_with_reason;
#[cfg(target_os = "android")]
pub(crate) use lock_transition::stop_mobile_usb_host_sessions_for_vault_lock;

#[cfg(test)]
mod tests;
