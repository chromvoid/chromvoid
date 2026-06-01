use serde::Deserialize;

#[derive(Debug, Default, Deserialize)]
pub(super) struct PassmanagerOtpMeta {
    #[serde(default)]
    pub(super) id: Option<String>,
    #[serde(default)]
    pub(super) label: Option<String>,
}

#[derive(Debug, Default, Deserialize)]
pub(super) struct PassmanagerEntryMeta {
    #[serde(default)]
    pub(super) id: Option<String>,
    #[serde(default)]
    pub(super) otps: Vec<PassmanagerOtpMeta>,
}

#[derive(Clone)]
pub(super) struct CachedOtpMeta {
    pub(super) id: Option<String>,
    pub(super) preferred_label: Option<String>,
}

#[derive(Clone)]
pub(super) struct CachedEntryMeta {
    pub(super) node_id: u64,
    pub(super) entry_id: Option<String>,
    pub(super) otps: Vec<CachedOtpMeta>,
}

#[derive(Clone, PartialEq, Eq)]
pub(super) struct PassmanagerMetaStamp {
    pub(super) entry_node_id: u64,
    pub(super) meta_node_id: u64,
    pub(super) meta_modtime: u64,
    pub(super) meta_size: u64,
}

#[derive(Default)]
pub(in crate::rpc::router) struct PassmanagerOtpTargetCache {
    pub(super) storage_ptr: usize,
    pub(super) vault_fingerprint: u64,
    pub(super) stamp: Vec<PassmanagerMetaStamp>,
    pub(super) entries: Vec<CachedEntryMeta>,
    pub(super) ready: bool,
}

#[derive(Clone, Copy)]
pub(in crate::rpc::router) struct PassmanagerOtpTargetRequest<'a> {
    pub(in crate::rpc::router) otp_id: Option<&'a str>,
    pub(in crate::rpc::router) entry_id: Option<&'a str>,
    pub(in crate::rpc::router) fallback_label: Option<&'a str>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub(in crate::rpc::router) struct ResolvedOtpTarget {
    pub(in crate::rpc::router) node_id: u64,
    pub(in crate::rpc::router) label: String,
}

pub(super) fn normalize_non_empty(value: Option<&str>) -> Option<&str> {
    value.map(str::trim).filter(|s| !s.is_empty())
}

pub(super) fn normalize_non_empty_owned(value: Option<&str>) -> Option<String> {
    normalize_non_empty(value).map(ToString::to_string)
}
