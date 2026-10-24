//! Split media decoding with one pending admission and revocable snapshot ownership.
use super::*;
use chromvoid_core::catalog::CatalogMediaInfo;
use chromvoid_core::rpc::CatalogMediaInspectSnapshot;
use chromvoid_core::rpc::types::RpcResponse;
use zeroize::Zeroize;

type InspectionResult = (Option<CatalogMediaInfo>, u64);

pub(super) struct OwnedSnapshot(CatalogMediaInspectSnapshot);
impl Drop for OwnedSnapshot {
    fn drop(&mut self) {
        self.0.vault_key.zeroize();
    }
}

#[derive(Default)]
pub(super) struct MediaInspectionState {
    snapshot: Option<OwnedSnapshot>,
    result: Option<InspectionResult>,
}

#[derive(Clone)]
pub(super) struct InspectionCancellation {
    request: Arc<AtomicBool>,
    dispatcher: CoreRpcDispatcher,
    epoch: u64,
}
impl InspectionCancellation {
    fn is_canceled(&self) -> bool {
        if self.dispatcher.low_priority_cancellation_generation() != self.epoch {
            self.request.store(true, Ordering::Release);
        }
        self.request.load(Ordering::Acquire)
    }
}

pub(super) enum MediaInspectionWork {
    Prepare {
        state: Arc<Mutex<MediaInspectionState>>,
        prepared: Option<OwnedSnapshot>,
    },
    Commit {
        state: Arc<Mutex<MediaInspectionState>>,
        cancellation: InspectionCancellation,
    },
}

impl MediaInspectionWork {
    pub(super) fn execute(
        &mut self,
        adapter: &mut LocalCoreAdapter,
        request: &RpcRequest,
    ) -> OwnedRpcResponse {
        let response = match self {
            Self::Prepare { prepared, .. } => {
                let Some(node_id) = request
                    .data
                    .get("node_id")
                    .and_then(serde_json::Value::as_u64)
                else {
                    // Preserve Core's exact required-field error without copying its parser.
                    return OwnedRpcResponse(adapter.handle(request));
                };
                match adapter.snapshot_catalog_media_inspect(node_id) {
                    Some(Ok(snapshot)) => {
                        *prepared = Some(OwnedSnapshot(snapshot));
                        RpcResponse::success(serde_json::Value::Null)
                    }
                    Some(Err(response)) => response,
                    None => {
                        RpcResponse::error("Media snapshot unavailable", Some("INTERNAL_ERROR"))
                    }
                }
            }
            Self::Commit {
                state,
                cancellation,
            } => {
                if cancellation.is_canceled() {
                    return OwnedRpcResponse(RpcResponse::error(
                        "Media inspection canceled",
                        Some("INTERNAL_ERROR"),
                    ));
                }
                let MediaInspectionState { snapshot, result } = std::mem::take(
                    &mut *state
                        .lock()
                        .unwrap_or_else(std::sync::PoisonError::into_inner),
                );
                let (Some(snapshot), Some((media_info, revision))) = (snapshot, result) else {
                    return OwnedRpcResponse(RpcResponse::error(
                        "Media inspection unavailable",
                        Some("INTERNAL_ERROR"),
                    ));
                };
                adapter
                    .commit_catalog_media_inspect(&snapshot.0, media_info, revision)
                    .unwrap_or_else(|| {
                        RpcResponse::error("Media commit unavailable", Some("INTERNAL_ERROR"))
                    })
            }
        };
        OwnedRpcResponse(response)
    }

    pub(super) fn publish(&mut self) -> Result<(), SessionError> {
        if let Self::Prepare { state, prepared } = self {
            state
                .lock()
                .map_err(|_| SessionError::Unavailable)?
                .snapshot = prepared.take();
        }
        Ok(())
    }
}

fn check<'a>(
    inner: &'a Inner,
    generation: u64,
    cancel: &AtomicBool,
) -> Result<std::sync::MutexGuard<'a, Authority>, SessionError> {
    let authority = inner
        .authority
        .lock()
        .map_err(|_| SessionError::Unavailable)?;
    if !authority.accepts(generation) {
        return Err(SessionError::Revoked);
    }
    if cancel.load(Ordering::Acquire) {
        return Err(SessionError::Canceled);
    }
    Ok(authority)
}

fn phase(admitted: &AdmittedRequest, work: MediaInspectionWork) -> AdmittedRequest {
    AdmittedRequest {
        generation: admitted.generation,
        request: OwnedRequest(admitted.request.0.clone()),
        cancel: admitted.cancel.clone(),
        pending: admitted.pending.clone(),
        resource_work: Some(ResourceWork::MediaInspection(work)),
        import_lease: None,
    }
}

/// The callable is the existing Core decoder; tests can control the duration of that
/// execution seam while still exercising real snapshot, authority and commit ownership.
fn inspect(
    state: &Mutex<MediaInspectionState>,
    pending: &PendingRequest,
    generation: u64,
    cancel: &AtomicBool,
    decode: impl FnOnce(&CatalogMediaInspectSnapshot, &AtomicBool) -> InspectionResult,
) -> Result<(), SessionError> {
    let snapshot = {
        let _authority = check(&pending.inner, generation, cancel)?;
        state
            .lock()
            .map_err(|_| SessionError::Unavailable)?
            .snapshot
            .take()
            .ok_or(SessionError::Unavailable)?
    };
    // No authority/resource/Core adapter lock spans decoding. The owned snapshot is
    // destroyed if revocation races the work, and never re-enters state after revoke.
    let result = decode(&snapshot.0, cancel);
    let _authority = check(&pending.inner, generation, cancel)?;
    *state.lock().map_err(|_| SessionError::Unavailable)? = MediaInspectionState {
        snapshot: Some(snapshot),
        result: Some(result),
    };
    Ok(())
}

pub(super) async fn execute(
    inner: Arc<Inner>,
    dispatcher: CoreRpcDispatcher,
    admitted: AdmittedRequest,
) -> Result<OwnedRpcResponse, SessionError> {
    if !Arc::ptr_eq(&inner, &admitted.pending.inner) {
        return Err(SessionError::RequestId);
    }
    let mut cancellation = CancelOnDrop {
        inner: &inner,
        dispatcher: &dispatcher,
        id: admitted.pending.id,
        completed: false,
    };
    let inspection_cancellation = InspectionCancellation {
        request: admitted.cancel.clone(),
        dispatcher: dispatcher.clone(),
        epoch: dispatcher.low_priority_cancellation_generation(),
    };
    let state = Arc::new(Mutex::new(MediaInspectionState::default()));
    {
        let mut authority = check(&inner, admitted.generation, &admitted.cancel)?;
        authority
            .pending
            .get_mut(&admitted.pending.id)
            .ok_or(SessionError::Revoked)?
            .media = Some(state.clone());
    }
    let response = LocalSession::execute_admitted_phase(
        inner.clone(),
        dispatcher.clone(),
        phase(
            &admitted,
            MediaInspectionWork::Prepare {
                state: state.clone(),
                prepared: None,
            },
        ),
    )
    .await?;
    if !response.is_ok() {
        cancellation.completed = true;
        return Ok(response);
    }
    let worker_state = state.clone();
    let pending = admitted.pending.clone();
    let generation = admitted.generation;
    let cancel = admitted.cancel.clone();
    let decoder_cancellation = inspection_cancellation.clone();
    tokio::task::spawn_blocking(move || {
        inspect(
            &worker_state,
            &pending,
            generation,
            &cancel,
            |snapshot, _| {
                decoder_cancellation.is_canceled();
                let result = snapshot.inspect_metadata(|| decoder_cancellation.is_canceled());
                decoder_cancellation.is_canceled();
                result
            },
        )
    })
    .await
    .map_err(|_| SessionError::Unavailable)??;
    let response = LocalSession::execute_admitted_phase(
        inner.clone(),
        dispatcher.clone(),
        phase(
            &admitted,
            MediaInspectionWork::Commit {
                state,
                cancellation: inspection_cancellation,
            },
        ),
    )
    .await?;
    cancellation.completed = true;
    Ok(response)
}

#[cfg(test)]
#[path = "media_inspection_tests.rs"]
mod tests;
