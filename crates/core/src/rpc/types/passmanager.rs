//! Shared wire response for native and existing passmanager consumers.
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "mobile-schema", derive(schemars::JsonSchema))]
pub struct PassmanagerEntryListResponse {
    pub entries: Vec<serde_json::Value>,
    pub folders: Vec<String>,
}

impl PassmanagerEntryListResponse {
    pub fn new(entries: Vec<serde_json::Value>, folders: Vec<String>) -> Self {
        Self { entries, folders }
    }
}

/// Bounded projection for catalog clients. Secret values and arbitrary metadata are excluded.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "mobile-schema", derive(schemars::JsonSchema))]
#[cfg_attr(feature = "ts-bindings", derive(ts_rs::TS))]
pub struct CredentialSummary {
    pub id: String,
    pub title: String,
    pub username: String,
    pub entry_type: String,
    pub group_path: String,
    /// Present only for grouped catalog requests; translated by the native presentation owner.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "ts-bindings", ts(optional))]
    pub group_key: Option<String>,
    /// Digest of the entry icon in the vault icon store, when the entry has one.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "ts-bindings", ts(optional))]
    pub icon_ref: Option<String>,
    /// Host of the first website of the entry, for the catalog row.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "ts-bindings", ts(optional))]
    pub website: Option<String>,
    /// `true` when the entry carries one-time code records; omitted otherwise.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "ts-bindings", ts(optional))]
    pub has_codes: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "mobile-schema", derive(schemars::JsonSchema))]
#[cfg_attr(feature = "ts-bindings", derive(ts_rs::TS))]
#[serde(deny_unknown_fields)]
pub struct PassmanagerEntryPageRequest {
    pub offset: u32,
    pub limit: u32,
    pub query: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "ts-bindings", ts(optional))]
    pub group_path: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "ts-bindings", ts(optional))]
    pub sort: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "ts-bindings", ts(optional))]
    pub descending: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "ts-bindings", ts(optional))]
    pub entry_type: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "ts-bindings", ts(optional))]
    pub tag_key: Option<String>,
    /// AND-combined metadata filters: recent (14 days), otp, ssh.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "ts-bindings", ts(optional))]
    pub quick_filters: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "ts-bindings", ts(optional))]
    pub group_by: Option<String>,
    /// Fixed milliseconds since epoch for modification-time grouping across pages.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "ts-bindings", ts(optional))]
    pub grouping_time: Option<u64>,
}

/// Offset refers to the requested stable order (catalog node order when sort is omitted), not the number of matches.
/// Callers must restart at zero when the authorized catalog is invalidated.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "mobile-schema", derive(schemars::JsonSchema))]
#[cfg_attr(feature = "ts-bindings", derive(ts_rs::TS))]
pub struct PassmanagerEntryPageResponse {
    pub entries: Vec<CredentialSummary>,
    pub next_offset: Option<u32>,
    /// Matching entries in the whole scope. Present for sorted or grouped requests, which read
    /// the scope completely; absent in catalog order, where reading stops at the page.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "ts-bindings", ts(optional))]
    pub total_count: Option<u32>,
}

/// Request of `passmanager:icon:getMany`: the icon digests to load, at most 64 per call.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "mobile-schema", derive(schemars::JsonSchema))]
pub struct PassmanagerIconGetManyRequest {
    pub icon_refs: Vec<String>,
}

/// One stored icon: the normalized image bytes and their type.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "mobile-schema", derive(schemars::JsonSchema))]
pub struct PassmanagerIconRecord {
    pub icon_ref: String,
    pub mime_type: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub background_color: Option<String>,
    pub content_base64: String,
}

/// Response of `passmanager:icon:getMany`: the icons found and the digests that are not stored.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "mobile-schema", derive(schemars::JsonSchema))]
pub struct PassmanagerIconGetManyResponse {
    pub icons: Vec<PassmanagerIconRecord>,
    pub missing_icon_refs: Vec<String>,
}

/// Atomic creation payload shared by the existing RPC and generated native facade.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "mobile-schema", derive(schemars::JsonSchema))]
#[cfg_attr(feature = "ts-bindings", derive(ts_rs::TS))]
pub struct PassmanagerEntryCreateRequest {
    pub entry_id: String,
    /// Blank for a payment card: Core names it from its network and last four digits
    /// (`Visa •••• 1111`), numbered if that name is taken in the group.
    pub title: String,
    pub entry_type: String,
    #[cfg_attr(feature = "ts-bindings", ts(type = "number | null"))]
    pub created_ts: Option<u64>,
    #[cfg_attr(feature = "ts-bindings", ts(type = "number | null"))]
    pub updated_ts: Option<u64>,
    pub urls: Option<serde_json::Value>,
    pub username: Option<String>,
    pub otps: Option<serde_json::Value>,
    pub payment_card: Option<serde_json::Value>,
    pub group_path: Option<String>,
    pub icon_ref: Option<String>,
    pub tags: Option<Vec<String>>,
    pub tag_keys: Option<Vec<String>>,
    pub secrets: super::PassmanagerEntryCreateSecrets,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "mobile-schema", derive(schemars::JsonSchema))]
#[cfg_attr(feature = "ts-bindings", derive(ts_rs::TS))]
pub struct PassmanagerEntrySaveResponse {
    pub entry_id: String,
}

impl PassmanagerEntrySaveResponse {
    pub fn new(entry_id: String) -> Self {
        Self { entry_id }
    }
}

/// Canonical payment-card metadata; PAN and CVV are stored separately as secrets.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "mobile-schema", derive(schemars::JsonSchema))]
#[cfg_attr(feature = "ts-bindings", derive(ts_rs::TS))]
pub struct PaymentCardMetadata {
    pub cardholder_name: String,
    #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
    pub exp_month: u64,
    #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
    pub exp_year: u64,
    pub brand: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last4: Option<String>,
}

/// Metadata-only detail. The opaque revision covers persisted metadata and its catalog path.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "mobile-schema", derive(schemars::JsonSchema))]
#[cfg_attr(feature = "ts-bindings", derive(ts_rs::TS))]
pub struct CredentialDetail {
    pub id: String,
    pub title: String,
    pub entry_type: String,
    pub username: String,
    pub group_path: String,
    pub websites: Vec<String>,
    pub websites_editable: bool,
    pub tags: Vec<String>,
    pub tag_keys: Vec<String>,
    pub payment_card: Option<PaymentCardMetadata>,
    pub revision: String,
}

/// Strict metadata patch. Omitted fields are retained; type and card last4 are not writable here.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "mobile-schema", derive(schemars::JsonSchema))]
#[cfg_attr(feature = "ts-bindings", derive(ts_rs::TS))]
#[serde(deny_unknown_fields)]
pub struct PassmanagerEntryUpdateRequest {
    pub entry_id: String,
    pub revision: String,
    pub tag_keys: Option<Vec<String>>,
    /// Blank for a payment card gives it back the name Core chooses from its network and last
    /// four digits; that name then follows a replaced number.
    pub title: Option<String>,
    pub username: Option<String>,
    pub group_path: Option<String>,
    pub websites: Option<Vec<String>>,
    pub cardholder_name: Option<String>,
    #[cfg_attr(feature = "ts-bindings", ts(type = "number | null"))]
    pub exp_month: Option<u64>,
    #[cfg_attr(feature = "ts-bindings", ts(type = "number | null"))]
    pub exp_year: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "mobile-schema", derive(schemars::JsonSchema))]
#[cfg_attr(feature = "ts-bindings", derive(ts_rs::TS))]
pub struct PassmanagerSecretReadResponse {
    pub value: String,
}
impl PassmanagerSecretReadResponse {
    pub fn new(value: String) -> Self {
        Self { value }
    }
}

/// Immediate children of an existing group, bounded for native metadata transport.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "mobile-schema", derive(schemars::JsonSchema))]
#[cfg_attr(feature = "ts-bindings", derive(ts_rs::TS))]
#[serde(deny_unknown_fields)]
pub struct PassmanagerGroupPageRequest {
    pub parent: String,
    pub offset: u32,
    pub limit: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "mobile-schema", derive(schemars::JsonSchema))]
#[cfg_attr(feature = "ts-bindings", derive(ts_rs::TS))]
pub struct PassmanagerGroupPageResponse {
    pub parent: String,
    pub groups: Vec<super::PassmanagerGroupSummary>,
    pub next_offset: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "mobile-schema", derive(schemars::JsonSchema))]
#[cfg_attr(feature = "ts-bindings", derive(ts_rs::TS))]
#[serde(deny_unknown_fields)]
pub struct PassmanagerGroupRenameRequest {
    pub path: String,
    pub name: String,
}

/// Metadata-only catalog merged with tags assigned to credentials.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "mobile-schema", derive(schemars::JsonSchema))]
#[cfg_attr(feature = "ts-bindings", derive(ts_rs::TS))]
pub struct CredentialTagSummary {
    pub key: String,
    pub label: String,
    pub color_id: String,
    pub count: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "mobile-schema", derive(schemars::JsonSchema))]
#[cfg_attr(feature = "ts-bindings", derive(ts_rs::TS))]
#[serde(deny_unknown_fields)]
pub struct PassmanagerTagPageRequest {
    pub offset: u32,
    pub limit: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "mobile-schema", derive(schemars::JsonSchema))]
#[cfg_attr(feature = "ts-bindings", derive(ts_rs::TS))]
pub struct PassmanagerTagPageResponse {
    pub tags: Vec<CredentialTagSummary>,
    pub next_offset: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "mobile-schema", derive(schemars::JsonSchema))]
#[cfg_attr(feature = "ts-bindings", derive(ts_rs::TS))]
#[serde(deny_unknown_fields)]
pub struct PassmanagerTagSaveRequest {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "ts-bindings", ts(optional))]
    pub source_key: Option<String>,
    pub label: String,
    pub color_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "mobile-schema", derive(schemars::JsonSchema))]
#[cfg_attr(feature = "ts-bindings", derive(ts_rs::TS))]
#[serde(deny_unknown_fields)]
pub struct PassmanagerTagDeleteRequest {
    pub key: String,
}

/// Entry-scoped OTP management; secrets never appear in list responses.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "mobile-schema", derive(schemars::JsonSchema))]
#[cfg_attr(feature = "ts-bindings", derive(ts_rs::TS))]
#[serde(deny_unknown_fields)]
pub struct PassmanagerOtpRecordsRequest {
    pub entry_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "mobile-schema", derive(schemars::JsonSchema))]
#[cfg_attr(feature = "ts-bindings", derive(ts_rs::TS))]
pub struct CredentialOtpSummary {
    pub label: String,
    pub encoding: String,
    pub algorithm: String,
    pub otp_type: String,
    pub digits: u8,
    pub period: u32,
    pub counter: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "mobile-schema", derive(schemars::JsonSchema))]
#[cfg_attr(feature = "ts-bindings", derive(ts_rs::TS))]
pub struct PassmanagerOtpRecordsResponse {
    pub revision: String,
    pub records: Vec<CredentialOtpSummary>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "mobile-schema", derive(schemars::JsonSchema))]
#[cfg_attr(feature = "ts-bindings", derive(ts_rs::TS))]
#[serde(deny_unknown_fields)]
pub struct PassmanagerOtpRecordSaveRequest {
    pub entry_id: String,
    pub revision: String,
    pub source_label: Option<String>,
    pub secret: Option<String>,
    pub settings: CredentialOtpSummary,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "mobile-schema", derive(schemars::JsonSchema))]
#[cfg_attr(feature = "ts-bindings", derive(ts_rs::TS))]
#[serde(deny_unknown_fields)]
pub struct PassmanagerOtpRecordRequest {
    pub entry_id: String,
    pub revision: String,
    pub label: String,
}

/// Parse supplied setup material without reading or writing a stored seed.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "mobile-schema", derive(schemars::JsonSchema))]
#[cfg_attr(feature = "ts-bindings", derive(ts_rs::TS))]
#[serde(deny_unknown_fields)]
pub struct PassmanagerOtpUriRequest {
    pub uri: String,
    pub fallback_label: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "mobile-schema", derive(schemars::JsonSchema))]
#[cfg_attr(feature = "ts-bindings", derive(ts_rs::TS))]
pub struct PassmanagerOtpUriResponse {
    pub settings: CredentialOtpSummary,
    pub secret: String,
    pub issuer: String,
    pub account: String,
}

/// Transient generation settings; the output is saved only by a separate credential command.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "mobile-schema", derive(schemars::JsonSchema))]
#[cfg_attr(feature = "ts-bindings", derive(ts_rs::TS))]
#[serde(deny_unknown_fields)]
pub struct PassmanagerPasswordGenerateRequest {
    pub length: u16,
    pub lowercase: bool,
    pub uppercase: bool,
    pub digits: bool,
    pub symbols: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "mobile-schema", derive(schemars::JsonSchema))]
#[cfg_attr(feature = "ts-bindings", derive(ts_rs::TS))]
pub struct PassmanagerPasswordGenerateResponse {
    pub password: String,
}

/// A fresh, read-only vault-wide audit. Continuation requires the returned revision.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "mobile-schema", derive(schemars::JsonSchema))]
#[cfg_attr(feature = "ts-bindings", derive(ts_rs::TS))]
#[serde(deny_unknown_fields)]
pub struct PassmanagerSecurityAuditPageRequest {
    pub offset: u32,
    pub limit: u32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "ts-bindings", ts(optional))]
    pub revision: Option<String>,
    /// weak, reused, without_otp, failed; omitted for all entries.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "ts-bindings", ts(optional))]
    pub issue: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "mobile-schema", derive(schemars::JsonSchema))]
#[cfg_attr(feature = "ts-bindings", derive(ts_rs::TS))]
pub struct CredentialSecurityAuditRow {
    pub credential: CredentialSummary,
    /// Null means the password could not be checked; never interpret as safe.
    pub audit: Option<super::CredentialAuditEntrySummary>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "mobile-schema", derive(schemars::JsonSchema))]
#[cfg_attr(feature = "ts-bindings", derive(ts_rs::TS))]
pub struct PassmanagerSecurityAuditPageResponse {
    pub algorithm_version: u8,
    pub revision: String,
    pub entries: Vec<CredentialSecurityAuditRow>,
    pub next_offset: Option<u32>,
    pub total_count: u32,
    pub failed_count: u32,
    pub weak_password_count: u32,
    pub reused_password_count: u32,
    pub two_factor_count: u32,
}
