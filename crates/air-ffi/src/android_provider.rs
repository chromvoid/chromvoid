//! The Android provider paths - Autofill, Credential Manager, password saving - answer other
//! apps from inside this application's process. They reach Core through the shared owners in
//! `chromvoid-android-runtime`, which call a provider hook (ADR-040 D-01); this module installs
//! it over the live runtime's session. Each request is narrowed to provider commands, admitted
//! under the provider's own identifiers and fenced by the same generation, lock and
//! cancellation as the application. The Core adapter is never lent.
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex, OnceLock, PoisonError, Weak};

use chromvoid_android_runtime::autofill::AndroidAutofillRuntimeState;
use chromvoid_android_runtime::password_save::AndroidPasswordSaveRuntimeState;
use chromvoid_android_runtime::provider_core::{PROVIDER_POLICY_DENIED, ProviderCore};
use chromvoid_android_runtime::provider_hook::{
    PROVIDER_BRIDGE_UNAVAILABLE, ProviderBridge, install_provider_bridge,
};
use chromvoid_client_runtime::adapter::CoreMode;
use chromvoid_client_runtime::session::{LocalSession, SessionError, SessionPhase};
use chromvoid_core::rpc::types::{RpcRequest, RpcResponse};

/// The session of the runtime this process opened last; a closed runtime leaves nothing.
static SESSION: Mutex<Option<Weak<LocalSession>>> = Mutex::new(None);

/// The provider's own request identifiers: they rise for the life of the process, whichever
/// runtime is open, and never touch the application's sequence.
static REQUEST_IDS: AtomicU64 = AtomicU64::new(0);

/// Makes `session` the one provider paths reach, and installs the hook the first time.
pub(crate) fn register(session: &Arc<LocalSession>) {
    *SESSION.lock().unwrap_or_else(PoisonError::into_inner) = Some(Arc::downgrade(session));
    static INSTALLED: OnceLock<()> = OnceLock::new();
    INSTALLED.get_or_init(|| {
        // Only this module installs it; a second install would be a second Core owner.
        let _ = install_provider_bridge(ProviderBridge {
            ready,
            with_core,
            autofill_state,
            password_save_state,
        });
    });
}

fn current() -> Option<Arc<LocalSession>> {
    SESSION
        .lock()
        .unwrap_or_else(PoisonError::into_inner)
        .as_ref()
        .and_then(Weak::upgrade)
}

/// Whether a provider request can reach Core at all: a runtime is open and active. Whether
/// the vault is open is Core's answer to each request, not this one.
fn ready() -> bool {
    current()
        .and_then(|session| session.snapshot().ok())
        .is_some_and(|snapshot| {
            matches!(
                snapshot.phase,
                SessionPhase::Locked | SessionPhase::Unlocked
            )
        })
}

fn with_core(body: &mut dyn FnMut(&mut dyn ProviderCore)) -> Result<(), String> {
    let session = current().ok_or_else(|| PROVIDER_BRIDGE_UNAVAILABLE.to_string())?;
    body(&mut SessionProviderCore { session });
    Ok(())
}

fn autofill_state() -> Option<Arc<AndroidAutofillRuntimeState>> {
    static STATE: OnceLock<Arc<AndroidAutofillRuntimeState>> = OnceLock::new();
    Some(
        STATE
            .get_or_init(|| Arc::new(AndroidAutofillRuntimeState::new()))
            .clone(),
    )
}

fn password_save_state() -> Option<Arc<AndroidPasswordSaveRuntimeState>> {
    static STATE: OnceLock<Arc<AndroidPasswordSaveRuntimeState>> = OnceLock::new();
    Some(
        STATE
            .get_or_init(|| Arc::new(AndroidPasswordSaveRuntimeState::new()))
            .clone(),
    )
}

/// Provider calls arrive on the platform's binder threads, which run no executor.
fn executor() -> &'static tokio::runtime::Runtime {
    static EXECUTOR: OnceLock<tokio::runtime::Runtime> = OnceLock::new();
    EXECUTOR.get_or_init(|| {
        tokio::runtime::Builder::new_multi_thread()
            .worker_threads(1)
            .thread_name("air-provider")
            .enable_all()
            .build()
            .expect("the provider executor starts")
    })
}

struct SessionProviderCore {
    session: Arc<LocalSession>,
}

impl ProviderCore for SessionProviderCore {
    fn handle(&mut self, request: &RpcRequest) -> RpcResponse {
        if !chromvoid_client_runtime::provider::command_allowed(&request.command) {
            return RpcResponse::error(
                format!("{} is not a provider command", request.command),
                Some(PROVIDER_POLICY_DENIED),
            );
        }
        let generation = match self.session.snapshot() {
            Ok(snapshot) => snapshot.generation,
            Err(error) => return refused(error),
        };
        let id = REQUEST_IDS.fetch_add(1, Ordering::Relaxed) + 1;
        let admitted = match self.session.admit_provider(id, generation, request.clone()) {
            Ok(admitted) => admitted,
            Err(error) => return refused(error),
        };
        match executor().block_on(self.session.execute_admitted(admitted)) {
            Ok(response) => (*response).clone(),
            Err(error) => refused(error),
        }
    }

    /// Provider paths run only against a local Core, and this one is.
    fn mode(&self) -> CoreMode {
        CoreMode::Local
    }

    /// The session's commands persist on their own.
    fn save(&mut self) -> Result<(), String> {
        Ok(())
    }
}

/// A request the session would not run, in the codes the provider owners already explain.
fn refused(error: SessionError) -> RpcResponse {
    let (code, message) = match error {
        SessionError::Revoked => (
            "SESSION_REVOKED",
            "The session ended before the request ran",
        ),
        SessionError::Canceled => ("CANCELED", "The request was canceled"),
        SessionError::Busy => ("BUSY", "The vault is busy; try again"),
        _ => ("RUNTIME_UNAVAILABLE", "The vault runtime is unavailable"),
    };
    RpcResponse::error(message, Some(code))
}

#[cfg(all(test, feature = "fixture"))]
#[path = "android_provider_tests.rs"]
mod tests;
