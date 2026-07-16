use objc2::AnyThread;
use serde_json::{json, Value};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;
use tauri::Manager;
use tracing::{error, info, warn};

use super::identity_candidate::{project_credential_identities, CredentialIdentityProjection};
use crate::task_lifecycle::EventTaskName;
use chromvoid_core::rpc::types::{RpcRequest, RpcResponse};

const IDENTITY_SYNC_DEBOUNCE: Duration = Duration::from_millis(350);
static IDENTITY_SYNC_GENERATION: AtomicU64 = AtomicU64::new(0);

/// Sync credentials to ASCredentialIdentityStore on vault unlock.
/// Collects all password entries and registers them so macOS AutoFill
/// knows which credentials we can provide.
pub fn schedule_credential_identity_sync_on_unlock(app_handle: &tauri::AppHandle) {
    info!("credential_provider_bridge: scheduling credential identity sync on vault unlock");
    schedule_credential_identity_sync(app_handle, Duration::ZERO);
}

pub fn schedule_credential_identity_sync_for_policy(app_handle: &tauri::AppHandle) {
    info!("credential_provider_bridge: scheduling credential identity sync after policy refresh");
    schedule_credential_identity_sync(app_handle, Duration::ZERO);
}

pub fn schedule_credential_identity_sync_after_mutation(app_handle: &tauri::AppHandle) {
    schedule_credential_identity_sync(app_handle, IDENTITY_SYNC_DEBOUNCE);
}

fn schedule_credential_identity_sync(app_handle: &tauri::AppHandle, delay: Duration) {
    let Some(state) = app_handle.try_state::<crate::app_state::AppState>() else {
        warn!("credential_provider_bridge: AppState is not available");
        return;
    };
    let task_lifecycle = state.task_lifecycle.clone();
    let app_handle = app_handle.clone();
    let generation = IDENTITY_SYNC_GENERATION.fetch_add(1, Ordering::AcqRel) + 1;

    if let Err(error) = task_lifecycle.spawn_event_async(
        EventTaskName::CredentialIdentitySyncAfterUnlock,
        move |mut shutdown_rx| async move {
            if !delay.is_zero() {
                tokio::select! {
                    _ = tokio::time::sleep(delay) => {}
                    changed = shutdown_rx.changed() => {
                        if changed.is_ok() && shutdown_rx.borrow().is_some() {
                            return;
                        }
                    }
                }
            }
            if generation != IDENTITY_SYNC_GENERATION.load(Ordering::Acquire) {
                return;
            }
            tokio::select! {
                changed = shutdown_rx.changed() => {
                    if changed.is_ok() && shutdown_rx.borrow().is_some() {
                        info!(
                            "credential_provider_bridge: credential identity sync skipped during shutdown"
                        );
                    }
                }
                result = tauri::async_runtime::spawn_blocking(move || {
                    sync_credential_identities_on_unlock_blocking(&app_handle);
                }) => {
                    if let Err(error) = result {
                        warn!(
                            "credential_provider_bridge: credential identity sync task failed: {error}"
                        );
                    }
                }
            }
        },
    ) {
        warn!("credential_provider_bridge: credential identity sync was not scheduled: {error}");
    }
}

pub fn cancel_credential_identity_sync(app_handle: &tauri::AppHandle) {
    IDENTITY_SYNC_GENERATION.fetch_add(1, Ordering::AcqRel);
    let Some(state) = app_handle.try_state::<crate::app_state::AppState>() else {
        warn!("credential_provider_bridge: AppState is not available");
        return;
    };

    match state
        .task_lifecycle
        .cancel_event_tasks(EventTaskName::CredentialIdentitySyncAfterUnlock)
    {
        Ok(canceled) if canceled > 0 => {
            info!(
                "credential_provider_bridge: canceled {} pending credential identity sync task(s)",
                canceled
            );
        }
        Ok(_) => {}
        Err(error) => {
            warn!("credential_provider_bridge: credential identity sync cancel failed: {error}");
        }
    }
}

fn sync_credential_identities_on_unlock_blocking(app_handle: &tauri::AppHandle) {
    info!("credential_provider_bridge: syncing credential identities on vault unlock");

    let Some(state) = app_handle.try_state::<crate::app_state::AppState>() else {
        warn!("credential_provider_bridge: AppState is not available");
        return;
    };
    let adapter_handle = state.adapter.clone();

    let candidates = match adapter_handle.lock() {
        Ok(mut adapter) => {
            if !adapter.is_unlocked() {
                info!("credential_provider_bridge: clearing credential identities, vault locked");
                drop(adapter);
                remove_all_credential_identities();
                return;
            }
            if !matches!(adapter.mode(), crate::core_adapter::CoreMode::Local) {
                info!(
                    "credential_provider_bridge: clearing credential identities outside local Core mode"
                );
                drop(adapter);
                remove_all_credential_identities();
                return;
            }
            let caps = crate::types::runtime_capabilities_for_current_target();
            if let Err(error) = crate::pro::guard_pro_feature_for_adapter(
                adapter.as_mut(),
                chromvoid_core::license::PRO_FEATURE_CREDENTIAL_PROVIDER,
                &caps,
            ) {
                let denial_code = match error {
                    crate::types::RpcResult::Error { code, .. } => code,
                    crate::types::RpcResult::Success { .. } => None,
                };
                info!(
                    denial_code = denial_code.as_deref().unwrap_or("ENTITLEMENT_UNAVAILABLE"),
                    "credential_provider_bridge: clearing credential identities after policy denial"
                );
                drop(adapter);
                remove_all_credential_identities();
                return;
            }
            let req = credential_identity_sync_request();
            let resp = adapter.handle(&req);
            if !adapter.is_unlocked() {
                info!("credential_provider_bridge: clearing credential identities after RPC, vault locked");
                drop(adapter);
                remove_all_credential_identities();
                return;
            }
            credential_identity_sync_candidates(resp)
        }
        Err(_) => {
            error!("credential_provider_bridge: adapter mutex poisoned");
            return;
        }
    };

    let adapter = match adapter_handle.lock() {
        Ok(adapter) => adapter,
        Err(_) => {
            error!("credential_provider_bridge: adapter mutex poisoned");
            return;
        }
    };
    if !adapter.is_unlocked() {
        info!("credential_provider_bridge: clearing credential identities before replace, vault locked");
        drop(adapter);
        remove_all_credential_identities();
        return;
    }
    let include_one_time_codes =
        supports_one_time_code_identity_api() && super::otp_policy::otp_autofill_rollout_enabled();
    replace_credential_identities(&candidates, include_one_time_codes);
}

fn credential_identity_sync_request() -> RpcRequest {
    RpcRequest::new(
        "credential_provider:search".to_string(),
        json!({ "query": "" }),
    )
}

fn credential_identity_sync_candidates(resp: RpcResponse) -> Vec<Value> {
    match resp {
        RpcResponse::Success { result, .. } => result
            .get("candidates")
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_default(),
        RpcResponse::Error { error, .. } => {
            warn!(
                "credential_provider_bridge: failed to search credentials: {}",
                error
            );
            Vec::new()
        }
    }
}

/// Clear credential identities on vault lock.
pub fn clear_credential_identities_on_lock() {
    info!("credential_provider_bridge: clearing credential identities on vault lock");
    remove_all_credential_identities();
}

/// Replace all identities in ASCredentialIdentityStore with the given candidates.
fn replace_credential_identities(candidates: &[Value], include_one_time_codes: bool) {
    use objc2::runtime::ProtocolObject;
    use objc2_authentication_services::{
        ASCredentialIdentity, ASCredentialIdentityStore, ASCredentialServiceIdentifier,
        ASCredentialServiceIdentifierType, ASOneTimeCodeCredentialIdentity,
        ASPasswordCredentialIdentity,
    };
    use objc2_foundation::NSString;

    let projections = project_credential_identities(candidates, include_one_time_codes);
    let count = projections.len();

    // SAFETY: objc2 ObjC API; sharedStore returns a +0 singleton; identities array and completion block
    // outlive the call (completion is RcBlock-owned).
    unsafe {
        let store = ASCredentialIdentityStore::sharedStore();

        let identities: Vec<objc2::rc::Retained<ProtocolObject<dyn ASCredentialIdentity>>> =
            projections
                .iter()
                .map(|projection| {
                    let (domain, label, record_identifier, is_otp) = match projection {
                        CredentialIdentityProjection::Password {
                            credential_id,
                            username,
                            domain,
                        } => (domain, username, credential_id, false),
                        CredentialIdentityProjection::OneTimeCode {
                            label,
                            domain,
                            record_identifier,
                        } => (domain, label, record_identifier, true),
                    };
                    let service_id = ASCredentialServiceIdentifier::initWithIdentifier_type(
                        ASCredentialServiceIdentifier::alloc(),
                        &NSString::from_str(domain),
                        ASCredentialServiceIdentifierType::Domain,
                    );
                    if is_otp {
                        let identity = ASOneTimeCodeCredentialIdentity::initWithServiceIdentifier_label_recordIdentifier(
                            ASOneTimeCodeCredentialIdentity::alloc(),
                            &service_id,
                            &NSString::from_str(label),
                            Some(&NSString::from_str(record_identifier)),
                        );
                        ProtocolObject::from_retained(identity)
                    } else {
                        let identity = ASPasswordCredentialIdentity::initWithServiceIdentifier_user_recordIdentifier(
                            ASPasswordCredentialIdentity::alloc(),
                            &service_id,
                            &NSString::from_str(label),
                            Some(&NSString::from_str(record_identifier)),
                        );
                        ProtocolObject::from_retained(identity)
                    }
                })
                .collect();

        let ns_array = objc2_foundation::NSArray::from_retained_slice(&identities);

        let completion = block2::RcBlock::new(
            move |success: objc2::runtime::Bool, _error: *mut objc2_foundation::NSError| {
                if success.as_bool() {
                    tracing::info!(
                        "credential_provider_bridge: replaced {} credential identities",
                        count
                    );
                } else {
                    tracing::warn!(
                        "credential_provider_bridge: failed to replace credential identities"
                    );
                }
            },
        );

        store.replaceCredentialIdentityEntries_completion(&ns_array, Some(&completion));
    }
}

fn supports_one_time_code_identity_api() -> bool {
    #[cfg(target_os = "macos")]
    {
        objc2_foundation::NSProcessInfo::processInfo()
            .operatingSystemVersion()
            .majorVersion
            >= 15
    }
    #[cfg(not(target_os = "macos"))]
    {
        false
    }
}

/// Remove all credential identities from ASCredentialIdentityStore.
fn remove_all_credential_identities() {
    use objc2_authentication_services::ASCredentialIdentityStore;

    // SAFETY: objc2 ObjC API; sharedStore returns a +0 singleton; completion block outlives the call (RcBlock-owned).
    unsafe {
        let store = ASCredentialIdentityStore::sharedStore();

        let completion = block2::RcBlock::new(
            |success: objc2::runtime::Bool, _error: *mut objc2_foundation::NSError| {
                if success.as_bool() {
                    tracing::info!("credential_provider_bridge: cleared all credential identities");
                } else {
                    tracing::warn!(
                        "credential_provider_bridge: failed to clear credential identities"
                    );
                }
            },
        );

        store.removeAllCredentialIdentitiesWithCompletion(Some(&completion));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn identity_sync_uses_search_without_context() {
        let request = credential_identity_sync_request();

        assert_eq!(request.command, "credential_provider:search");
        assert_eq!(request.data.get("query").and_then(|v| v.as_str()), Some(""));
        assert!(request.data.get("context").is_none());
    }

    #[test]
    fn identity_sync_error_projects_an_empty_fail_closed_snapshot() {
        let candidates = credential_identity_sync_candidates(RpcResponse::error(
            "invalid context",
            Some("INVALID_CONTEXT".to_string()),
        ));

        assert!(candidates.is_empty());
    }
}
