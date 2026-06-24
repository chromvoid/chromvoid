//! Delta encoding for incremental catalog updates

use serde::{de, Deserialize, Deserializer, Serialize};
use std::fmt;

#[cfg(feature = "ts-bindings")]
use ts_rs::TS;

use super::{CatalogMediaInfo, CatalogNode};

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
    #[serde(
        default,
        deserialize_with = "deserialize_media_info_update",
        skip_serializing_if = "Option::is_none"
    )]
    pub media_info: Option<Option<CatalogMediaInfo>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "ts-bindings", ts(type = "number | null"))]
    pub media_inspected_revision: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "ts-bindings", ts(type = "number | null"))]
    pub modtime: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "ts-bindings", ts(type = "number | null"))]
    pub source_revision: Option<u64>,
}

fn deserialize_media_info_update<'de, D>(
    deserializer: D,
) -> Result<Option<Option<CatalogMediaInfo>>, D::Error>
where
    D: Deserializer<'de>,
{
    struct MediaInfoUpdateVisitor;

    impl<'de> de::Visitor<'de> for MediaInfoUpdateVisitor {
        type Value = Option<Option<CatalogMediaInfo>>;

        fn expecting(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
            formatter.write_str("null or a catalog media info object")
        }

        fn visit_none<E>(self) -> Result<Self::Value, E>
        where
            E: de::Error,
        {
            Ok(Some(None))
        }

        fn visit_unit<E>(self) -> Result<Self::Value, E>
        where
            E: de::Error,
        {
            Ok(Some(None))
        }

        fn visit_some<D>(self, deserializer: D) -> Result<Self::Value, D::Error>
        where
            D: Deserializer<'de>,
        {
            CatalogMediaInfo::deserialize(deserializer).map(|media_info| Some(Some(media_info)))
        }
    }

    deserializer.deserialize_option(MediaInfoUpdateVisitor)
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

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
#[serde(rename_all = "snake_case")]
pub enum CatalogReplayReason {
    MissingSource,
    MissingTargetParent,
    NodeIdMismatch,
    NameCollision,
    InvalidParent,
    MalformedPath,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
pub struct CatalogDeltaReplayFailure {
    #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
    pub seq: u64,
    pub path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[cfg_attr(feature = "ts-bindings", ts(type = "number | null"))]
    pub node_id: Option<u64>,
    pub op: String,
    pub reason: CatalogReplayReason,
}

impl CatalogDeltaReplayFailure {
    fn new(delta: &DeltaEntry, reason: CatalogReplayReason) -> Self {
        Self {
            seq: delta.seq,
            path: delta.path.clone(),
            node_id: delta.node_id,
            op: delta_op_name(&delta.op).to_string(),
            reason,
        }
    }
}

impl fmt::Display for CatalogDeltaReplayFailure {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            f,
            "catalog delta replay failed (seq={} path={} op={} reason={:?})",
            self.seq, self.path, self.op, self.reason
        )
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DeltaApplyOutcome {
    Applied,
    AlreadyApplied,
}

impl DeltaApplyOutcome {
    pub fn is_applied(self) -> bool {
        matches!(self, Self::Applied | Self::AlreadyApplied)
    }

    pub fn is_already_applied(self) -> bool {
        matches!(self, Self::AlreadyApplied)
    }
}

pub fn apply_delta(
    root: &mut CatalogNode,
    delta: &DeltaEntry,
) -> Result<DeltaApplyOutcome, CatalogDeltaReplayFailure> {
    match &delta.op {
        DeltaOp::Create { node } => {
            let Some(parent) = find_node_mut(root, &delta.path) else {
                return Err(CatalogDeltaReplayFailure::new(
                    delta,
                    CatalogReplayReason::MissingTargetParent,
                ));
            };
            if !parent.is_dir() {
                return Err(CatalogDeltaReplayFailure::new(
                    delta,
                    CatalogReplayReason::InvalidParent,
                ));
            }
            if parent
                .children()
                .iter()
                .any(|child| child.node_id == node.node_id && child.name == node.name)
            {
                return Ok(DeltaApplyOutcome::AlreadyApplied);
            }
            if parent
                .children()
                .iter()
                .any(|child| child.name == node.name)
            {
                return Err(CatalogDeltaReplayFailure::new(
                    delta,
                    CatalogReplayReason::NameCollision,
                ));
            }
            if parent
                .children()
                .iter()
                .any(|child| child.node_id == node.node_id)
            {
                return Err(CatalogDeltaReplayFailure::new(
                    delta,
                    CatalogReplayReason::NodeIdMismatch,
                ));
            }
            if parent.add_child(node.clone()) {
                Ok(DeltaApplyOutcome::Applied)
            } else {
                Err(CatalogDeltaReplayFailure::new(
                    delta,
                    CatalogReplayReason::InvalidParent,
                ))
            }
        }
        DeltaOp::Update { fields } => {
            if delta.path.is_empty() {
                return Err(CatalogDeltaReplayFailure::new(
                    delta,
                    CatalogReplayReason::MalformedPath,
                ));
            }
            let Some(node) = find_node_mut(root, &delta.path) else {
                return Err(CatalogDeltaReplayFailure::new(
                    delta,
                    CatalogReplayReason::MissingSource,
                ));
            };
            if delta
                .node_id
                .map(|node_id| node.node_id != node_id)
                .unwrap_or(false)
            {
                return Err(CatalogDeltaReplayFailure::new(
                    delta,
                    CatalogReplayReason::NodeIdMismatch,
                ));
            }
            if let Some(ref name) = fields.name {
                node.name = name.clone();
            }
            if let Some(size) = fields.size {
                node.size = size;
            }
            if let Some(ref mime_type) = fields.mime_type {
                node.mime_type = Some(mime_type.clone());
            }
            if let Some(media_info) = &fields.media_info {
                node.media_info = media_info.clone();
            }
            if let Some(media_inspected_revision) = fields.media_inspected_revision {
                node.media_inspected_revision = media_inspected_revision;
            }
            if let Some(modtime) = fields.modtime {
                node.modtime = modtime;
            }
            if let Some(source_revision) = fields.source_revision {
                node.source_revision = source_revision;
            }
            Ok(DeltaApplyOutcome::Applied)
        }
        DeltaOp::Delete => {
            let Some((parent_path, name)) = split_parent_name(&delta.path) else {
                return Err(CatalogDeltaReplayFailure::new(
                    delta,
                    CatalogReplayReason::MalformedPath,
                ));
            };
            match remove_child_by_name(root, parent_path, name, delta)? {
                DeleteApplyState::Removed => Ok(DeltaApplyOutcome::Applied),
                DeleteApplyState::MissingParent => {
                    if is_absent_node_id(root, delta.node_id) {
                        return Ok(DeltaApplyOutcome::AlreadyApplied);
                    }
                    Err(CatalogDeltaReplayFailure::new(
                        delta,
                        CatalogReplayReason::MissingTargetParent,
                    ))
                }
                DeleteApplyState::MissingChild => {
                    if is_absent_node_id(root, delta.node_id) {
                        return Ok(DeltaApplyOutcome::AlreadyApplied);
                    }
                    Err(CatalogDeltaReplayFailure::new(
                        delta,
                        CatalogReplayReason::MissingSource,
                    ))
                }
            }
        }
        DeltaOp::Move {
            new_parent,
            new_name,
        } => {
            let Some((old_parent_path, name)) = split_parent_name(&delta.path) else {
                return Err(CatalogDeltaReplayFailure::new(
                    delta,
                    CatalogReplayReason::MalformedPath,
                ));
            };
            let target_name = new_name.as_deref().unwrap_or(name);

            let node_to_move = match detach_child_by_name(root, old_parent_path, name, delta)? {
                Some(node) => node,
                None => {
                    if destination_has_node(root, new_parent, target_name, delta.node_id) {
                        return Ok(DeltaApplyOutcome::AlreadyApplied);
                    }
                    return Err(CatalogDeltaReplayFailure::new(
                        delta,
                        CatalogReplayReason::MissingSource,
                    ));
                }
            };

            let mut node = node_to_move;
            if let Some(ref new_n) = new_name {
                node.name = new_n.clone();
            }

            let Some(new_parent_node) = find_node_mut(root, new_parent) else {
                restore_detached_node(root, old_parent_path, name, node, new_name.is_some());
                return Err(CatalogDeltaReplayFailure::new(
                    delta,
                    CatalogReplayReason::MissingTargetParent,
                ));
            };
            if !new_parent_node.is_dir() {
                restore_detached_node(root, old_parent_path, name, node, new_name.is_some());
                return Err(CatalogDeltaReplayFailure::new(
                    delta,
                    CatalogReplayReason::InvalidParent,
                ));
            }
            if new_parent_node
                .children()
                .iter()
                .any(|child| child.name == node.name)
            {
                restore_detached_node(root, old_parent_path, name, node, new_name.is_some());
                return Err(CatalogDeltaReplayFailure::new(
                    delta,
                    CatalogReplayReason::NameCollision,
                ));
            }
            if new_parent_node.add_child(node) {
                Ok(DeltaApplyOutcome::Applied)
            } else {
                Err(CatalogDeltaReplayFailure::new(
                    delta,
                    CatalogReplayReason::InvalidParent,
                ))
            }
        }
    }
}

enum DeleteApplyState {
    Removed,
    MissingParent,
    MissingChild,
}

fn remove_child_by_name(
    root: &mut CatalogNode,
    parent_path: &str,
    name: &str,
    delta: &DeltaEntry,
) -> Result<DeleteApplyState, CatalogDeltaReplayFailure> {
    let Some(parent) = find_node_mut(root, parent_path) else {
        return Ok(DeleteApplyState::MissingParent);
    };
    if !parent.is_dir() {
        return Err(CatalogDeltaReplayFailure::new(
            delta,
            CatalogReplayReason::InvalidParent,
        ));
    }
    let Some(children) = parent.children_mut() else {
        return Err(CatalogDeltaReplayFailure::new(
            delta,
            CatalogReplayReason::InvalidParent,
        ));
    };
    let Some(pos) = children.iter().position(|child| child.name == name) else {
        return Ok(DeleteApplyState::MissingChild);
    };
    if delta
        .node_id
        .map(|node_id| children[pos].node_id != node_id)
        .unwrap_or(false)
    {
        return Err(CatalogDeltaReplayFailure::new(
            delta,
            CatalogReplayReason::NodeIdMismatch,
        ));
    }
    children.remove(pos);
    parent.touch();
    Ok(DeleteApplyState::Removed)
}

fn detach_child_by_name(
    root: &mut CatalogNode,
    parent_path: &str,
    name: &str,
    delta: &DeltaEntry,
) -> Result<Option<CatalogNode>, CatalogDeltaReplayFailure> {
    let Some(old_parent) = find_node_mut(root, parent_path) else {
        return Ok(None);
    };
    if !old_parent.is_dir() {
        return Err(CatalogDeltaReplayFailure::new(
            delta,
            CatalogReplayReason::InvalidParent,
        ));
    }
    let Some(children) = old_parent.children_mut() else {
        return Err(CatalogDeltaReplayFailure::new(
            delta,
            CatalogReplayReason::InvalidParent,
        ));
    };
    let Some(pos) = children.iter().position(|child| child.name == name) else {
        return Ok(None);
    };
    if delta
        .node_id
        .map(|node_id| children[pos].node_id != node_id)
        .unwrap_or(false)
    {
        return Err(CatalogDeltaReplayFailure::new(
            delta,
            CatalogReplayReason::NodeIdMismatch,
        ));
    }
    Ok(Some(children.remove(pos)))
}

fn destination_has_node(
    root: &CatalogNode,
    parent_path: &str,
    name: &str,
    node_id: Option<u64>,
) -> bool {
    let Some(node_id) = node_id else {
        return false;
    };
    find_node(root, parent_path)
        .and_then(|parent| parent.find_child(name))
        .map(|child| child.node_id == node_id)
        .unwrap_or(false)
}

fn restore_detached_node(
    root: &mut CatalogNode,
    old_parent_path: &str,
    original_name: &str,
    mut node: CatalogNode,
    renamed: bool,
) {
    if renamed {
        node.name = original_name.to_string();
    }
    if let Some(old_parent) = find_node_mut(root, old_parent_path) {
        old_parent.add_child(node);
    }
}

fn split_parent_name(path: &str) -> Option<(&str, &str)> {
    let (parent_path, name) = path.rsplit_once('/')?;
    if name.is_empty() {
        return None;
    }
    let parent_path = if parent_path.is_empty() {
        "/"
    } else {
        parent_path
    };
    Some((parent_path, name))
}

fn delta_op_name(op: &DeltaOp) -> &'static str {
    match op {
        DeltaOp::Create { .. } => "create",
        DeltaOp::Update { .. } => "update",
        DeltaOp::Delete => "delete",
        DeltaOp::Move { .. } => "move",
    }
}

fn find_node<'a>(root: &'a CatalogNode, path: &str) -> Option<&'a CatalogNode> {
    if path == "/" || path.is_empty() {
        return Some(root);
    }

    let path = path.trim_start_matches('/');
    let parts: Vec<&str> = path.split('/').collect();

    let mut current = root;
    for part in parts {
        current = current.find_child(part)?;
    }
    Some(current)
}

fn find_node_by_id(root: &CatalogNode, node_id: u64) -> Option<&CatalogNode> {
    if root.node_id == node_id {
        return Some(root);
    }
    for child in root.children() {
        if let Some(found) = find_node_by_id(child, node_id) {
            return Some(found);
        }
    }
    None
}

fn is_absent_node_id(root: &CatalogNode, node_id: Option<u64>) -> bool {
    node_id
        .map(|node_id| find_node_by_id(root, node_id).is_none())
        .unwrap_or(false)
}

pub fn apply_deltas(root: &mut CatalogNode, deltas: &[DeltaEntry]) -> crate::error::Result<u32> {
    let original_root = root.clone();
    let mut applied = 0;
    for delta in deltas {
        match apply_delta(root, delta) {
            Ok(outcome) => {
                if outcome.is_applied() {
                    applied += 1;
                }
            }
            Err(failure) => {
                *root = original_root;
                return Err(crate::error::Error::CatalogDeltaReplayFailed(failure));
            }
        }
    }
    Ok(applied)
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
