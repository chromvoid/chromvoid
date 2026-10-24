mod dispatch;
mod helpers;
mod lock_transition;
mod result;

pub(crate) use dispatch::*;
#[cfg(desktop)]
pub(crate) use lock_transition::handle_lock_transition_with_reason;
pub(crate) use lock_transition::lock_vault_with_reason;

#[cfg(test)]
mod tests;
