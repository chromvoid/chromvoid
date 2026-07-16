//! Notes projection handlers.

use std::io::Read;

use crate::catalog::CatalogNode;
use crate::rpc::router::blob_reader::CatalogBlobReader;
use crate::storage::Storage;
use crate::vault::VaultSession;

use super::super::super::types::{CatalogNotesListItem, CatalogNotesListResponse, RpcResponse};
use super::super::guards::is_system_shard_id_guarded;

const NOTES_PREVIEW_READ_LIMIT: u64 = 4096;
const NOTES_EXCERPT_CHAR_LIMIT: usize = 220;

#[derive(Debug, Default)]
struct NotePreview {
    heading: Option<String>,
    excerpt: Option<String>,
    preview_words: Option<u64>,
    preview_truncated: Option<bool>,
}

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

fn collapse_whitespace(value: &str) -> String {
    value.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn clamp_excerpt(value: &str) -> String {
    let mut chars = value.chars();
    let clipped = chars
        .by_ref()
        .take(NOTES_EXCERPT_CHAR_LIMIT)
        .collect::<String>();
    if chars.next().is_some() {
        format!("{}...", clipped.trim_end())
    } else {
        clipped
    }
}

fn markdown_heading(line: &str) -> Option<String> {
    let trimmed = line.trim_start();
    if !trimmed.starts_with('#') {
        return None;
    }

    let heading = trimmed.trim_start_matches('#').trim();
    if heading.is_empty() {
        None
    } else {
        Some(clamp_excerpt(&collapse_whitespace(heading)))
    }
}

fn derive_preview_from_bytes(bytes: &[u8], source_size: u64) -> Option<NotePreview> {
    if bytes.is_empty() {
        return None;
    }

    let text = String::from_utf8_lossy(bytes);
    let lines = text
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .collect::<Vec<_>>();
    if lines.is_empty() {
        return None;
    }

    let heading = lines.iter().find_map(|line| markdown_heading(line));
    let excerpt_source = lines
        .iter()
        .find(|line| markdown_heading(line).is_none())
        .or_else(|| lines.first())
        .copied();
    let excerpt = excerpt_source
        .map(collapse_whitespace)
        .filter(|value| !value.is_empty())
        .map(|value| clamp_excerpt(&value));
    let preview_words = text.split_whitespace().count() as u64;

    Some(NotePreview {
        heading,
        excerpt,
        preview_words: Some(preview_words),
        preview_truncated: Some(source_size > bytes.len() as u64),
    })
}

fn build_note_preview(
    session: &VaultSession,
    storage: &Storage,
    node: &CatalogNode,
) -> Option<NotePreview> {
    let node_id = u32::try_from(node.node_id).ok()?;
    let mut reader = CatalogBlobReader::new(storage.clone(), session.vault_key(), node_id)
        .take(NOTES_PREVIEW_READ_LIMIT);
    let mut bytes = Vec::with_capacity(NOTES_PREVIEW_READ_LIMIT as usize);
    reader.read_to_end(&mut bytes).ok()?;

    derive_preview_from_bytes(&bytes, node.size)
}

fn collect_notes(
    current_path: &str,
    node: &CatalogNode,
    session: &VaultSession,
    storage: &Storage,
    out: &mut Vec<CatalogNotesListItem>,
) {
    for child in node.children() {
        if current_path == "/" && is_system_shard_id_guarded(&child.name) {
            continue;
        }
        if child.name.starts_with('.') {
            continue;
        }

        let path = join_child_path(current_path, &child.name);
        if child.is_dir() {
            collect_notes(&path, child, session, storage, out);
            continue;
        }

        if !is_markdown_note(child) {
            continue;
        }

        let preview = build_note_preview(session, storage, child).unwrap_or_default();
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
            heading: preview.heading,
            excerpt: preview.excerpt,
            preview_words: preview.preview_words,
            preview_truncated: preview.preview_truncated,
        });
    }
}

pub fn handle_catalog_notes_list(session: &VaultSession, storage: &Storage) -> RpcResponse {
    let mut items = Vec::new();
    collect_notes("/", session.catalog().root(), session, storage, &mut items);

    RpcResponse::success(CatalogNotesListResponse {
        version: session.catalog().version(),
        items,
    })
}
