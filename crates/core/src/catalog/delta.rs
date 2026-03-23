//! Delta encoding for incremental catalog updates

use serde::{Deserialize, Serialize};

#[cfg(feature = "ts-bindings")]
use ts_rs::TS;

use super::CatalogNode;

pub const MAX_DELTAS: u32 = 100;
pub const MAX_DELTA_SIZE: usize = 256 * 1024; // 256KB

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum DeltaOp {
    Create {
        node: CatalogNode,
    },
    Update {
        fields: PartialNode,
    },
    Delete,
    Move {
        new_parent: String,
        new_name: Option<String>,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
pub struct PartialNode {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "ts-bindings", ts(type = "number | null"))]
    pub size: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mime_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "ts-bindings", ts(type = "number | null"))]
    pub modtime: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
pub struct DeltaEntry {
    #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
    pub seq: u64,
    #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
    pub ts: u64,
    pub op: DeltaOp,
    pub path: String,

    #[serde(skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "ts-bindings", ts(type = "number | null"))]
    pub node_id: Option<u64>,
}

impl DeltaEntry {
    pub fn create(seq: u64, path: impl Into<String>, node: CatalogNode) -> Self {
        let node_id = node.node_id;
        Self {
            seq,
            ts: current_timestamp(),
            op: DeltaOp::Create { node },
            path: path.into(),
            node_id: Some(node_id),
        }
    }

    pub fn update(seq: u64, path: impl Into<String>, fields: PartialNode) -> Self {
        Self {
            seq,
            ts: current_timestamp(),
            op: DeltaOp::Update { fields },
            path: path.into(),
            node_id: None,
        }
    }

    pub fn delete(seq: u64, path: impl Into<String>) -> Self {
        Self {
            seq,
            ts: current_timestamp(),
            op: DeltaOp::Delete,
            path: path.into(),
            node_id: None,
        }
    }

    pub fn move_node(
        seq: u64,
        path: impl Into<String>,
        new_parent: impl Into<String>,
        new_name: Option<String>,
    ) -> Self {
        Self {
            seq,
            ts: current_timestamp(),
            op: DeltaOp::Move {
                new_parent: new_parent.into(),
                new_name,
            },
            path: path.into(),
            node_id: None,
        }
    }

    pub fn with_node_id(mut self, node_id: u64) -> Self {
        self.node_id = Some(node_id);
        self
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
pub struct DeltaLog {
    pub shard_id: String,
    #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
    pub from_version: u64,
    #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
    pub to_version: u64,
    pub entries: Vec<DeltaEntry>,
}

impl DeltaLog {
    pub fn new(shard_id: impl Into<String>) -> Self {
        Self {
            shard_id: shard_id.into(),
            from_version: 0,
            to_version: 0,
            entries: Vec::new(),
        }
    }

    pub fn push(&mut self, entry: DeltaEntry) {
        self.to_version = entry.seq;
        self.entries.push(entry);
    }

    pub fn is_empty(&self) -> bool {
        self.entries.is_empty()
    }

    pub fn len(&self) -> usize {
        self.entries.len()
    }

    pub fn should_compact(&self) -> bool {
        self.entries.len() >= MAX_DELTAS as usize
    }

    pub fn clear(&mut self) {
        self.entries.clear();
        self.from_version = self.to_version;
    }
}

pub fn apply_delta(root: &mut CatalogNode, delta: &DeltaEntry) -> bool {
    match &delta.op {
        DeltaOp::Create { node } => {
            if let Some(parent) = find_node_mut(root, &delta.path) {
                if parent.is_dir() {
                    parent.add_child(node.clone());
                    return true;
                }
            }
            false
        }
        DeltaOp::Update { fields } => {
            if let Some(node) = find_node_mut(root, &delta.path) {
                if let Some(ref name) = fields.name {
                    node.name = name.clone();
                }
                if let Some(size) = fields.size {
                    node.size = size;
                }
                if let Some(ref mime_type) = fields.mime_type {
                    node.mime_type = Some(mime_type.clone());
                }
                if let Some(modtime) = fields.modtime {
                    node.modtime = modtime;
                }
                return true;
            }
            false
        }
        DeltaOp::Delete => {
            let parts: Vec<&str> = delta.path.rsplitn(2, '/').collect();
            if parts.len() == 2 {
                let (name, parent_path) = (parts[0], parts[1]);
                let parent_path = if parent_path.is_empty() {
                    "/"
                } else {
                    parent_path
                };
                if let Some(parent) = find_node_mut(root, parent_path) {
                    if let Some(children) = parent.children_mut() {
                        let original_len = children.len();
                        children.retain(|c| c.name != name);
                        return children.len() < original_len;
                    }
                }
            }
            false
        }
        DeltaOp::Move {
            new_parent,
            new_name,
        } => {
            let parts: Vec<&str> = delta.path.rsplitn(2, '/').collect();
            if parts.len() != 2 {
                return false;
            }
            let (name, old_parent_path) = (parts[0], parts[1]);
            let old_parent_path = if old_parent_path.is_empty() {
                "/"
            } else {
                old_parent_path
            };

            let mut node_to_move: Option<CatalogNode> = None;
            if let Some(old_parent) = find_node_mut(root, old_parent_path) {
                if let Some(children) = old_parent.children_mut() {
                    if let Some(pos) = children.iter().position(|c| c.name == name) {
                        node_to_move = Some(children.remove(pos));
                    }
                }
            }

            if let Some(mut node) = node_to_move {
                if let Some(ref new_n) = new_name {
                    node.name = new_n.clone();
                }
                if let Some(new_parent_node) = find_node_mut(root, new_parent) {
                    return new_parent_node.add_child(node);
                }
            }
            false
        }
    }
}

pub fn apply_deltas(root: &mut CatalogNode, deltas: &[DeltaEntry]) -> u32 {
    let mut applied = 0;
    for delta in deltas {
        if apply_delta(root, delta) {
            applied += 1;
        }
    }
    applied
}

fn find_node_mut<'a>(root: &'a mut CatalogNode, path: &str) -> Option<&'a mut CatalogNode> {
    if path == "/" || path.is_empty() {
        return Some(root);
    }

    let path = path.trim_start_matches('/');
    let parts: Vec<&str> = path.split('/').collect();

    let mut current = root;
    for part in parts {
        current = current.find_child_mut(part)?;
    }
    Some(current)
}

fn current_timestamp() -> u64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

#[cfg(test)]
#[path = "delta_tests.rs"]
mod tests;
