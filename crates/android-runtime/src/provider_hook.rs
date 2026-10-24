//! How this crate reaches Core.
//!
//! The provider paths need a Core adapter, but the adapter belongs to whichever
//! application owns the process: the Tauri shell holds it behind its own state,
//! and the native client will hold it behind its runtime. Rather than reaching
//! into either, the host installs one hook at startup and this crate calls it.
//!
//! The hook grants no authority of its own, and it does not hand out the host's
//! adapter: it lends a [`ProviderCore`] for the duration of one call, which can
//! send provider commands and nothing else. A host whose Core sits behind a
//! session implements it over the session's admission, so a provider request
//! is fenced like any other. Every caller still gets the host's own refusal
//! when no provider bridge is active.

use std::sync::{Arc, OnceLock};

use crate::provider_core::ProviderCore;

use crate::autofill::AndroidAutofillRuntimeState;
use crate::password_save::AndroidPasswordSaveRuntimeState;

/// Runs `body` with the host's provider core, or explains why it cannot.
///
/// The closure is erased so the hook itself stays a plain function pointer: a
/// generic hook could not be stored in a static.
pub type ProviderCoreHook = fn(&mut dyn FnMut(&mut dyn ProviderCore)) -> Result<(), String>;

/// What the host lends this crate. `ready` answers whether the host's provider
/// bridge is up at all, which is a different question from whether a vault is
/// open, and the two must not be conflated in what the user is told.
#[derive(Clone, Copy)]
pub struct ProviderBridge {
    pub ready: fn() -> bool,
    pub with_core: ProviderCoreHook,
    /// Per-feature state the host keeps for the process. The types are this
    /// crate's, the lifetime is the host's.
    pub autofill_state: fn() -> Option<Arc<AndroidAutofillRuntimeState>>,
    pub password_save_state: fn() -> Option<Arc<AndroidPasswordSaveRuntimeState>>,
}

pub fn autofill_state() -> Option<Arc<AndroidAutofillRuntimeState>> {
    PROVIDER_BRIDGE
        .get()
        .and_then(|bridge| (bridge.autofill_state)())
}

pub fn password_save_state() -> Option<Arc<AndroidPasswordSaveRuntimeState>> {
    PROVIDER_BRIDGE
        .get()
        .and_then(|bridge| (bridge.password_save_state)())
}

static PROVIDER_BRIDGE: OnceLock<ProviderBridge> = OnceLock::new();

/// Installs the process hook. A second install is refused rather than silently
/// replacing the first: two owners of Core access is a bug, not a fallback.
pub fn install_provider_bridge(bridge: ProviderBridge) -> Result<(), String> {
    PROVIDER_BRIDGE
        .set(bridge)
        .map_err(|_| "Provider bridge is already installed".to_string())
}

pub fn provider_bridge_installed() -> bool {
    PROVIDER_BRIDGE.get().is_some()
}

/// Whether the host's provider bridge is active. No bridge means the feature is
/// unavailable, not that the vault is closed.
pub fn bridge_ready() -> bool {
    PROVIDER_BRIDGE.get().is_some_and(|bridge| (bridge.ready)())
}

/// The message every provider path shows when no bridge is active. It says the
/// capability is unavailable, never that a credential or a vault is missing.
pub const PROVIDER_BRIDGE_UNAVAILABLE: &str = "Autofill unavailable: provider bridge is not active";

pub fn with_provider_core<T>(body: impl FnOnce(&mut dyn ProviderCore) -> T) -> Result<T, String> {
    let bridge = PROVIDER_BRIDGE
        .get()
        .ok_or_else(|| PROVIDER_BRIDGE_UNAVAILABLE.to_string())?;
    let mut body = Some(body);
    let mut produced: Option<T> = None;
    (bridge.with_core)(&mut |core| {
        if let Some(body) = body.take() {
            produced = Some(body(core));
        }
    })?;
    produced.ok_or_else(|| PROVIDER_BRIDGE_UNAVAILABLE.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn an_uninstalled_hook_explains_instead_of_panicking() {
        // The hook is process-wide, so this test only asserts the shape of the
        // refusal when nothing has been installed by this test binary.
        if provider_bridge_installed() {
            return;
        }
        let outcome = with_provider_core(|_| 1_u8);
        assert_eq!(outcome, Err(PROVIDER_BRIDGE_UNAVAILABLE.to_string()));
    }
}
