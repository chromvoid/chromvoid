//! File link completion and resolution handlers for Markdown notes.

use std::cmp::Ordering;

use serde_json::Value;

use crate::catalog::CatalogNode;
use crate::error::ErrorCode;
use crate::vault::VaultSession;

use super::super::super::types::{
    CatalogFileLinkItem, CatalogFileLinkResolveResult, CatalogFileLinksCompleteRequest,
    CatalogFileLinksCompleteResponse, CatalogFileLinksResolveRequest,
    CatalogFileLinksResolveResponse, RpcResponse,
};
use super::super::guards::is_system_shard_id_guarded;

const DEFAULT_COMPLETION_LIMIT: u64 = 20;
const MAX_COMPLETION_LIMIT: u64 = 50;

struct FileLinkCandidate<'a> {
    node: &'a CatalogNode,
    path: String,
    parent_path: String,
}

fn request_from_value<T: serde::de::DeserializeOwned>(
    data: &Value,
    label: &str,
) -> Result<T, RpcResponse> {
    serde_json::from_value::<T>(data.clone()).map_err(|error| {
        RpcResponse::error(
            format!("Invalid {label} request: {error}"),
            Some(ErrorCode::EmptyPayload),
        )
    })
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
        .map(|index| &trimmed[..index])
        .unwrap_or("/");
    if next.is_empty() {
        "/".to_string()
    } else {
        next.to_string()
    }
}

fn normalize_catalog_link_target(path: &str) -> Option<String> {
    let trimmed = path.trim();
    if !trimmed.starts_with('/') || trimmed.starts_with("//") || trimmed == "/" {
        return None;
    }

    let segments = trimmed.split('/').skip(1).collect::<Vec<_>>();
    if segments
        .iter()
        .any(|segment| segment.is_empty() || *segment == "." || *segment == "..")
    {
        return None;
    }

    Some(format!("/{}", segments.join("/")))
}

fn collect_visible_files<'a>(
    current_path: &str,
    node: &'a CatalogNode,
    out: &mut Vec<FileLinkCandidate<'a>>,
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
            collect_visible_files(&path, child, out);
            continue;
        }
        if !child.is_file() {
            continue;
        }

        out.push(FileLinkCandidate {
            node: child,
            parent_path: parent_path(&path),
            path,
        });
    }
}

fn item_from_candidate(candidate: &FileLinkCandidate<'_>) -> CatalogFileLinkItem {
    CatalogFileLinkItem {
        node_id: candidate.node.node_id,
        name: candidate.node.name.clone(),
        path: candidate.path.clone(),
        parent_path: candidate.parent_path.clone(),
        size: candidate.node.size,
        mime_type: candidate.node.mime_type.clone(),
        source_revision: candidate.node.source_revision,
        created_at: candidate.node.birthtime,
        updated_at: candidate.node.modtime,
    }
}

fn rank_match(candidate: &FileLinkCandidate<'_>, query: &str, current_path: Option<&str>) -> u8 {
    if query.is_empty() {
        if current_path.is_some_and(|path| candidate.parent_path == path) {
            return 0;
        }
        return 3;
    }

    let name = candidate.node.name.to_lowercase();
    let path = candidate.path.to_lowercase();

    if name == query {
        0
    } else if name.starts_with(query) {
        1
    } else if name.contains(query) {
        2
    } else if path.contains(query) {
        3
    } else {
        4
    }
}

fn compare_candidates(
    left: &FileLinkCandidate<'_>,
    right: &FileLinkCandidate<'_>,
    query: &str,
    current_path: Option<&str>,
) -> Ordering {
    rank_match(left, query, current_path)
        .cmp(&rank_match(right, query, current_path))
        .then_with(|| match current_path {
            Some(path) => (right.parent_path == path).cmp(&(left.parent_path == path)),
            None => Ordering::Equal,
        })
        .then_with(|| left.path.to_lowercase().cmp(&right.path.to_lowercase()))
        .then_with(|| left.path.cmp(&right.path))
}

pub fn handle_catalog_file_links_complete(session: &VaultSession, data: &Value) -> RpcResponse {
    let request =
        match request_from_value::<CatalogFileLinksCompleteRequest>(data, "file link completion") {
            Ok(request) => request,
            Err(response) => return response,
        };

    let query = request.query.trim().to_lowercase();
    let limit = request
        .limit
        .unwrap_or(DEFAULT_COMPLETION_LIMIT)
        .clamp(1, MAX_COMPLETION_LIMIT) as usize;
    let current_path = request
        .current_path
        .as_deref()
        .and_then(normalize_catalog_link_target);

    let mut candidates = Vec::new();
    collect_visible_files("/", session.catalog().root(), &mut candidates);
    candidates.retain(|candidate| {
        query.is_empty()
            || candidate.node.name.to_lowercase().contains(&query)
            || candidate.path.to_lowercase().contains(&query)
    });
    candidates
        .sort_by(|left, right| compare_candidates(left, right, &query, current_path.as_deref()));

    RpcResponse::success(CatalogFileLinksCompleteResponse {
        version: session.catalog().version(),
        items: candidates
            .into_iter()
            .take(limit)
            .map(|candidate| item_from_candidate(&candidate))
            .collect(),
    })
}

pub fn handle_catalog_file_links_resolve(session: &VaultSession, data: &Value) -> RpcResponse {
    let request =
        match request_from_value::<CatalogFileLinksResolveRequest>(data, "file link resolve") {
            Ok(request) => request,
            Err(response) => return response,
        };

    let mut candidates = Vec::new();
    collect_visible_files("/", session.catalog().root(), &mut candidates);

    let results = request
        .targets
        .iter()
        .map(|target| {
            let item = normalize_catalog_link_target(target).and_then(|normalized| {
                candidates
                    .iter()
                    .find(|candidate| candidate.path == normalized)
                    .map(item_from_candidate)
            });
            CatalogFileLinkResolveResult {
                target: target.clone(),
                item,
            }
        })
        .collect();

    RpcResponse::success(CatalogFileLinksResolveResponse {
        version: session.catalog().version(),
        results,
    })
}

pub fn handle_catalog_document_link(session: &VaultSession, data: &Value) -> RpcResponse {
    use crate::rpc::types::{
        CatalogDocumentLinkKind, CatalogDocumentLinkRequest, CatalogDocumentLinkResponse,
    };
    let request = match request_from_value::<CatalogDocumentLinkRequest>(data, "document link") {
        Ok(request) => request,
        Err(response) => return response,
    };
    let catalog = session.catalog();
    let source_path = match catalog.get_path(request.source_node_id) {
        Some(path)
            if !crate::catalog::system_shard::is_system_path(&path)
                && catalog
                    .find_by_id(request.source_node_id)
                    .is_some_and(|node| node.is_file()) =>
        {
            path
        }
        _ => return RpcResponse::error("Document was not found", Some(ErrorCode::NodeNotFound)),
    };
    if request.path.len() > crate::markdown::MAX_DOCUMENT_BYTES
        || request.path.chars().any(char::is_control)
    {
        return RpcResponse::error("Invalid document link path", Some(ErrorCode::InvalidPath));
    }
    let mut candidates = Vec::new();
    collect_visible_files("/", catalog.root(), &mut candidates);
    let matches = match request.kind {
        CatalogDocumentLinkKind::File => normalize_catalog_link_target(&request.path)
            .map(|path| {
                candidates
                    .iter()
                    .filter(|c| c.path == path)
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default(),
        CatalogDocumentLinkKind::Note => {
            let notes = candidates
                .iter()
                .filter(|c| super::notes::is_markdown_note(c.node))
                .collect::<Vec<_>>();
            resolve_note_target(&notes, &parent_path(&source_path), request.path.trim())
        }
    };
    let result = match matches.as_slice() {
        [] => CatalogDocumentLinkResponse::Missing,
        [candidate] => CatalogDocumentLinkResponse::Found {
            item: item_from_candidate(candidate),
        },
        _ => CatalogDocumentLinkResponse::Ambiguous,
    };
    RpcResponse::success(result)
}

fn note_path_variants(path: &str) -> Vec<String> {
    let lower = path.to_lowercase();
    if lower.ends_with(".md")
        || lower.ends_with(".markdown")
        || path
            .rsplit('/')
            .next()
            .is_some_and(|name| name.contains('.'))
    {
        vec![path.into()]
    } else {
        vec![format!("{path}.md"), format!("{path}.markdown")]
    }
}

fn resolve_note_target<'a, 'b>(
    notes: &[&'a FileLinkCandidate<'b>],
    parent: &str,
    target: &str,
) -> Vec<&'a FileLinkCandidate<'b>> {
    if target.is_empty() {
        return vec![];
    }
    let path_matches = |path: &str| {
        let variants = note_path_variants(path)
            .iter()
            .filter_map(|p| normalize_catalog_link_target(p))
            .map(|p| p.to_lowercase())
            .collect::<Vec<_>>();
        notes
            .iter()
            .copied()
            .filter(|note| variants.contains(&note.path.to_lowercase()))
            .collect::<Vec<_>>()
    };
    if target.starts_with('/') {
        return path_matches(target);
    }
    let mut segments: Vec<&str> = parent.split('/').filter(|s| !s.is_empty()).collect();
    for segment in target.split('/').filter(|s| !s.is_empty()) {
        match segment {
            "." => {}
            ".." => {
                segments.pop();
            }
            name => segments.push(name),
        }
    }
    let relative = path_matches(&format!("/{}", segments.join("/")));
    if !relative.is_empty() {
        return relative;
    }
    if target.contains('/') {
        let suffixes = note_path_variants(target)
            .iter()
            .map(|p| format!("/{}", p.to_lowercase()))
            .collect::<Vec<_>>();
        let matches = notes
            .iter()
            .copied()
            .filter(|note| {
                suffixes
                    .iter()
                    .any(|suffix| note.path.to_lowercase().ends_with(suffix))
            })
            .collect::<Vec<_>>();
        if !matches.is_empty() {
            return matches;
        }
    }
    let stem = |name: &str| {
        let lower = name.to_lowercase();
        lower
            .strip_suffix(".markdown")
            .or_else(|| lower.strip_suffix(".md"))
            .unwrap_or(&lower)
            .to_owned()
    };
    let base = stem(target.rsplit('/').next().unwrap_or(target));
    notes
        .iter()
        .copied()
        .filter(|note| stem(&note.node.name) == base)
        .collect()
}
