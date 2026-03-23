//! Credential provider types, constants, and static capability data (ADR-020)

use serde::Deserialize;

use crate::error::ErrorCode;
use crate::rpc::types::{
    CredentialProviderCapability, CredentialProviderCapabilityMatrix,
    CredentialProviderCommandErrorMap, CredentialProviderPasskeysLiteStatus,
    CredentialProviderPasskeysLiteStatusMatrix,
};

// ── Constants ────────────────────────────────────────────────────────────────

pub(super) const CREDENTIAL_PROVIDER_ALLOWLIST_TTL_SECS: u64 = 90;
pub(super) const CREDENTIAL_PROVIDER_SESSION_TTL_SECS: u64 = 60;
pub(super) const CREDENTIAL_PROVIDER_SESSION_MAX_SECRET_USES: u8 = 1;

// ── Session ──────────────────────────────────────────────────────────────────

#[derive(Debug, Clone)]
pub(super) struct CredentialProviderSession {
    pub(super) expires_at: std::time::SystemTime,
    pub(super) secret_uses: u8,
}

// ── Match classification ─────────────────────────────────────────────────────

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub(super) enum ProviderMatchKind {
    EtldPlusOne,
    Subdomain,
    Exact,
    App,
}

impl ProviderMatchKind {
    pub(super) fn as_str(self) -> &'static str {
        match self {
            Self::Exact => "exact",
            Self::Subdomain => "subdomain",
            Self::EtldPlusOne => "etld_plus_one",
            Self::App => "app",
        }
    }
}

// ── Context types ────────────────────────────────────────────────────────────

#[derive(Debug, Clone)]
pub(super) struct ProviderContextWeb {
    pub(super) origin_url: url::Url,
    pub(super) domain: String,
}

#[derive(Debug, Clone)]
pub(super) enum ProviderContext {
    Web(ProviderContextWeb),
    App { app_id: String },
}

// ── Passmanager metadata (deserialized from meta.json) ───────────────────────

#[derive(Debug, Clone, Deserialize)]
pub(super) struct PassmanagerUrlRule {
    pub(super) value: String,
    #[serde(default)]
    pub(super) r#match: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(untagged)]
pub(super) enum PassmanagerUrlRuleCompat {
    Rule(PassmanagerUrlRule),
    Value(String),
}

impl PassmanagerUrlRuleCompat {
    pub(super) fn into_rule(self) -> Option<PassmanagerUrlRule> {
        match self {
            Self::Rule(rule) => {
                if rule.value.trim().is_empty() {
                    None
                } else {
                    Some(rule)
                }
            }
            Self::Value(raw) => {
                let value = raw.trim();
                if value.is_empty() {
                    None
                } else {
                    Some(PassmanagerUrlRule {
                        value: value.to_string(),
                        r#match: "base_domain".to_string(),
                    })
                }
            }
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
pub(super) struct PassmanagerOtpMeta {
    #[serde(default)]
    pub(super) id: Option<String>,
    #[serde(default)]
    pub(super) label: Option<String>,
    #[serde(default)]
    #[serde(alias = "otpType")]
    pub(super) r#type: Option<String>,
}

#[derive(Debug, Clone)]
pub(super) enum CredentialProviderOtpResolution {
    ById(String),
    ByLabel(String),
    FirstAvailable,
}

#[derive(Debug, Clone)]
pub(super) struct CredentialProviderOtpOption {
    pub(super) id: String,
    pub(super) label: Option<String>,
    pub(super) otp_type: Option<String>,
    pub(super) resolution: CredentialProviderOtpResolution,
}

#[derive(Debug, Clone, Deserialize)]
pub(super) struct PassmanagerMeta {
    #[serde(default, alias = "entry_id")]
    pub(super) id: Option<String>,
    #[serde(default)]
    pub(super) title: Option<String>,
    #[serde(default)]
    pub(super) username: Option<String>,
    #[serde(default)]
    pub(super) urls: Option<Vec<PassmanagerUrlRuleCompat>>,
    #[serde(default)]
    pub(super) url: Option<String>,
    #[serde(default)]
    pub(super) otps: Option<Vec<PassmanagerOtpMeta>>,
    #[serde(default)]
    #[serde(alias = "appId")]
    pub(super) app_id: Option<String>,
}

// ── Credential entry ─────────────────────────────────────────────────────────

#[derive(Debug, Clone)]
pub(super) struct CredentialProviderEntry {
    pub(super) credential_id: String,
    pub(super) entry_id: String,
    pub(super) label: String,
    pub(super) username: String,
    pub(super) domain: Option<String>,
    pub(super) app_id: Option<String>,
    pub(super) entry_node_id: u64,
    pub(super) password_node_id: Option<u64>,
    pub(super) otp_options: Vec<CredentialProviderOtpOption>,
    pub(super) url_rules: Vec<PassmanagerUrlRule>,
}

// ── Static capability / status matrices ──────────────────────────────────────

pub(super) fn capability_matrix() -> CredentialProviderCapabilityMatrix {
    CredentialProviderCapabilityMatrix {
        ios: CredentialProviderCapability {
            password_provider: true,
            passkeys_lite: false,
            autofill_fallback: false,
            unsupported_reason: Some("passkeys_lite requires iOS 17+".to_string()),
        },
        android: CredentialProviderCapability {
            password_provider: true,
            passkeys_lite: true,
            autofill_fallback: true,
            unsupported_reason: None,
        },
        macos: CredentialProviderCapability {
            password_provider: true,
            passkeys_lite: false,
            autofill_fallback: false,
            unsupported_reason: Some("passkeys_lite requires macOS 14+".to_string()),
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

pub(super) fn passkeys_lite_status_matrix() -> CredentialProviderPasskeysLiteStatusMatrix {
    CredentialProviderPasskeysLiteStatusMatrix {
        ios: CredentialProviderPasskeysLiteStatus {
            create: "UNSUPPORTED".to_string(),
            get: "UNSUPPORTED".to_string(),
            unsupported_reason: Some("passkeys_lite requires iOS 17+".to_string()),
        },
        android: CredentialProviderPasskeysLiteStatus {
            create: "UNSUPPORTED".to_string(),
            get: "UNSUPPORTED".to_string(),
            unsupported_reason: Some("passkeys_lite requires Android API 34+".to_string()),
        },
        macos: CredentialProviderPasskeysLiteStatus {
            create: "UNSUPPORTED".to_string(),
            get: "UNSUPPORTED".to_string(),
            unsupported_reason: Some("passkeys_lite requires macOS 14+".to_string()),
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

pub(super) fn command_error_map() -> CredentialProviderCommandErrorMap {
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
        passkey_create: error_codes(&[ErrorCode::EmptyPayload, ErrorCode::ProviderUnavailable]),
        passkey_get: error_codes(&[ErrorCode::EmptyPayload, ErrorCode::ProviderUnavailable]),
    }
}

pub(super) fn passkey_unsupported_reason(
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
