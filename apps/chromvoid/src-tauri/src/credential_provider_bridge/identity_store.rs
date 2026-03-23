use objc2::AnyThread;
use serde_json::{json, Value};
use tracing::{error, info, warn};

use chromvoid_core::rpc::types::{RpcRequest, RpcResponse};

/// Sync credentials to ASCredentialIdentityStore on vault unlock.
/// Collects all password entries and registers them so macOS AutoFill
/// knows which credentials we can provide.
pub fn sync_credential_identities_on_unlock(_app_handle: &tauri::AppHandle) {
    info!("credential_provider_bridge: syncing credential identities on vault unlock");

    let Some(adapter_handle) = super::shared_app_adapter() else {
        warn!("credential_provider_bridge: shared app adapter is not registered");
        return;
    };

    let candidates = match adapter_handle.lock() {
        Ok(mut adapter) => {
            let req = RpcRequest::new(
                "credential_provider:list".to_string(),
                json!({ "context": { "kind": "web", "domain": "" } }),
            );
            let resp = adapter.handle(&req);
            match resp {
                RpcResponse::Success { result, .. } => result
                    .get("candidates")
                    .and_then(|v| v.as_array())
                    .cloned()
                    .unwrap_or_default(),
                RpcResponse::Error { error, .. } => {
                    warn!(
                        "credential_provider_bridge: failed to list credentials: {}",
                        error
                    );
                    Vec::new()
                }
            }
        }
        Err(_) => {
            error!("credential_provider_bridge: adapter mutex poisoned");
            Vec::new()
        }
    };

    replace_credential_identities(&candidates);
}

/// Clear credential identities on vault lock.
pub fn clear_credential_identities_on_lock() {
    info!("credential_provider_bridge: clearing credential identities on vault lock");
    remove_all_credential_identities();
}

/// Replace all identities in ASCredentialIdentityStore with the given candidates.
fn replace_credential_identities(candidates: &[Value]) {
    use objc2_authentication_services::{
        ASCredentialIdentityStore, ASCredentialServiceIdentifier,
        ASCredentialServiceIdentifierType, ASPasswordCredentialIdentity,
    };
    use objc2_foundation::NSString;

    let count = candidates.len();

    unsafe {
        let store = ASCredentialIdentityStore::sharedStore();

        let identities: Vec<objc2::rc::Retained<ASPasswordCredentialIdentity>> = candidates
            .iter()
            .filter_map(|c| {
                let credential_id = c.get("credential_id")?.as_str()?;
                let username = c.get("username").and_then(|v| v.as_str()).unwrap_or("");
                let domain = c.get("domain").and_then(|v| v.as_str()).unwrap_or("");

                if domain.is_empty() {
                    return None;
                }

                let service_id = ASCredentialServiceIdentifier::initWithIdentifier_type(
                    ASCredentialServiceIdentifier::alloc(),
                    &NSString::from_str(domain),
                    ASCredentialServiceIdentifierType::Domain,
                );

                let identity =
                    ASPasswordCredentialIdentity::initWithServiceIdentifier_user_recordIdentifier(
                        ASPasswordCredentialIdentity::alloc(),
                        &service_id,
                        &NSString::from_str(username),
                        Some(&NSString::from_str(credential_id)),
                    );

                Some(identity)
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

        store.replaceCredentialIdentitiesWithIdentities_completion(&ns_array, Some(&completion));
    }
}

/// Remove all credential identities from ASCredentialIdentityStore.
fn remove_all_credential_identities() {
    use objc2_authentication_services::ASCredentialIdentityStore;

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
