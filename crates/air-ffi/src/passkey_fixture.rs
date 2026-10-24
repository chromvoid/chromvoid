//! Synthetic setup for the dedicated UI test host only; absent from production builds.
use crate::BridgeError;

/// The one host a passkey UI fixture may seed: the iOS UI test host, or the Android development
/// client its instrumentation runs in.
#[cfg(target_os = "ios")]
const PASSKEY_UI_IDENTITY: &str = "com.chromvoid.iosair.dev.tests.fixture";
#[cfg(all(target_os = "android", debug_assertions))]
const PASSKEY_UI_IDENTITY: &str = "com.chromvoid.air.dev";

#[uniffi::export]
pub async fn prepare_passkey_ui_fixture(
    expected_fingerprint: String,
    storage_root: String,
    password: String,
) -> Result<(), BridgeError> {
    let password = zeroize::Zeroizing::new(password);
    #[cfg(not(any(target_os = "ios", all(target_os = "android", debug_assertions))))]
    {
        let _ = (expected_fingerprint, storage_root, password);
        Err(BridgeError::UnsupportedPlatform)
    }
    #[cfg(any(target_os = "ios", all(target_os = "android", debug_assertions)))]
    {
        if super::application_identity().as_deref() != Some(PASSKEY_UI_IDENTITY) {
            return Err(BridgeError::InvalidApplicationIdentity);
        }
        // Seed through the ordinary Core and real OS keystore the UI subsequently opens.
        let runtime = super::AirRuntime::open(
            expected_fingerprint,
            storage_root,
            chromvoid_client_runtime::LocalCoreAdapter::new,
        )?;
        eprintln!("passkey UI fixture: runtime opened");
        let result = seed(&runtime, &password).await;
        let mut snapshot = runtime.shutdown()?;
        while snapshot.cleanup_pending {
            snapshot = runtime.events(snapshot.sequence).await?.snapshot;
        }
        result
    }
}

/// Provider integration runtime for the isolated XCTest host, and for the Android development
/// client its instrumentation runs in. Only those fixture identities may open it.
#[uniffi::export]
pub fn open_provider_test_runtime(
    expected_fingerprint: String,
    storage_root: String,
) -> Result<std::sync::Arc<super::AirRuntime>, BridgeError> {
    #[cfg(not(any(target_os = "ios", all(target_os = "android", debug_assertions))))]
    {
        let _ = (expected_fingerprint, storage_root);
        Err(BridgeError::UnsupportedPlatform)
    }
    #[cfg(any(target_os = "ios", all(target_os = "android", debug_assertions)))]
    {
        #[cfg(target_os = "ios")]
        const PROVIDER_TEST_IDENTITY: &str = "com.chromvoid.iosair.dev.bridge-host.fixture";
        #[cfg(target_os = "android")]
        const PROVIDER_TEST_IDENTITY: &str = "com.chromvoid.air.dev";
        if super::application_identity().as_deref() != Some(PROVIDER_TEST_IDENTITY) {
            return Err(BridgeError::InvalidApplicationIdentity);
        }
        super::AirRuntime::open(
            expected_fingerprint,
            storage_root,
            chromvoid_client_runtime::LocalCoreAdapter::new,
        )
        .map(std::sync::Arc::new)
    }
}

#[cfg(any(target_os = "ios", all(target_os = "android", debug_assertions)))]
async fn seed(runtime: &super::AirRuntime, password: &str) -> Result<(), BridgeError> {
    use chromvoid_core::rpc::types::RpcRequest;
    use serde_json::json;

    // The platform Core checks a passkey ceremony against: iOS 17 or Android 14 and later.
    #[cfg(target_os = "ios")]
    const PLATFORM: (&str, u64) = ("ios", 17);
    #[cfg(target_os = "android")]
    const PLATFORM: (&str, u64) = ("android", 34);
    let snapshot = runtime.activate()?;
    let mut requests = Vec::new();
    if !snapshot.master_configured {
        requests.push(RpcRequest::new(
            "master:setup",
            json!({"master_password": "air-synthetic-ui-administrator"}),
        ));
    }
    requests.push(RpcRequest::new(
        "vault:unlock",
        json!({"password": password}),
    ));
    for (site, name, account, display) in [
        (
            "login.example.test",
            "Example Login",
            "alice@example.test",
            "Alice",
        ),
        ("docs.example.test", "Documents", "bob@example.test", "Боб"),
    ] {
        requests.push(RpcRequest::new(
            "credential_provider:passkey:create",
            json!({
                "platform": PLATFORM.0, "platform_version_major": PLATFORM.1, "userVerified": true,
                "origin": format!("https://{site}"),
                "request": {
                    "rp": {"id": site, "name": name},
                    "user": {"id": "c3ludGhldGljLXVzZXI", "name": account, "displayName": display},
                    "challenge": "c3ludGhldGljLWNoYWxsZW5nZQ",
                    "pubKeyCredParams": [{"type": "public-key", "alg": -7}],
                    "attestation": "none"
                }
            }),
        ));
    }
    // Use the actual Core provider owner without granting provider RPC to the native product.
    for (index, request) in requests.into_iter().enumerate() {
        let generation = runtime
            .session
            .snapshot()
            .map_err(super::map_error)?
            .generation;
        let response = runtime
            .session
            .execute(index as u64 + 1, generation, request)
            .await
            .map_err(super::map_error)?;
        if let chromvoid_core::rpc::types::RpcResponse::Error { code, .. } = &*response {
            eprintln!("passkey UI fixture: request {index} rejected with {code:?}");
        }
        if response.result().is_none() {
            return Err(BridgeError::RuntimeUnavailable);
        }
    }
    Ok(())
}
