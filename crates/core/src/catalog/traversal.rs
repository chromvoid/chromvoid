//! Tree traversal, lookup, and index management for CatalogManager

use crate::error::{Error, Result};

use super::manager::CatalogManager;
use super::node::CatalogNode;
use super::path::parse_path;

impl CatalogManager {
    /// Rebuild the node index from the tree
    pub(super) fn rebuild_index(&mut self) {
        self.node_index.clear();
        self.next_node_id = super::manager::FIRST_USER_NODE_ID;
        let mut entries = Vec::new();
        let mut path = Vec::new();
        let max_id = Self::collect_entries_into(&self.root, &mut path, &mut entries);
        for (node_id, path) in entries {
            self.node_index.insert(node_id, path);
        }
        self.next_node_id = self.next_node_id.max(max_id + 1);
    }

    fn collect_entries_into(
        node: &CatalogNode,
        path: &mut Vec<String>,
        entries: &mut Vec<(u64, Vec<String>)>,
    ) -> u64 {
        path.push(node.name.clone());
        entries.push((node.node_id, path.clone()));

        let mut max_id = node.node_id;
        for child in node.children() {
            max_id = max_id.max(Self::collect_entries_into(child, path, entries));
        }

        path.pop();
        max_id
    }

    /// Find a node by path
    pub fn find_by_path(&self, path: &str) -> Option<&CatalogNode> {
        let parts = parse_path(path);
        self.find_by_parts(&parts)
    }

    /// Find a node by path parts
    fn find_by_parts(&self, parts: &[&str]) -> Option<&CatalogNode> {
        let mut current = &self.root;

        for part in parts {
            if part.is_empty() || *part == "/" {
                continue;
            }
            current = current.find_child(part)?;
        }

        Some(current)
    }

    /// Find a mutable node by path
    pub(super) fn find_by_path_mut(&mut self, path: &str) -> Option<&mut CatalogNode> {
        let parts: Vec<&str> = parse_path(path);
        self.find_by_parts_mut(&parts)
    }

    /// Find a mutable node by path parts
    fn find_by_parts_mut(&mut self, parts: &[&str]) -> Option<&mut CatalogNode> {
        let mut current = &mut self.root;

        for part in parts {
            if part.is_empty() || *part == "/" {
                continue;
            }
            current = current.find_child_mut(part)?;
        }

        Some(current)
    }

    /// Find a node by ID
    pub fn find_by_id(&self, node_id: u64) -> Option<&CatalogNode> {
        let path = self.node_index.get(&node_id)?;
        self.find_by_path(&path.join("/"))
    }

    /// Find a node by ID (mutable)
    pub fn find_by_id_mut(&mut self, node_id: u64) -> Option<&mut CatalogNode> {
        let path = self.node_index.get(&node_id)?.clone();
        self.find_by_path_mut(&path.join("/"))
    }

    /// Remove a node and its children from the index
    pub(super) fn remove_from_index(&mut self, node_id: u64) {
        // Get all descendant IDs first
        let mut to_remove = vec![node_id];

        if let Some(node) = self.find_by_id(node_id) {
            Self::collect_descendant_ids(node, &mut to_remove);
        }

        for id in to_remove {
            self.node_index.remove(&id);
        }
    }

    /// Collect all descendant node IDs
    fn collect_descendant_ids(node: &CatalogNode, ids: &mut Vec<u64>) {
        for child in node.children() {
            ids.push(child.node_id);
            Self::collect_descendant_ids(child, ids);
        }
    }

    pub(super) fn update_subtree_index_prefix(
        &mut self,
        node_id: u64,
        old_prefix_len: usize,
        new_prefix: &[String],
    ) {
        let mut ids = vec![node_id];
        if let Some(node) = self.find_by_id(node_id) {
            Self::collect_descendant_ids(node, &mut ids);
        }

        for id in ids {
            if let Some(indexed_path) = self.node_index.get_mut(&id) {
                if indexed_path.len() >= old_prefix_len {
                    let mut updated = Vec::with_capacity(
                        new_prefix.len() + indexed_path.len().saturating_sub(old_prefix_len),
                    );
                    updated.extend_from_slice(new_prefix);
                    updated.extend_from_slice(&indexed_path[old_prefix_len..]);
                    *indexed_path = updated;
                }
            }
        }
    }

    /// List children of a directory
    pub fn list(&self, path: &str) -> Result<Vec<&CatalogNode>> {
        let node = self
            .find_by_path(path)
            .ok_or_else(|| Error::InvalidPath(path.to_string()))?;

        if !node.is_dir() {
            return Err(Error::NotADirectory(node.node_id));
        }

        Ok(node.children().iter().collect())
    }

    /// Get path for a node ID
    pub fn get_path(&self, node_id: u64) -> Option<String> {
        self.node_index.get(&node_id).map(|p| p.join("/"))
    }
}
