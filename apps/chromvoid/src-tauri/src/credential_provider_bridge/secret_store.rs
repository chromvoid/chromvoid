use serde_json::{json, Value};

const KEYCHAIN_SERVICE: &str = "com.chromvoid.credential-provider.secret";
const KEYCHAIN_ACCESS_GROUP: &str = "com.chromvoid.app.shared";

pub(super) fn secret_ref_result_for_response(
    request_id: &str,
    result: Value,
) -> Result<Value, String> {
    let secret_ref = secret_ref_for_request(request_id)?;
    let bytes = serde_json::to_vec(&result)
        .map_err(|error| format!("credential secret serialization failed: {error}"))?;
    write_secret(&secret_ref, &bytes)?;
    Ok(json!({ "secret_ref": secret_ref }))
}

pub(super) fn clear_secret_ref(request_id: &str) {
    if let Ok(secret_ref) = secret_ref_for_request(request_id) {
        let _ = delete_secret(&secret_ref);
    }
}

fn secret_ref_for_request(request_id: &str) -> Result<String, String> {
    let trimmed = request_id.trim();
    if trimmed.is_empty() {
        return Err("credential secret request_id is empty".to_string());
    }
    Ok(format!("credential-provider-secret:{trimmed}"))
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
    use super::{matching_keychain_access_group, secret_ref_for_request};

    #[test]
    fn secret_ref_is_derived_from_request_id_without_secret_material() {
        assert_eq!(
            secret_ref_for_request("req-1").as_deref(),
            Ok("credential-provider-secret:req-1")
        );
        assert!(secret_ref_for_request(" ").is_err());
    }

    #[test]
    fn clear_secret_ref_uses_request_id_shape() {
        assert_eq!(
            secret_ref_for_request(" req-2 ").as_deref(),
            Ok("credential-provider-secret:req-2")
        );
    }

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
