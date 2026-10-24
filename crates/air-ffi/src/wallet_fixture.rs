//! Offline wallet fixtures through real Core, restricted to the isolated XCTest host, the
//! dedicated UI test host, and the Android development client its instrumentation runs in.
//! They exist only in debug fixture builds.
use crate::BridgeError;

#[uniffi::export]
pub fn open_wallet_test_runtime(
    expected_fingerprint: String,
    storage_root: String,
) -> Result<std::sync::Arc<super::AirRuntime>, BridgeError> {
    open_wallet_fixture(expected_fingerprint, storage_root, WalletFixture::Setup)
}

#[uniffi::export]
pub fn open_wallet_history_test_runtime(
    expected_fingerprint: String,
    storage_root: String,
) -> Result<std::sync::Arc<super::AirRuntime>, BridgeError> {
    open_wallet_fixture(expected_fingerprint, storage_root, WalletFixture::History)
}

#[uniffi::export]
pub fn open_wallet_send_test_runtime(
    expected_fingerprint: String,
    storage_root: String,
) -> Result<std::sync::Arc<super::AirRuntime>, BridgeError> {
    open_wallet_fixture(expected_fingerprint, storage_root, WalletFixture::Send)
}

enum WalletFixture {
    Setup,
    History,
    Send,
}

fn open_wallet_fixture(
    expected_fingerprint: String,
    storage_root: String,
    fixture: WalletFixture,
) -> Result<std::sync::Arc<super::AirRuntime>, BridgeError> {
    #[cfg(not(all(any(target_os = "ios", target_os = "android"), debug_assertions)))]
    {
        let _ = (expected_fingerprint, storage_root, fixture);
        Err(BridgeError::FixtureUnavailable)
    }
    #[cfg(all(any(target_os = "ios", target_os = "android"), debug_assertions))]
    {
        // The isolated XCTest host drives the fixtures directly; the dedicated UI test host
        // opens the same runtime as its ordinary AccessModel runtime for the wallet UI tests.
        // Android instrumentation runs inside the development client itself.
        if !matches!(
            super::application_identity().as_deref(),
            Some(
                "com.chromvoid.iosair.dev.bridge-host.fixture"
                    | "com.chromvoid.iosair.dev.tests.fixture"
                    | "com.chromvoid.air.dev"
            )
        ) {
            return Err(BridgeError::InvalidApplicationIdentity);
        }
        let adapter: fn(
            std::path::PathBuf,
        ) -> Result<chromvoid_client_runtime::LocalCoreAdapter, String> = match fixture {
            WalletFixture::Setup => |root| {
                chromvoid_client_runtime::LocalCoreAdapter::new(root)
                    .map(chromvoid_client_runtime::LocalCoreAdapter::with_offline_wallet_fixture)
            },
            WalletFixture::Send => |root| {
                chromvoid_client_runtime::LocalCoreAdapter::new(root)
                    .map(chromvoid_client_runtime::LocalCoreAdapter::with_wallet_send_fixture)
            },
            WalletFixture::History => |root| {
                chromvoid_client_runtime::LocalCoreAdapter::new(root)
                    .map(chromvoid_client_runtime::LocalCoreAdapter::with_wallet_history_fixture)
            },
        };
        super::AirRuntime::open(expected_fingerprint, storage_root, adapter)
            .map(std::sync::Arc::new)
    }
}
