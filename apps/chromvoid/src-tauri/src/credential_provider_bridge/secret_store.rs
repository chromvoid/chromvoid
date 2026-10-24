use chromvoid_client_runtime::provider::secret_ref_for_request;
use serde_json::Value;
use zeroize::Zeroizing;

const KEYCHAIN_SERVICE: &str = "com.chromvoid.credential-provider.secret";
const KEYCHAIN_ACCESS_GROUP: &str = "com.chromvoid.app.shared";

pub(super) fn store_response(request_id: &str, result: &Value) -> Result<String, String> {
    let secret_ref = secret_ref_for_request(request_id)?;
    let bytes = Zeroizing::new(
        serde_json::to_vec(result)
            .map_err(|error| format!("credential secret serialization failed: {error}"))?,
    );
    write_secret(&secret_ref, &bytes)?;
    Ok(secret_ref)
}

pub(super) fn clear_secret_ref(request_id: &str) {
    if let Ok(secret_ref) = secret_ref_for_request(request_id) {
        let _ = delete_secret(&secret_ref);
    }
}

#[cfg(any(target_os = "ios", target_os = "macos"))]
fn keychain_options(
    secret_ref: &str,
) -> Result<security_framework::passwords::PasswordOptions, String> {
    let mut options = security_framework::passwords::PasswordOptions::new_generic_password(
        KEYCHAIN_SERVICE,
        secret_ref,
    );
    options.set_access_group(&resolved_keychain_access_group()?);
    options.set_access_synchronized(Some(false));
    #[cfg(not(target_os = "macos"))]
    options.use_protected_keychain();
    Ok(options)
}

#[cfg(any(target_os = "ios", target_os = "macos"))]
fn write_secret(secret_ref: &str, bytes: &[u8]) -> Result<(), String> {
    security_framework::passwords::set_generic_password_options(
        bytes,
        keychain_options(secret_ref)?,
    )
    .map_err(|error| format!("credential secret keychain write failed: {error}"))
}

#[cfg(not(any(target_os = "ios", target_os = "macos")))]
fn write_secret(_secret_ref: &str, _bytes: &[u8]) -> Result<(), String> {
    Err("credential secret keychain is unavailable on this platform".to_string())
}

#[cfg(any(target_os = "ios", target_os = "macos"))]
fn delete_secret(secret_ref: &str) -> Result<(), String> {
    security_framework::passwords::delete_generic_password_options(keychain_options(secret_ref)?)
        .map_err(|error| format!("credential secret keychain delete failed: {error}"))
}

#[cfg(not(any(target_os = "ios", target_os = "macos")))]
fn delete_secret(_secret_ref: &str) -> Result<(), String> {
    Ok(())
}

#[cfg(any(target_os = "ios", target_os = "macos"))]
fn resolved_keychain_access_group() -> Result<String, String> {
    use objc2_foundation::{NSBundle, NSString};

    let key = NSString::from_str("ChromVoidSharedKeychainAccessGroup");
    let value = NSBundle::mainBundle()
        .objectForInfoDictionaryKey(&key)
        .ok_or_else(|| "credential secret keychain access group is not configured".to_string())?;
    let group = value
        .downcast::<NSString>()
        .map_err(|_| "credential secret keychain access group has unexpected shape".to_string())?;
    matching_keychain_access_group([group.to_string()])
        .ok_or_else(|| "credential secret keychain shared access group is missing".to_string())
}

fn matching_keychain_access_group(groups: impl IntoIterator<Item = String>) -> Option<String> {
    groups.into_iter().find(|group| {
        group == KEYCHAIN_ACCESS_GROUP || group.ends_with(&format!(".{KEYCHAIN_ACCESS_GROUP}"))
    })
}

#[cfg(test)]
mod tests {
    use super::matching_keychain_access_group;

    #[test]
    fn keychain_access_group_prefers_entitlement_value_with_app_prefix() {
        let groups = vec![
            "TEAMID.com.example.other".to_string(),
            "TEAMID.com.chromvoid.app.shared".to_string(),
        ];

        assert_eq!(
            matching_keychain_access_group(groups).as_deref(),
            Some("TEAMID.com.chromvoid.app.shared")
        );
    }
}
