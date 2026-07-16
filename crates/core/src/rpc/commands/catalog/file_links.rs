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
