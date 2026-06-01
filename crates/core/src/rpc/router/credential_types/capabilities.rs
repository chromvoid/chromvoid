use crate::error::ErrorCode;
use crate::rpc::types::{
    CredentialProviderCapability, CredentialProviderCapabilityMatrix,
    CredentialProviderCommandErrorMap, CredentialProviderPasskeysLiteStatus,
    CredentialProviderPasskeysLiteStatusMatrix,
};

pub(in crate::rpc::router) fn capability_matrix() -> CredentialProviderCapabilityMatrix {
    CredentialProviderCapabilityMatrix {
        ios: CredentialProviderCapability {
            password_provider: true,
            passkeys_lite: true,
            autofill_fallback: false,
            unsupported_reason: None,
        },
        android: CredentialProviderCapability {
            password_provider: true,
            passkeys_lite: true,
            autofill_fallback: true,
            unsupported_reason: None,
        },
        macos: CredentialProviderCapability {
            password_provider: true,
            passkeys_lite: true,
            autofill_fallback: false,
            unsupported_reason: None,
        },
        windows: CredentialProviderCapability {
            password_provider: false,
            passkeys_lite: false,
            autofill_fallback: false,
            unsupported_reason: Some(
                "Credential provider adapter is not implemented on Windows".to_string(),
            ),
        },
    }
}

pub(in crate::rpc::router) fn passkeys_lite_status_matrix(
) -> CredentialProviderPasskeysLiteStatusMatrix {
    CredentialProviderPasskeysLiteStatusMatrix {
        ios: CredentialProviderPasskeysLiteStatus {
            create: "SUPPORTED".to_string(),
            get: "SUPPORTED".to_string(),
            unsupported_reason: None,
        },
        android: CredentialProviderPasskeysLiteStatus {
            create: "SUPPORTED".to_string(),
            get: "SUPPORTED".to_string(),
            unsupported_reason: None,
        },
        macos: CredentialProviderPasskeysLiteStatus {
            create: "SUPPORTED".to_string(),
            get: "SUPPORTED".to_string(),
            unsupported_reason: None,
        },
        windows: CredentialProviderPasskeysLiteStatus {
            create: "UNSUPPORTED".to_string(),
            get: "UNSUPPORTED".to_string(),
            unsupported_reason: Some(
                "Credential provider adapter is not implemented on Windows".to_string(),
            ),
        },
    }
}

fn error_codes(codes: &[ErrorCode]) -> Vec<String> {
    codes.iter().map(|code| code.as_str().to_string()).collect()
}

pub(in crate::rpc::router) fn command_error_map() -> CredentialProviderCommandErrorMap {
    CredentialProviderCommandErrorMap {
        status: Vec::new(),
        session_open: error_codes(&[
            ErrorCode::ProviderDisabled,
            ErrorCode::VaultRequired,
            ErrorCode::ProviderUnavailable,
        ]),
        session_close: error_codes(&[ErrorCode::EmptyPayload]),
        list: error_codes(&[
            ErrorCode::ProviderDisabled,
            ErrorCode::VaultRequired,
            ErrorCode::InvalidContext,
        ]),
        search: error_codes(&[
            ErrorCode::ProviderDisabled,
            ErrorCode::VaultRequired,
            ErrorCode::InvalidContext,
        ]),
        get_secret: error_codes(&[
            ErrorCode::ProviderDisabled,
            ErrorCode::VaultRequired,
            ErrorCode::EmptyPayload,
            ErrorCode::ProviderSessionExpired,
            ErrorCode::AccessDenied,
            ErrorCode::NoMatch,
            ErrorCode::InvalidContext,
        ]),
        record_use: error_codes(&[
            ErrorCode::ProviderDisabled,
            ErrorCode::VaultRequired,
            ErrorCode::EmptyPayload,
            ErrorCode::ProviderSessionExpired,
            ErrorCode::AccessDenied,
            ErrorCode::NoMatch,
            ErrorCode::InvalidContext,
        ]),
        passkey_create: vec![
            ErrorCode::EmptyPayload.as_str().to_string(),
            ErrorCode::ProviderDisabled.as_str().to_string(),
            ErrorCode::VaultRequired.as_str().to_string(),
            ErrorCode::ProviderUnavailable.as_str().to_string(),
            ErrorCode::AccessDenied.as_str().to_string(),
            ErrorCode::NoMatch.as_str().to_string(),
            ErrorCode::InvalidContext.as_str().to_string(),
            "UNSUPPORTED".to_string(),
        ],
        passkey_get: vec![
            ErrorCode::EmptyPayload.as_str().to_string(),
            ErrorCode::ProviderDisabled.as_str().to_string(),
            ErrorCode::VaultRequired.as_str().to_string(),
            ErrorCode::ProviderUnavailable.as_str().to_string(),
            ErrorCode::AccessDenied.as_str().to_string(),
            ErrorCode::NoMatch.as_str().to_string(),
            ErrorCode::InvalidContext.as_str().to_string(),
            "UNSUPPORTED".to_string(),
        ],
        passkey_query: vec![
            ErrorCode::EmptyPayload.as_str().to_string(),
            ErrorCode::ProviderDisabled.as_str().to_string(),
            ErrorCode::VaultRequired.as_str().to_string(),
            ErrorCode::ProviderUnavailable.as_str().to_string(),
            ErrorCode::NoMatch.as_str().to_string(),
            ErrorCode::InvalidContext.as_str().to_string(),
            "UNSUPPORTED".to_string(),
        ],
    }
}

pub(in crate::rpc::router) fn passkey_unsupported_reason(
    platform: &str,
    platform_version_major: Option<u64>,
) -> String {
    let normalized = platform.trim().to_ascii_lowercase();
    match normalized.as_str() {
        "ios" => {
            if platform_version_major.unwrap_or(0) < 17 {
                "UNSUPPORTED: passkeys_lite requires iOS 17+".to_string()
            } else {
                "UNSUPPORTED: passkeys_lite create/get handshake remains adapter-owned".to_string()
            }
        }
        "android" => {
            if platform_version_major.unwrap_or(0) < 34 {
                "UNSUPPORTED: passkeys_lite requires Android API 34+".to_string()
            } else {
                "UNSUPPORTED: passkeys_lite create/get handshake remains adapter-owned".to_string()
            }
        }
        "macos" => {
            if platform_version_major.unwrap_or(0) < 14 {
                "UNSUPPORTED: passkeys_lite requires macOS 14+".to_string()
            } else {
                "UNSUPPORTED: passkeys_lite create/get handshake remains adapter-owned".to_string()
            }
        }
        "windows" => {
            "UNSUPPORTED: Credential provider adapter is not implemented on Windows".to_string()
        }
        _ => format!("UNSUPPORTED: unknown platform '{platform}'"),
    }
}
