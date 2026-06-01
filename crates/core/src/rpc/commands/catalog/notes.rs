//! Notes projection handlers.

use crate::catalog::CatalogNode;
use crate::vault::VaultSession;

use super::super::super::types::{CatalogNotesListItem, CatalogNotesListResponse, RpcResponse};
use super::super::guards::is_system_shard_id_guarded;

fn join_child_path(parent_path: &str, name: &str) -> String {
    if parent_path == "/" {
        format!("/{name}")
    } else {
        format!("{}/{name}", parent_path.trim_end_matches('/'))
    }
}

fn parent_path(path: &str) -> String {
    if path == "/" {
        return "/".to_string();
    }

    let trimmed = path.trim_end_matches('/');
    let next = trimmed
        .rfind('/')
        .map(|index| &trimmed[..=index])
        .unwrap_or("/");
    if next.is_empty() {
        "/".to_string()
    } else {
        next.to_string()
    }
}

fn is_markdown_note(node: &CatalogNode) -> bool {
    if !node.is_file() {
        return false;
    }

    let name = node.name.to_ascii_lowercase();
    if name.ends_with(".md") || name.ends_with(".markdown") {
        return true;
    }

    node.mime_type
        .as_deref()
        .map(|mime| mime.eq_ignore_ascii_case("text/markdown"))
        .unwrap_or(false)
}

fn collect_notes(current_path: &str, node: &CatalogNode, out: &mut Vec<CatalogNotesListItem>) {
    for child in node.children() {
        if current_path == "/" && is_system_shard_id_guarded(&child.name) {
            continue;
        }
        if child.name.starts_with('.') {
            continue;
        }

        let path = join_child_path(current_path, &child.name);
        if child.is_dir() {
            collect_notes(&path, child, out);
            continue;
        }

        if !is_markdown_note(child) {
            continue;
        }

        out.push(CatalogNotesListItem {
            node_id: child.node_id,
            name: child.name.clone(),
            path: path.clone(),
            parent_path: parent_path(&path),
            size: child.size,
            mime_type: child.mime_type.clone(),
            source_revision: child.source_revision,
            created_at: child.birthtime,
            updated_at: child.modtime,
        });
    }
}

pub fn handle_catalog_notes_list(session: &VaultSession) -> RpcResponse {
    let mut items = Vec::new();
    collect_notes("/", session.catalog().root(), &mut items);

    RpcResponse::success(CatalogNotesListResponse {
        version: session.catalog().version(),
        items,
    })
}
