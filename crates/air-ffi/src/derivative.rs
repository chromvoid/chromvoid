//! Vault-encrypted image derivatives (preview/thumbnail) for the native host. The body is
//! drained on the Core worker under session authority and handed over exactly once.
use super::{AirReply, AirRuntime, BridgeError, LocalSession, map_error};
use chromvoid_client_runtime::session::peer_stream::{
    AdmittedPeerDownload, DerivativeReadError, MAX_DERIVATIVE_BYTES,
};
use std::sync::{Arc, Mutex, OnceLock};
use zeroize::Zeroizing;

/// Derivative conversion runs Core phases through Tokio blocking tasks; UniFFI polls from Swift
/// without a reactor, so one small runtime hosts these futures for the process lifetime.
fn worker() -> Result<&'static tokio::runtime::Runtime, BridgeError> {
    static RUNTIME: OnceLock<Option<tokio::runtime::Runtime>> = OnceLock::new();
    RUNTIME
        .get_or_init(|| {
            tokio::runtime::Builder::new_multi_thread()
                .worker_threads(1)
                .thread_name("air-derivative")
                .enable_all()
                .build()
                .ok()
        })
        .as_ref()
        .ok_or(BridgeError::RuntimeUnavailable)
}

enum DerivativeSlot {
    Admitted(AdmittedPeerDownload),
    Running,
    Ready(Zeroizing<Vec<u8>>),
    Closed,
}

#[derive(uniffi::Object)]
pub struct AirDerivative {
    session: Arc<LocalSession>,
    slot: Mutex<DerivativeSlot>,
    request_id: u64,
    generation: u64,
}

#[uniffi::export]
impl AirRuntime {
    pub fn derivative_limit_bytes(&self) -> u64 {
        MAX_DERIVATIVE_BYTES as u64
    }

    /// `ensure` converts and stores the derivative when it is missing; otherwise only an
    /// existing one is read and a missing one is an ordinary Core error reply.
    pub fn begin_derivative(
        &self,
        request_id: u64,
        generation: u64,
        node_id: u64,
        source_version: u64,
        tier: String,
        ensure: bool,
    ) -> Result<Arc<AirDerivative>, BridgeError> {
        let download = self
            .session
            .admit_derivative(
                request_id,
                generation,
                node_id,
                source_version,
                &tier,
                ensure,
            )
            .map_err(map_error)?;
        Ok(Arc::new(AirDerivative {
            session: self.session.clone(),
            slot: Mutex::new(DerivativeSlot::Admitted(download)),
            request_id,
            generation,
        }))
    }
}

#[uniffi::export]
impl AirDerivative {
    /// Reply carries Core's stream metadata on success, or Core's JSON error; bytes wait in
    /// `take_bytes`.
    pub async fn finish(&self) -> Result<AirReply, BridgeError> {
        let download = {
            let mut slot = self
                .slot
                .lock()
                .map_err(|_| BridgeError::RuntimeUnavailable)?;
            match std::mem::replace(&mut *slot, DerivativeSlot::Running) {
                DerivativeSlot::Admitted(download) => download,
                previous => {
                    *slot = previous;
                    return Err(BridgeError::InvalidRequestId);
                }
            }
        };
        let outcome = match worker()?
            .spawn(self.session.execute_derivative(download))
            .await
        {
            Ok(outcome) => outcome,
            Err(_) => {
                if let Ok(mut slot) = self.slot.lock() {
                    *slot = DerivativeSlot::Closed;
                }
                return Err(BridgeError::RuntimeUnavailable);
            }
        };
        let mut slot = self
            .slot
            .lock()
            .map_err(|_| BridgeError::RuntimeUnavailable)?;
        let (response, bytes) = match outcome {
            Ok((response, bytes)) => (response, Some(bytes)),
            Err(DerivativeReadError::Response(response)) => (response, None),
            Err(DerivativeReadError::Session(error)) => {
                *slot = DerivativeSlot::Closed;
                return Err(map_error(error));
            }
            Err(DerivativeReadError::TooLarge) => {
                *slot = DerivativeSlot::Closed;
                return Err(BridgeError::DerivativeTooLarge);
            }
            Err(DerivativeReadError::Incomplete) => {
                *slot = DerivativeSlot::Closed;
                return Err(BridgeError::RuntimeUnavailable);
            }
        };
        let payload = serde_json::to_vec(&response).map_err(|_| BridgeError::RuntimeUnavailable)?;
        if self.session.snapshot().map_err(map_error)?.generation != self.generation {
            *slot = DerivativeSlot::Closed;
            return Err(BridgeError::SessionRevoked);
        }
        *slot = match bytes {
            Some(bytes) => DerivativeSlot::Ready(bytes),
            None => DerivativeSlot::Closed,
        };
        Ok(AirReply {
            request_id: self.request_id,
            generation: self.generation,
            payload,
        })
    }

    /// One consume per successful finish; the foreign caller owns the returned bytes.
    pub fn take_bytes(&self) -> Result<Vec<u8>, BridgeError> {
        let snapshot = self.session.snapshot().map_err(map_error)?;
        if snapshot.generation != self.generation
            || snapshot.phase != chromvoid_client_runtime::session::SessionPhase::Unlocked
        {
            return Err(BridgeError::SessionRevoked);
        }
        let mut slot = self
            .slot
            .lock()
            .map_err(|_| BridgeError::RuntimeUnavailable)?;
        match std::mem::replace(&mut *slot, DerivativeSlot::Closed) {
            DerivativeSlot::Ready(mut bytes) => Ok(std::mem::take(&mut *bytes)),
            previous => {
                *slot = previous;
                Err(BridgeError::InvalidDerivativeState)
            }
        }
    }

    pub fn cancel(&self) -> Result<(), BridgeError> {
        if let Ok(mut slot) = self.slot.lock() {
            *slot = DerivativeSlot::Closed;
        }
        let _ = self.session.cancel(self.request_id);
        Ok(())
    }
}
