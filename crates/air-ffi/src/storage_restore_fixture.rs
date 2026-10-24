//! A fresh blank target for backup→restore XCTest, never a production storage route.
use crate::BridgeError;

#[uniffi::export]
pub fn open_storage_restore_test_runtime(
    expected_fingerprint: String,
    storage_root: String,
    test_id: String,
) -> Result<std::sync::Arc<super::AirRuntime>, BridgeError> {
    #[cfg(not(all(target_os = "ios", debug_assertions)))]
    {
        let _ = (expected_fingerprint, storage_root, test_id);
        Err(BridgeError::FixtureUnavailable)
    }
    #[cfg(all(target_os = "ios", debug_assertions))]
    {
        if super::application_identity().as_deref()
            != Some("com.chromvoid.iosair.dev.bridge-host.fixture")
        {
            return Err(BridgeError::InvalidApplicationIdentity);
        }
        if test_id.len() != 36
            || !test_id
                .bytes()
                .all(|byte| byte.is_ascii_hexdigit() || byte == b'-')
        {
            return Err(BridgeError::InvalidStorageRoot);
        }
        super::AirRuntime::open(expected_fingerprint, storage_root, move |root| {
            let parent = root.join(".restore-test-targets");
            std::fs::create_dir_all(&parent).map_err(|error| error.to_string())?;
            let target = parent.join(test_id);
            // Refuse reuse; only this invocation's newly-created target may be cleaned on failure.
            std::fs::create_dir(&target).map_err(|error| error.to_string())?;
            let result = chromvoid_client_runtime::LocalCoreAdapter::new_with_restore_test_store(
                target.clone(),
            );
            if result.is_err() {
                let _ = std::fs::remove_dir_all(&target);
            }
            result
        })
        .map(std::sync::Arc::new)
    }
}
