//! Rust-held erase confirmation and a non-secret receipt independent of revoked authority.
use super::*;
use chromvoid_core::rpc::types::RpcResponse;
use zeroize::Zeroizing;

#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum EraseError {
    #[error(transparent)]
    Session(#[from] SessionError),
    #[error("Erasure is not ready for this operation")]
    State,
}

#[derive(Clone, Debug, PartialEq, Eq, Deserialize)]
pub struct ErasePreview {
    pub storage_paths: Vec<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Deserialize)]
pub struct EraseStatistics {
    pub erased_bytes: u64,
    pub erased_chunks: u64,
    pub time_elapsed_ms: u64,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum EraseReceipt {
    Completed(EraseStatistics),
    /// No arbitrary Core error text or secrets survive the revoked session.
    Incomplete {
        key_cleanup_failed: bool,
        host_cleanup_failed: bool,
    },
}

struct ReviewedErase {
    token: Zeroizing<String>,
    preview: ErasePreview,
}

enum EraseStage {
    Initial,
    Working(u64),
    Reviewed(ReviewedErase),
    Closed,
}

pub(super) struct EraseState {
    stage: EraseStage,
    last_request: u64,
    receipt: Option<EraseReceipt>,
}

impl EraseState {
    pub(super) fn revoke(&mut self) {
        self.stage = EraseStage::Closed;
    }
}

pub struct EraseHandle {
    inner: Arc<Inner>,
    dispatcher: CoreRpcDispatcher,
    generation: u64,
    state: Arc<Mutex<EraseState>>,
}

impl EraseHandle {
    pub fn preview(&self) -> Result<ErasePreview, EraseError> {
        let authority = self
            .inner
            .authority
            .lock()
            .map_err(|_| SessionError::Unavailable)?;
        if !authority.accepts(self.generation) {
            return Err(SessionError::Revoked.into());
        }
        let state = self.state.lock().map_err(|_| SessionError::Unavailable)?;
        match &state.stage {
            EraseStage::Reviewed(review) => Ok(review.preview.clone()),
            _ => Err(EraseError::State),
        }
    }

    /// A receipt is available only after Core actually attempted deletion. Revocation alone
    /// never creates one. Reading it grants no authority to perform another operation.
    pub fn receipt(&self) -> Result<Option<EraseReceipt>, SessionError> {
        Ok(self
            .state
            .lock()
            .map_err(|_| SessionError::Unavailable)?
            .receipt
            .clone())
    }

    pub fn cancel(&self) -> Result<(), SessionError> {
        let authority = self
            .inner
            .authority
            .lock()
            .map_err(|_| SessionError::Unavailable)?;
        let mut state = self.state.lock().map_err(|_| SessionError::Unavailable)?;
        if let EraseStage::Working(id) = state.stage {
            if let Some(request) = authority.pending.get(&RequestKey::Native(id)) {
                request.cancel.store(true, Ordering::Release);
            }
        }
        state.revoke();
        Ok(())
    }

    /// Wait for any admitted worker to finish before reporting the final receipt. If
    /// deletion already started, cancellation cannot roll it back or fabricate success.
    pub async fn cancel_and_wait(&self) -> Result<Option<EraseReceipt>, SessionError> {
        self.cancel()?;
        self.dispatcher
            .run_adapter_phase(
                CoreRpcPriority::PrivacyCritical,
                "erase:execute",
                "storage_erase_completion_wait",
                self.dispatcher.low_priority_cancellation_generation(),
                || (),
            )
            .await
            .map_err(|_| SessionError::Unavailable)?;
        self.receipt()
    }
}

impl Drop for EraseHandle {
    fn drop(&mut self) {
        let _ = self.cancel();
    }
}

impl LocalSession {
    pub fn begin_storage_erase(&self, generation: u64) -> Result<EraseHandle, EraseError> {
        self.ensure_storage_mutation_allowed()?;
        let mut authority = self
            .inner
            .authority
            .lock()
            .map_err(|_| SessionError::Unavailable)?;
        if !authority.accepts(generation) {
            return Err(SessionError::Revoked.into());
        }
        if authority.erase.strong_count() > 0 {
            return Err(SessionError::Busy.into());
        }
        let state = Arc::new(Mutex::new(EraseState {
            stage: EraseStage::Initial,
            last_request: 0,
            receipt: None,
        }));
        authority.erase = Arc::downgrade(&state);
        Ok(EraseHandle {
            inner: self.inner.clone(),
            dispatcher: self.dispatcher.clone(),
            generation,
            state,
        })
    }

    pub fn review_storage_erase(
        &self,
        request_id: u64,
        handle: &EraseHandle,
    ) -> Result<AdmittedRequest, EraseError> {
        self.admit_erase(request_id, handle, EraseOperation::Review)
    }

    pub fn commit_storage_erase(
        &self,
        request_id: u64,
        handle: &EraseHandle,
        master_password: String,
    ) -> Result<AdmittedRequest, EraseError> {
        self.admit_erase(
            request_id,
            handle,
            EraseOperation::Commit(Zeroizing::new(master_password)),
        )
    }

    fn admit_erase(
        &self,
        request_id: u64,
        handle: &EraseHandle,
        operation: EraseOperation,
    ) -> Result<AdmittedRequest, EraseError> {
        self.ensure_storage_mutation_allowed()?;
        if !Arc::ptr_eq(&self.inner, &handle.inner) {
            return Err(SessionError::RequestId.into());
        }
        let mut authority = self
            .inner
            .authority
            .lock()
            .map_err(|_| SessionError::Unavailable)?;
        if !authority.accepts(handle.generation) {
            return Err(SessionError::Revoked.into());
        }
        let mut state = handle.state.lock().map_err(|_| SessionError::Unavailable)?;
        let command = match (&operation, &state.stage) {
            (EraseOperation::Review, EraseStage::Initial) => "erase:confirm",
            (EraseOperation::Commit(_), EraseStage::Reviewed(_)) => "erase:execute",
            _ => return Err(EraseError::State),
        };
        let mut admitted = self.admit_locked(
            &mut authority,
            request_id,
            handle.generation,
            OwnedRequest(RpcRequest::new(command, serde_json::Value::Null)),
        )?;
        let review = match std::mem::replace(&mut state.stage, EraseStage::Working(request_id)) {
            EraseStage::Reviewed(review) => Some(review),
            _ => None,
        };
        state.last_request = request_id;
        admitted.resource_work = Some(ResourceWork::Erase(EraseWork {
            state: handle.state.clone(),
            request_id,
            operation,
            review,
            cancel: admitted.cancel.clone(),
            prepared: None,
            started: false,
            receipt: None,
        }));
        Ok(admitted)
    }
}

enum EraseOperation {
    Review,
    Commit(Zeroizing<String>),
}

pub(super) struct EraseWork {
    state: Arc<Mutex<EraseState>>,
    request_id: u64,
    operation: EraseOperation,
    review: Option<ReviewedErase>,
    cancel: Arc<AtomicBool>,
    prepared: Option<EraseStage>,
    pub(super) started: bool,
    receipt: Option<EraseReceipt>,
}

impl EraseWork {
    pub(super) fn execute(
        &mut self,
        adapter: &mut LocalCoreAdapter,
        on_storage_reset: &mut dyn FnMut(),
    ) -> OwnedRpcResponse {
        let invalid =
            || RpcResponse::error("Erase confirmation is unavailable", Some("INTERNAL_ERROR"));
        match &self.operation {
            EraseOperation::Review => {
                let response = OwnedRpcResponse(
                    adapter.handle(&RpcRequest::new("erase:confirm", serde_json::Value::Null)),
                );
                if !response.is_ok() {
                    return response;
                }
                let Some(value) = response.result() else {
                    return OwnedRpcResponse(invalid());
                };
                let Some(token) = value["erase_token"].as_str() else {
                    return OwnedRpcResponse(invalid());
                };
                let Ok(storage_paths) = serde_json::from_value(value["storage_paths"].clone())
                else {
                    return OwnedRpcResponse(invalid());
                };
                let preview = ErasePreview { storage_paths };
                self.prepared = Some(EraseStage::Reviewed(ReviewedErase {
                    token: Zeroizing::new(token.to_string()),
                    preview,
                }));
                OwnedRpcResponse(RpcResponse::success(serde_json::Value::Null))
            }
            EraseOperation::Commit(password) => {
                let Some(review) = self.review.take() else {
                    return OwnedRpcResponse(invalid());
                };
                let request = OwnedRequest(RpcRequest::new(
                    "erase:execute",
                    serde_json::json!({
                        "erase_token": review.token.as_str(), "master_password": password.as_str()
                    }),
                ));
                let outcome = adapter.handle_cancellable(
                    &request.0,
                    &|| self.cancel.load(Ordering::Acquire),
                    on_storage_reset,
                );
                self.started = outcome.storage_reset_started;
                let response = OwnedRpcResponse(outcome.response);
                if self.started {
                    let receipt = response
                        .result()
                        .and_then(|value| serde_json::from_value(value.clone()).ok())
                        .map(EraseReceipt::Completed)
                        .unwrap_or(EraseReceipt::Incomplete {
                            key_cleanup_failed: response.code() == Some("KEYSTORE_UNAVAILABLE"),
                            host_cleanup_failed: false,
                        });
                    self.receipt = Some(receipt);
                } else if response.code() == Some("INVALID_MASTER_PASSWORD") {
                    self.prepared = Some(EraseStage::Reviewed(review));
                }
                response
            }
        }
    }

    /// Publish only after both Core and the host metadata owner finish cleanup.
    pub(super) fn finish_storage_reset(&mut self, host_cleanup_ok: bool) {
        let receipt = self.receipt.take().map(|receipt| {
            if host_cleanup_ok {
                return receipt;
            }
            let key_cleanup_failed = matches!(
                receipt,
                EraseReceipt::Incomplete {
                    key_cleanup_failed: true,
                    ..
                }
            );
            EraseReceipt::Incomplete {
                key_cleanup_failed,
                host_cleanup_failed: true,
            }
        });
        let mut state = self
            .state
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        state.revoke();
        state.receipt = receipt;
    }

    pub(super) fn publish(&mut self) -> Result<(), SessionError> {
        let mut state = self.state.lock().map_err(|_| SessionError::Unavailable)?;
        if !matches!(state.stage, EraseStage::Working(id) if id == self.request_id) {
            return Err(SessionError::Canceled);
        }
        if let Some(prepared) = self.prepared.take() {
            state.stage = prepared;
        }
        Ok(())
    }
}

impl Drop for EraseWork {
    fn drop(&mut self) {
        let mut state = self
            .state
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        if matches!(state.stage, EraseStage::Working(id) if id == self.request_id) {
            state.revoke();
        }
    }
}

pub(super) fn cancel_resource_request(authority: &Authority, request_id: u64) {
    if let Some(resource) = authority.erase.upgrade() {
        let mut state = resource
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        if state.last_request == request_id {
            state.revoke();
        }
    }
}

#[cfg(test)]
#[path = "storage_erase_tests.rs"]
mod tests;
