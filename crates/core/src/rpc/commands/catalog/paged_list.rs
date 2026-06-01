//! Paged folder listing handlers.

use std::cmp::Ordering;
use std::collections::HashSet;

use serde_json::{json, Value};
use tracing::info;

use crate::catalog::CatalogNode;
use crate::error::ErrorCode;
use crate::vault::VaultSession;

use super::super::super::types::{
    CatalogFolderBatchRequest, CatalogFolderBatchResponse, CatalogFolderFilter,
    CatalogFolderPageRequest, CatalogFolderPageResponse, CatalogFolderSort, RpcResponse,
    CATALOG_FOLDER_BATCH_MAX_ITEMS, CATALOG_FOLDER_BATCH_MAX_PAGES,
    CATALOG_FOLDER_BATCH_SOFT_BYTES, CATALOG_FOLDER_PAGE_DEFAULT_ITEMS,
    CATALOG_FOLDER_PAGE_MAX_ITEMS,
};
use super::super::guards::{is_system_path_guarded, normalize_path, system_shard_denied};
use super::crud::catalog_list_item_from_node;

fn clamp_limit(limit: Option<u64>) -> u64 {
    let default = CATALOG_FOLDER_PAGE_DEFAULT_ITEMS as u64;
    let max = CATALOG_FOLDER_PAGE_MAX_ITEMS as u64;
    limit.unwrap_or(default).clamp(1, max)
}

fn request_from_value(data: &Value) -> Result<CatalogFolderPageRequest, RpcResponse> {
    serde_json::from_value::<CatalogFolderPageRequest>(data.clone()).map_err(|error| {
        RpcResponse::error(
            format!("Invalid folder page request: {error}"),
            Some(ErrorCode::EmptyPayload),
        )
    })
}

fn batch_request_from_value(data: &Value) -> Result<CatalogFolderBatchRequest, RpcResponse> {
    serde_json::from_value::<CatalogFolderBatchRequest>(data.clone()).map_err(|error| {
        RpcResponse::error(
            format!("Invalid folder batch request: {error}"),
            Some(ErrorCode::EmptyPayload),
        )
    })
}

fn node_extension(name: &str) -> &str {
    name.rsplit_once('.')
        .map(|(_, extension)| extension)
        .unwrap_or("")
}

fn file_type_matches(node: &CatalogNode, file_types: &[String]) -> bool {
    if file_types.is_empty() || node.is_dir() {
        return true;
    }

    let extension = node_extension(&node.name).to_ascii_lowercase();
    let mime = node.mime_type.as_deref().unwrap_or("").to_ascii_lowercase();

    file_types.iter().any(|kind| {
        let kind = kind.to_ascii_lowercase();
        kind == extension || mime.contains(&kind)
    })
}

fn node_matches_filter(
    path: &str,
    node: &CatalogNode,
    filter: Option<&CatalogFolderFilter>,
) -> bool {
    let include_hidden = filter.and_then(|f| f.include_hidden).unwrap_or(false);
    if !include_hidden && node.name.starts_with('.') {
        return false;
    }

    if let Some(filter) = filter {
        if let Some(query) = filter
            .query
            .as_ref()
            .map(|query| query.trim())
            .filter(|q| !q.is_empty())
        {
            let query = query.to_ascii_lowercase();
            let node_path = if path == "/" {
                format!("/{}", node.name)
            } else {
                format!("{}/{}", path.trim_end_matches('/'), node.name)
            };
            if !node.name.to_ascii_lowercase().contains(&query)
                && !node_path.to_ascii_lowercase().contains(&query)
            {
                return false;
            }
        }

        if !file_type_matches(node, &filter.file_types) {
            return false;
        }
    }

    true
}

fn compare_nodes(a: &&CatalogNode, b: &&CatalogNode, sort: Option<&CatalogFolderSort>) -> Ordering {
    if a.is_dir() != b.is_dir() {
        return if a.is_dir() {
            Ordering::Less
        } else {
            Ordering::Greater
        };
    }

    let sort_by = sort.map(|s| s.by.as_str()).unwrap_or("name");
    let ordering = match sort_by {
        "size" => a.size.cmp(&b.size),
        "date" => a.modtime.cmp(&b.modtime),
        "type" => node_extension(&a.name).cmp(node_extension(&b.name)),
        _ => a
            .name
            .to_ascii_lowercase()
            .cmp(&b.name.to_ascii_lowercase()),
    };

    let ordering = if ordering == Ordering::Equal {
        a.name.cmp(&b.name)
    } else {
        ordering
    };

    if sort
        .map(|s| s.direction.eq_ignore_ascii_case("desc"))
        .unwrap_or(false)
    {
        ordering.reverse()
    } else {
        ordering
    }
}

fn build_folder_page(
    session: &VaultSession,
    request: CatalogFolderPageRequest,
) -> Result<CatalogFolderPageResponse, RpcResponse> {
    let path = normalize_path(&request.path);
    if is_system_path_guarded(&path) {
        return Err(system_shard_denied());
    }

    let version = session.catalog().version();
    let limit = clamp_limit(request.limit);
    if request
        .expected_version
        .map(|expected| expected != version)
        .unwrap_or(false)
    {
        return Ok(CatalogFolderPageResponse {
            current_path: path,
            version,
            total_count: 0,
            offset: request.offset,
            limit,
            next_offset: None,
            reload_required: true,
            items: Vec::new(),
        });
    }

    let nodes = session
        .catalog()
        .list(&path)
        .map_err(|error| RpcResponse::error(error.to_string(), Some(ErrorCode::NodeNotFound)))?;

    let mut nodes: Vec<&CatalogNode> = nodes
        .into_iter()
        .filter(|node| path != "/" || !crate::catalog::is_system_shard_id(&node.name))
        .filter(|node| node_matches_filter(&path, node, request.filter.as_ref()))
        .collect();

    nodes.sort_by(|a, b| compare_nodes(a, b, request.sort.as_ref()));

    let total_count = nodes.len() as u64;
    let start = request.offset.min(total_count) as usize;
    let end = (request.offset.saturating_add(limit)).min(total_count) as usize;
    let items = nodes[start..end]
        .iter()
        .map(|node| catalog_list_item_from_node(node))
        .collect::<Vec<_>>();
    let next_offset = if end < nodes.len() {
        Some(end as u64)
    } else {
        None
    };

    Ok(CatalogFolderPageResponse {
        current_path: path,
        version,
        total_count,
        offset: request.offset,
        limit,
        next_offset,
        reload_required: false,
        items,
    })
}

fn log_page_payload(command: &str, response: &impl serde::Serialize) -> usize {
    let payload_bytes = serde_json::to_vec(response)
        .map(|bytes| bytes.len())
        .unwrap_or(0);
    info!(
        "perf:catalog_sync event=payload command={} payload_bytes={}",
        command, payload_bytes
    );
    payload_bytes
}

pub fn handle_catalog_folder_list(session: &VaultSession, data: &Value) -> RpcResponse {
    let request = match request_from_value(data) {
        Ok(request) => request,
        Err(response) => return response,
    };

    match build_folder_page(session, request) {
        Ok(response) => {
            log_page_payload("catalog:folder:list", &response);
            RpcResponse::success(response)
        }
        Err(response) => response,
    }
}

pub fn handle_catalog_folder_batch(session: &VaultSession, data: &Value) -> RpcResponse {
    let request = match batch_request_from_value(data) {
        Ok(request) => request,
        Err(response) => return response,
    };

    let mut seen = HashSet::new();
    let mut pages = Vec::new();
    let mut truncated = false;
    let mut remaining_items = CATALOG_FOLDER_BATCH_MAX_ITEMS as u64;

    for mut page_request in request.pages {
        if pages.len() >= CATALOG_FOLDER_BATCH_MAX_PAGES || remaining_items == 0 {
            truncated = true;
            break;
        }

        let key = serde_json::to_string(&page_request).unwrap_or_default();
        if !seen.insert(key) {
            continue;
        }

        let requested_limit = clamp_limit(page_request.limit);
        let capped_limit = requested_limit.min(remaining_items);
        page_request.limit = Some(capped_limit);

        let page = match build_folder_page(session, page_request) {
            Ok(page) => page,
            Err(response) => return response,
        };
        remaining_items = remaining_items.saturating_sub(page.items.len() as u64);
        pages.push(page);

        let preview = CatalogFolderBatchResponse {
            pages: pages.clone(),
            truncated,
            warnings: Vec::new(),
        };
        if log_page_payload("catalog:folder:batch.preview", &preview)
            > CATALOG_FOLDER_BATCH_SOFT_BYTES
            && pages.len() > 1
        {
            pages.pop();
            truncated = true;
            break;
        }
    }

    let response = CatalogFolderBatchResponse {
        pages,
        truncated,
        warnings: if truncated {
            vec![json!({"code": "BATCH_TRUNCATED"})]
        } else {
            Vec::new()
        },
    };
    log_page_payload("catalog:folder:batch", &response);
    RpcResponse::success(response)
}
