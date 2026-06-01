use super::super::error::PassmanagerCommandError;
use serde::{Deserialize, Serialize};

pub(super) const PASSMANAGER_GROUP_META_PATH: &str = "/.passmanager/.groups-meta.json";

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub(in crate::rpc::router::passmanager) struct GroupMetaValue {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(in crate::rpc::router::passmanager) icon_ref: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(in crate::rpc::router::passmanager) description: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub(in crate::rpc::router::passmanager) struct GroupMetaRecord {
    pub(in crate::rpc::router::passmanager) path: String,
    #[serde(flatten)]
    pub(in crate::rpc::router::passmanager) meta: GroupMetaValue,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub(in crate::rpc::router::passmanager) struct GroupMetaFile {
    #[serde(default)]
    pub(in crate::rpc::router::passmanager) groups: Vec<GroupMetaRecord>,
}

pub(in crate::rpc::router::passmanager) type GroupMetaLoadError = PassmanagerCommandError;
