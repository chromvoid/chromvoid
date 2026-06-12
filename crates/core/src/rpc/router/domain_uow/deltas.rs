use std::collections::BTreeMap;

use crate::catalog::{CatalogManager, CatalogNode, DeltaEntry, PartialNode};
use crate::rpc::commands::{normalize_path, shard_id_from_path, shard_relative_path};

use super::paths::path_depth;

pub(super) fn domain_deltas(
    old_catalog: &CatalogManager,
    new_catalog: &CatalogManager,
    domain_id: &str,
) -> Vec<DeltaEntry> {
    let domain_path = format!("/{domain_id}");
    let old_root = old_catalog.find_by_path(&domain_path);
    let new_root = new_catalog.find_by_path(&domain_path);
    let old_nodes = collect_domain_nodes(old_root, &domain_path);
    let new_nodes = collect_domain_nodes(new_root, &domain_path);

    let mut deltas = Vec::new();
    let mut deleted_paths = old_nodes
        .keys()
        .filter(|path| {
            !new_nodes.contains_key(*path)
                || new_nodes
                    .get(*path)
                    .map(|new| new.node_id != old_nodes[*path].node_id)
                    .unwrap_or(false)
        })
        .cloned()
        .collect::<Vec<_>>();
    deleted_paths.sort_by(|a, b| path_depth(b).cmp(&path_depth(a)).then_with(|| a.cmp(b)));
    for path in deleted_paths {
        if let Some(rel_path) = rel_path(domain_id, &path) {
            if rel_path != "/" {
                let node_id = old_nodes.get(&path).map(|node| node.node_id).unwrap_or(0);
                deltas.push(DeltaEntry::delete(0, rel_path).with_node_id(node_id));
            }
        }
    }

    let mut created_paths = new_nodes
        .keys()
        .filter(|path| {
            !old_nodes.contains_key(*path)
                || old_nodes
                    .get(*path)
                    .map(|old| old.node_id != new_nodes[*path].node_id)
                    .unwrap_or(false)
        })
        .cloned()
        .collect::<Vec<_>>();
    created_paths.sort_by(|a, b| path_depth(a).cmp(&path_depth(b)).then_with(|| a.cmp(b)));
    for path in created_paths {
        if let Some(parent_rel) = parent_rel_path(domain_id, &path) {
            if let Some(node) = new_nodes.get(&path) {
                deltas.push(DeltaEntry::create(0, parent_rel, node.clone()));
            }
        }
    }

    let mut shared_paths = new_nodes
        .keys()
        .filter(|path| {
            old_nodes
                .get(*path)
                .map(|old| old.node_id == new_nodes[*path].node_id)
                .unwrap_or(false)
        })
        .cloned()
        .collect::<Vec<_>>();
    shared_paths.sort();
    for path in shared_paths {
        let Some(rel_path) = rel_path(domain_id, &path) else {
            continue;
        };
        if rel_path == "/" {
            continue;
        }
        let old = &old_nodes[&path];
        let new = &new_nodes[&path];
        if old == new {
            continue;
        }
        let mut fields = PartialNode::default();
        if old.name != new.name {
            fields.name = Some(new.name.clone());
        }
        if old.size != new.size {
            fields.size = Some(new.size);
        }
        if old.mime_type != new.mime_type {
            fields.mime_type = new.mime_type.clone();
        }
        if old.media_info != new.media_info {
            fields.media_info = Some(new.media_info.clone());
        }
        if old.media_inspected_revision != new.media_inspected_revision {
            fields.media_inspected_revision = Some(new.media_inspected_revision);
        }
        if old.modtime != new.modtime {
            fields.modtime = Some(new.modtime);
        }
        if old.source_revision != new.source_revision {
            fields.source_revision = Some(new.source_revision);
        }
        deltas.push(DeltaEntry::update(0, rel_path, fields).with_node_id(new.node_id));
    }

    deltas
}

fn collect_domain_nodes(
    root: Option<&CatalogNode>,
    domain_path: &str,
) -> BTreeMap<String, CatalogNode> {
    let mut out = BTreeMap::new();
    if let Some(root) = root {
        collect_node(root, &normalize_path(domain_path), &mut out);
    }
    out
}

fn collect_node(node: &CatalogNode, path: &str, out: &mut BTreeMap<String, CatalogNode>) {
    out.insert(path.to_string(), node.clone());
    for child in node.children() {
        let child_path = if path == "/" {
            format!("/{}", child.name)
        } else {
            format!("{path}/{}", child.name)
        };
        collect_node(child, &child_path, out);
    }
}

fn rel_path(domain_id: &str, path: &str) -> Option<String> {
    let normalized = normalize_path(path);
    let shard = shard_id_from_path(&normalized)?;
    if shard != domain_id {
        return None;
    }
    shard_relative_path(domain_id, &normalized)
}

fn parent_rel_path(domain_id: &str, path: &str) -> Option<String> {
    let normalized = normalize_path(path);
    let parent = normalized
        .rsplit_once('/')
        .map(|(parent, _)| if parent.is_empty() { "/" } else { parent })
        .unwrap_or("/");
    rel_path(domain_id, parent)
}

#[cfg(test)]
mod tests {
    use crate::catalog::{CatalogManager, DeltaOp};

    use super::domain_deltas;

    #[test]
    fn same_path_different_node_id_is_delete_create_not_update() {
        let mut old = CatalogManager::new();
        old.create_dir("/", ".passmanager").expect("domain root");
        let old_node_id = old
            .create_file("/.passmanager", ".tags-meta.json", 2, None)
            .expect("old tags");

        let mut new = old.clone();
        new.delete(old_node_id).expect("delete old tags");
        let new_node_id = new
            .create_file("/.passmanager", ".tags-meta.json", 3, None)
            .expect("new tags");
        assert_ne!(old_node_id, new_node_id);

        let deltas = domain_deltas(&old, &new, ".passmanager");
        let delete = deltas
            .iter()
            .find(|delta| delta.path == "/.tags-meta.json")
            .expect("delete old tag file");
        assert!(matches!(delete.op, DeltaOp::Delete));
        assert_eq!(delete.node_id, Some(old_node_id));

        let create = deltas
            .iter()
            .find(|delta| match &delta.op {
                DeltaOp::Create { node } => node.name == ".tags-meta.json",
                _ => false,
            })
            .expect("create new tag file");
        assert_eq!(create.path, "/");
        assert_eq!(create.node_id, Some(new_node_id));
    }
}
