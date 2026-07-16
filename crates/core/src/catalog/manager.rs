//! Catalog manager for CRUD operations

use std::collections::HashMap;

use crate::error::{Error, Result};

use super::node::{CatalogNode, CatalogTrashMetadata};
use super::path::validate_name;
use super::system_shard::TRASH_SHARD_ID;

/// Manager for catalog CRUD operations
#[derive(Debug, Clone)]
pub struct CatalogManager {
    /// Root node of the catalog
    pub(super) root: CatalogNode,
    /// Next available node ID
    pub(super) next_node_id: u64,
    /// Index of node_id -> path for quick lookups
    pub(super) node_index: HashMap<u64, Vec<String>>,
    /// Catalog version (incremented on each change)
    pub(super) version: u64,
}

const ROOT_NODE_ID: u64 = 0;
const PASSMANAGER_NODE_ID: u64 = 1;
pub(super) const FIRST_USER_NODE_ID: u64 = PASSMANAGER_NODE_ID + 1;
pub const TRASH_ROOT_PATH: &str = "/.trash";

impl CatalogManager {
    /// Create a new empty catalog
    pub fn new() -> Self {
        let root = CatalogNode::new_root();
        let mut node_index = HashMap::new();
        node_index.insert(ROOT_NODE_ID, vec!["/".to_string()]);

        Self {
            root,
            next_node_id: FIRST_USER_NODE_ID,
            node_index,
            version: 0,
        }
    }

    /// Create from an existing root node
    pub fn from_root(root: CatalogNode) -> Self {
        let mut manager = Self {
            root,
            next_node_id: FIRST_USER_NODE_ID,
            node_index: HashMap::new(),
            version: 0,
        };
        manager.rebuild_index();
        manager
    }

    /// Create from an existing root node and a persisted version.
    pub fn from_root_with_version(root: CatalogNode, version: u64) -> Self {
        let mut manager = Self::from_root(root);
        manager.version = version;
        manager
    }

    /// Get the root node
    pub fn root(&self) -> &CatalogNode {
        &self.root
    }

    /// Insert or replace a top-level shard root without changing catalog version.
    pub(crate) fn upsert_root_child(&mut self, node: CatalogNode) {
        if let Some(children) = self.root.children_mut() {
            if let Some(existing) = children.iter_mut().find(|child| child.name == node.name) {
                *existing = node;
            } else {
                children.push(node);
            }
        }
        self.rebuild_index();
    }

    /// Get the current catalog version
    pub fn version(&self) -> u64 {
        self.version
    }

    /// Allocate a new node ID
    fn alloc_node_id(&mut self) -> u64 {
        let id = self.next_node_id;
        self.next_node_id += 1;
        id
    }

    /// Reserve a node ID without inserting a catalog node.
    ///
    /// Stream upload sessions use this to return a stable continuation ID before
    /// the file is committed to the catalog.
    pub fn reserve_node_id(&mut self) -> u64 {
        self.alloc_node_id()
    }

    /// Update a file node's chunk size.
    pub fn set_chunk_size(&mut self, node_id: u64, chunk_size: u32) -> Result<()> {
        let node = self
            .find_by_id_mut(node_id)
            .ok_or_else(|| Error::NodeNotFound(node_id))?;

        node.chunk_size = chunk_size;
        node.touch();
        Ok(())
    }

    /// Create a new directory
    pub fn create_dir(&mut self, parent_path: &str, name: &str) -> Result<u64> {
        validate_name(name)?;

        // First, check parent exists and get its info (immutable borrow)
        let parent_node_id = {
            let parent = self
                .find_by_path(parent_path)
                .ok_or_else(|| Error::InvalidPath(parent_path.to_string()))?;

            if !parent.is_dir() {
                return Err(Error::NotADirectory(parent.node_id));
            }

            if let Some(_existing) = parent.find_child(name) {
                return Err(Error::NameExists(name.to_string()));
            }

            parent.node_id
        };

        // Allocate ID and create node
        let node_id = self.alloc_node_id();
        let node = CatalogNode::new_dir(node_id, name.to_string());

        // Update index
        let mut path = self
            .node_index
            .get(&parent_node_id)
            .cloned()
            .unwrap_or_default();
        path.push(name.to_string());
        self.node_index.insert(node_id, path);

        // Add child (mutable borrow)
        let parent = self
            .find_by_path_mut(parent_path)
            .ok_or_else(|| Error::InvalidPath(parent_path.to_string()))?;
        parent.add_child(node);
        self.version += 1;

        Ok(node_id)
    }

    /// Create a new file placeholder
    pub fn create_file(
        &mut self,
        parent_path: &str,
        name: &str,
        size: u64,
        mime_type: Option<String>,
    ) -> Result<u64> {
        let node_id = self.alloc_node_id();
        self.create_file_with_id(parent_path, name, node_id, size, mime_type)
    }

    /// Create a new file with a previously reserved node ID.
    pub fn create_file_with_id(
        &mut self,
        parent_path: &str,
        name: &str,
        node_id: u64,
        size: u64,
        mime_type: Option<String>,
    ) -> Result<u64> {
        validate_name(name)?;

        if self.node_index.contains_key(&node_id) {
            return Err(Error::NameExists(name.to_string()));
        }

        // First, check parent exists and get its info (immutable borrow)
        let parent_node_id = {
            let parent = self
                .find_by_path(parent_path)
                .ok_or_else(|| Error::InvalidPath(parent_path.to_string()))?;

            if !parent.is_dir() {
                return Err(Error::NotADirectory(parent.node_id));
            }

            if let Some(_existing) = parent.find_child(name) {
                return Err(Error::NameExists(name.to_string()));
            }

            parent.node_id
        };

        let node = CatalogNode::new_file(node_id, name.to_string(), size, mime_type);
        self.next_node_id = self.next_node_id.max(node_id.saturating_add(1));

        // Update index
        let mut path = self
            .node_index
            .get(&parent_node_id)
            .cloned()
            .unwrap_or_default();
        path.push(name.to_string());
        self.node_index.insert(node_id, path);

        // Add child (mutable borrow)
        let parent = self
            .find_by_path_mut(parent_path)
            .ok_or_else(|| Error::InvalidPath(parent_path.to_string()))?;
        parent.add_child(node);
        self.version += 1;

        Ok(node_id)
    }

    /// Rename a node
    pub fn rename(&mut self, node_id: u64, new_name: &str) -> Result<()> {
        if node_id == 0 {
            return Err(Error::CannotModifyRoot);
        }

        validate_name(new_name)?;

        // Get path to node
        let path = self
            .node_index
            .get(&node_id)
            .ok_or(Error::NodeNotFound(node_id))?
            .clone();

        // Get parent path
        let parent_path = if path.len() > 1 {
            path[..path.len() - 1].join("/")
        } else {
            "/".to_string()
        };

        // ADR-004: renaming to the same name is a no-op.
        let old_name = path.last().map(|s| s.as_str()).unwrap_or("");
        if new_name == old_name {
            return Ok(());
        }

        // Check if new name already exists in parent
        let parent = self
            .find_by_path(&parent_path)
            .ok_or_else(|| Error::InvalidPath(parent_path.clone()))?;

        if parent.has_child(new_name) {
            return Err(Error::NameExists(new_name.to_string()));
        }

        // Find and rename the node
        let parent = self
            .find_by_path_mut(&parent_path)
            .ok_or_else(|| Error::InvalidPath(parent_path.clone()))?;

        if let Some(node) = parent.find_child_mut(old_name) {
            node.name = new_name.to_string();
            node.touch();
        }

        // Update index
        if let Some(indexed_path) = self.node_index.get_mut(&node_id) {
            if let Some(last) = indexed_path.last_mut() {
                *last = new_name.to_string();
            }
        }

        self.version += 1;

        Ok(())
    }

    /// Move a node to a new parent
    pub fn move_node(&mut self, node_id: u64, new_parent_path: &str) -> Result<()> {
        self.move_node_with_options(node_id, new_parent_path, None, false)
    }

    /// Move a node to a new parent, optionally renaming it and replacing an
    /// existing destination file as one catalog mutation.
    pub fn move_node_with_options(
        &mut self,
        node_id: u64,
        new_parent_path: &str,
        new_name: Option<&str>,
        replace_existing: bool,
    ) -> Result<()> {
        let snapshot = self.clone();
        match self.move_node_with_options_inner(
            node_id,
            new_parent_path,
            new_name,
            replace_existing,
        ) {
            Ok(()) => Ok(()),
            Err(error) => {
                *self = snapshot;
                Err(error)
            }
        }
    }

    fn move_node_with_options_inner(
        &mut self,
        node_id: u64,
        new_parent_path: &str,
        new_name: Option<&str>,
        replace_existing: bool,
    ) -> Result<()> {
        if node_id == 0 {
            return Err(Error::CannotModifyRoot);
        }

        // Get current path
        let current_path = self
            .node_index
            .get(&node_id)
            .ok_or(Error::NodeNotFound(node_id))?
            .clone();

        let old_parent_path = if current_path.len() > 1 {
            current_path[..current_path.len() - 1].join("/")
        } else {
            "/".to_string()
        };

        let node_name = current_path
            .last()
            .ok_or(Error::NodeNotFound(node_id))?
            .clone();
        let destination_name = new_name.unwrap_or(&node_name);
        validate_name(destination_name)?;

        // If already at the requested path, this is a no-op.
        // (WebDAV rename calls move + rename separately; move to same dir must succeed.)
        let old_parent_id = self.find_by_path(&old_parent_path).map(|n| n.node_id);
        let new_parent_id = self.find_by_path(new_parent_path).map(|n| n.node_id);
        if old_parent_id.is_some()
            && old_parent_id == new_parent_id
            && destination_name == node_name
        {
            return Ok(());
        }

        // Check new parent exists and is a directory
        let new_parent = self
            .find_by_path(new_parent_path)
            .ok_or_else(|| Error::InvalidPath(new_parent_path.to_string()))?;
        let new_parent_id = new_parent.node_id;

        if !new_parent.is_dir() {
            return Err(Error::NotADirectory(new_parent.node_id));
        }

        // Reject moving a node into itself or one of its own descendants.
        // Without this check the node is detached first and the subsequent
        // lookup of the (now-detached) target parent fails, dropping the whole
        // subtree permanently. We compare indexed paths: the node is an ancestor
        // of (or equal to) the target iff `current_path` is a prefix of the
        // target parent's path.
        if new_parent_id == node_id {
            return Err(Error::InvalidPath(new_parent_path.to_string()));
        }
        if let Some(target_path) = self.node_index.get(&new_parent_id) {
            if target_path.len() >= current_path.len()
                && target_path[..current_path.len()] == current_path[..]
            {
                return Err(Error::InvalidPath(new_parent_path.to_string()));
            }
        }

        let source_is_dir = self
            .find_by_id(node_id)
            .ok_or(Error::NodeNotFound(node_id))?
            .is_dir();
        let replace_node_id = match new_parent.find_child(destination_name) {
            Some(existing) if existing.node_id == node_id => None,
            Some(_) if !replace_existing => {
                return Err(Error::NameExists(destination_name.to_string()));
            }
            Some(existing) => {
                if existing.is_dir() || source_is_dir {
                    return Err(Error::NameExists(destination_name.to_string()));
                }
                Some(existing.node_id)
            }
            None => None,
        };

        if let Some(replace_node_id) = replace_node_id {
            let new_parent = self
                .find_by_path_mut(new_parent_path)
                .ok_or_else(|| Error::InvalidPath(new_parent_path.to_string()))?;
            new_parent
                .remove_child(replace_node_id)
                .ok_or(Error::NodeNotFound(replace_node_id))?;
            self.remove_from_index(replace_node_id);
        }

        // Remove from old parent
        let old_parent = self
            .find_by_path_mut(&old_parent_path)
            .ok_or_else(|| Error::InvalidPath(old_parent_path.clone()))?;

        let node = old_parent
            .remove_child(node_id)
            .ok_or(Error::NodeNotFound(node_id))?;
        let mut node = node;
        if node.name != destination_name {
            node.name = destination_name.to_string();
        }
        node.touch();
        let mut moved_ids = vec![node_id];
        Self::collect_descendant_ids(&node, &mut moved_ids);

        // Add to new parent
        let new_parent = self
            .find_by_path_mut(new_parent_path)
            .ok_or_else(|| Error::InvalidPath(new_parent_path.to_string()))?;

        new_parent.add_child(node);

        // Update index for moved node and all its children
        let mut new_path_prefix = self
            .node_index
            .get(&new_parent_id)
            .cloned()
            .unwrap_or_default();
        new_path_prefix.push(destination_name.to_string());
        let old_prefix_len = current_path.len();
        for id in moved_ids {
            if let Some(indexed_path) = self.node_index.get_mut(&id) {
                if indexed_path.len() >= old_prefix_len {
                    let mut updated = Vec::with_capacity(
                        new_path_prefix.len() + indexed_path.len().saturating_sub(old_prefix_len),
                    );
                    updated.extend_from_slice(&new_path_prefix);
                    updated.extend_from_slice(&indexed_path[old_prefix_len..]);
                    *indexed_path = updated;
                }
            }
        }
        self.version += 1;

        Ok(())
    }

    /// Delete a node
    pub fn delete(&mut self, node_id: u64) -> Result<()> {
        if node_id == 0 {
            return Err(Error::CannotModifyRoot);
        }

        // Get path to node
        let path = self
            .node_index
            .get(&node_id)
            .ok_or(Error::NodeNotFound(node_id))?
            .clone();

        // Get parent path
        let parent_path = if path.len() > 1 {
            path[..path.len() - 1].join("/")
        } else {
            "/".to_string()
        };

        // Remove from parent
        let parent = self
            .find_by_path_mut(&parent_path)
            .ok_or_else(|| Error::InvalidPath(parent_path.clone()))?;

        let removed = parent.remove_child(node_id);

        if removed.is_some() {
            // Remove from index (including all children)
            self.remove_from_index(node_id);
            self.version += 1;
        }

        Ok(())
    }

    /// Move a node into the hidden reversible Trash shard.
    pub fn trash_node(&mut self, node_id: u64) -> Result<CatalogNode> {
        let snapshot = self.clone();
        match self.trash_node_inner(node_id) {
            Ok(node) => Ok(node),
            Err(error) => {
                *self = snapshot;
                Err(error)
            }
        }
    }

    fn trash_node_inner(&mut self, node_id: u64) -> Result<CatalogNode> {
        if node_id == ROOT_NODE_ID {
            return Err(Error::CannotModifyRoot);
        }

        let original_path = self.get_path(node_id).ok_or(Error::NodeNotFound(node_id))?;
        if original_path == TRASH_ROOT_PATH || original_path.starts_with("/.trash/") {
            return Err(Error::InvalidPath(original_path));
        }

        self.ensure_trash_root()?;

        let original_name = self
            .find_by_id(node_id)
            .ok_or(Error::NodeNotFound(node_id))?
            .name
            .clone();
        let trash_name = self.unique_trash_name(&original_name, node_id)?;
        let deleted_at = current_timestamp();

        {
            let node = self
                .find_by_id_mut(node_id)
                .ok_or(Error::NodeNotFound(node_id))?;
            node.trash = Some(CatalogTrashMetadata {
                original_path,
                deleted_at,
                trash_name: trash_name.clone(),
            });
        }

        self.move_node_with_options_inner(node_id, TRASH_ROOT_PATH, Some(&trash_name), false)?;
        self.find_by_id(node_id)
            .cloned()
            .ok_or(Error::NodeNotFound(node_id))
    }

    /// Return hidden Trash shard children, or an empty list before first Trash use.
    pub fn list_trash(&self) -> Result<Vec<&CatalogNode>> {
        match self.find_by_path(TRASH_ROOT_PATH) {
            Some(node) if node.is_dir() => Ok(node.children().iter().collect()),
            Some(node) => Err(Error::NotADirectory(node.node_id)),
            None => Ok(Vec::new()),
        }
    }

    /// Restore a trashed node to its original path or an explicit destination.
    pub fn restore_trashed_node(
        &mut self,
        node_id: u64,
        restore_parent_path: Option<&str>,
        restore_name: Option<&str>,
    ) -> Result<CatalogNode> {
        let snapshot = self.clone();
        match self.restore_trashed_node_inner(node_id, restore_parent_path, restore_name) {
            Ok(node) => Ok(node),
            Err(error) => {
                *self = snapshot;
                Err(error)
            }
        }
    }

    fn restore_trashed_node_inner(
        &mut self,
        node_id: u64,
        restore_parent_path: Option<&str>,
        restore_name: Option<&str>,
    ) -> Result<CatalogNode> {
        if node_id == ROOT_NODE_ID {
            return Err(Error::CannotModifyRoot);
        }

        let current_path = self.get_path(node_id).ok_or(Error::NodeNotFound(node_id))?;
        if current_path == TRASH_ROOT_PATH || !current_path.starts_with("/.trash/") {
            return Err(Error::InvalidPath(current_path));
        }

        let trash = self
            .find_by_id(node_id)
            .and_then(|node| node.trash.clone())
            .ok_or_else(|| Error::InvalidPath(current_path.clone()))?;
        let (original_parent, original_name) = split_parent_and_name(&trash.original_path)
            .ok_or_else(|| Error::InvalidPath(trash.original_path.clone()))?;
        let destination_parent = restore_parent_path.unwrap_or(&original_parent);
        let destination_name = restore_name.unwrap_or(&original_name);
        validate_name(destination_name)?;

        if self
            .find_by_path(destination_parent)
            .ok_or_else(|| Error::InvalidPath(destination_parent.to_string()))?
            .find_child(destination_name)
            .is_some()
        {
            return Err(Error::NameExists(destination_name.to_string()));
        }

        {
            let node = self
                .find_by_id_mut(node_id)
                .ok_or(Error::NodeNotFound(node_id))?;
            node.trash = None;
        }

        self.move_node_with_options_inner(
            node_id,
            destination_parent,
            Some(destination_name),
            false,
        )?;
        self.find_by_id(node_id)
            .cloned()
            .ok_or(Error::NodeNotFound(node_id))
    }

    /// Permanently remove all nodes currently in the hidden Trash shard.
    pub fn empty_trash(&mut self) -> Result<Vec<CatalogNode>> {
        let snapshot = self.clone();
        match self.empty_trash_inner() {
            Ok(nodes) => Ok(nodes),
            Err(error) => {
                *self = snapshot;
                Err(error)
            }
        }
    }

    fn empty_trash_inner(&mut self) -> Result<Vec<CatalogNode>> {
        let node_ids: Vec<u64> = match self.find_by_path(TRASH_ROOT_PATH) {
            Some(node) if node.is_dir() => {
                node.children().iter().map(|child| child.node_id).collect()
            }
            Some(node) => return Err(Error::NotADirectory(node.node_id)),
            None => return Ok(Vec::new()),
        };

        let mut removed = Vec::new();
        for node_id in node_ids {
            if let Some(node) = self.find_by_id(node_id).cloned() {
                removed.push(node);
            }
            self.delete(node_id)?;
        }
        Ok(removed)
    }

    /// Atomically exchange the catalog locations of two same-type nodes.
    pub fn exchange_nodes(&mut self, src_node_id: u64, dst_node_id: u64) -> Result<()> {
        let snapshot = self.clone();
        match self.exchange_nodes_inner(src_node_id, dst_node_id) {
            Ok(()) => Ok(()),
            Err(error) => {
                *self = snapshot;
                Err(error)
            }
        }
    }

    fn exchange_nodes_inner(&mut self, src_node_id: u64, dst_node_id: u64) -> Result<()> {
        if src_node_id == ROOT_NODE_ID || dst_node_id == ROOT_NODE_ID {
            return Err(Error::CannotModifyRoot);
        }
        if src_node_id == dst_node_id {
            return Ok(());
        }

        let src_path = self
            .node_index
            .get(&src_node_id)
            .ok_or(Error::NodeNotFound(src_node_id))?
            .clone();
        let dst_path = self
            .node_index
            .get(&dst_node_id)
            .ok_or(Error::NodeNotFound(dst_node_id))?
            .clone();

        if is_path_prefix(&src_path, &dst_path) || is_path_prefix(&dst_path, &src_path) {
            return Err(Error::InvalidPath(
                "cannot exchange ancestor and descendant".to_string(),
            ));
        }

        let src = self
            .find_by_id(src_node_id)
            .ok_or(Error::NodeNotFound(src_node_id))?;
        let dst = self
            .find_by_id(dst_node_id)
            .ok_or(Error::NodeNotFound(dst_node_id))?;
        if src.node_type != dst.node_type {
            return Err(Error::InvalidPath(
                "exchange requires same node type".to_string(),
            ));
        }

        let src_parent_path = parent_path_from_index(&src_path)?;
        let dst_parent_path = parent_path_from_index(&dst_path)?;
        let src_name = src_path
            .last()
            .cloned()
            .ok_or(Error::NodeNotFound(src_node_id))?;
        let dst_name = dst_path
            .last()
            .cloned()
            .ok_or(Error::NodeNotFound(dst_node_id))?;

        if src_parent_path == dst_parent_path {
            let parent = self
                .find_by_path_mut(&src_parent_path)
                .ok_or_else(|| Error::InvalidPath(src_parent_path.clone()))?;
            let parent_node_id = parent.node_id;
            let children = parent
                .children_mut()
                .ok_or(Error::NotADirectory(parent_node_id))?;
            let src_pos = children
                .iter()
                .position(|node| node.node_id == src_node_id)
                .ok_or(Error::NodeNotFound(src_node_id))?;
            let dst_pos = children
                .iter()
                .position(|node| node.node_id == dst_node_id)
                .ok_or(Error::NodeNotFound(dst_node_id))?;
            children[src_pos].name = dst_name;
            children[src_pos].touch();
            children[dst_pos].name = src_name;
            children[dst_pos].touch();
            parent.touch();
        } else {
            let mut src_node = self.detach_child(&src_parent_path, src_node_id)?;
            let mut dst_node = self.detach_child(&dst_parent_path, dst_node_id)?;
            src_node.name = dst_name;
            dst_node.name = src_name;
            src_node.touch();
            dst_node.touch();
            self.attach_child(&dst_parent_path, src_node)?;
            self.attach_child(&src_parent_path, dst_node)?;
        }

        self.version += 1;
        self.rebuild_index();
        Ok(())
    }

    fn ensure_trash_root(&mut self) -> Result<u64> {
        match self.find_by_path(TRASH_ROOT_PATH) {
            Some(node) if node.is_dir() => return Ok(node.node_id),
            Some(node) => return Err(Error::NotADirectory(node.node_id)),
            None => {}
        }

        self.create_dir("/", TRASH_SHARD_ID)
    }

    fn unique_trash_name(&self, original_name: &str, node_id: u64) -> Result<String> {
        let base = format!("{original_name}.{node_id}.trash");
        validate_name(&base)?;
        let trash_root = self
            .find_by_path(TRASH_ROOT_PATH)
            .ok_or_else(|| Error::InvalidPath(TRASH_ROOT_PATH.to_string()))?;
        if !trash_root.has_child(&base) {
            return Ok(base);
        }

        for counter in 1..=10_000_u64 {
            let candidate = format!("{base}.{counter}");
            validate_name(&candidate)?;
            if !trash_root.has_child(&candidate) {
                return Ok(candidate);
            }
        }

        Err(Error::NameExists(base))
    }

    fn detach_child(&mut self, parent_path: &str, node_id: u64) -> Result<CatalogNode> {
        let parent = self
            .find_by_path_mut(parent_path)
            .ok_or_else(|| Error::InvalidPath(parent_path.to_string()))?;
        parent
            .remove_child(node_id)
            .ok_or(Error::NodeNotFound(node_id))
    }

    fn attach_child(&mut self, parent_path: &str, node: CatalogNode) -> Result<()> {
        let parent = self
            .find_by_path_mut(parent_path)
            .ok_or_else(|| Error::InvalidPath(parent_path.to_string()))?;
        if !parent.is_dir() {
            return Err(Error::NotADirectory(parent.node_id));
        }
        if parent.has_child(&node.name) {
            return Err(Error::NameExists(node.name));
        }
        parent.add_child(node);
        Ok(())
    }
}

fn current_timestamp() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}

fn split_parent_and_name(path: &str) -> Option<(String, String)> {
    let parts = path
        .split('/')
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>();
    let name = parts.last()?.to_string();
    let parent = if parts.len() == 1 {
        "/".to_string()
    } else {
        format!("/{}", parts[..parts.len() - 1].join("/"))
    };
    Some((parent, name))
}

fn parent_path_from_index(path: &[String]) -> Result<String> {
    if path.len() <= 1 {
        return Err(Error::CannotModifyRoot);
    }
    if path.len() == 2 {
        Ok("/".to_string())
    } else {
        Ok(format!("/{}", path[1..path.len() - 1].join("/")))
    }
}

fn is_path_prefix(left: &[String], right: &[String]) -> bool {
    left.len() < right.len() && right.starts_with(left)
}

impl Default for CatalogManager {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
#[path = "manager_tests.rs"]
mod tests;
