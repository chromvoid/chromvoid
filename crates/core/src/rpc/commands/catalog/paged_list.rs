//! Paged folder listing handlers.

use std::cmp::Ordering;
use std::collections::HashSet;
use std::io::Read;

use serde_json::{json, Value};
use tracing::info;

use crate::catalog::{CatalogMediaKind, CatalogNode};
use crate::error::ErrorCode;
use crate::rpc::router::blob_reader::CatalogBlobReader;
use crate::storage::Storage;
use crate::vault::VaultSession;

use super::super::super::types::{
    CatalogFolderBatchRequest, CatalogFolderBatchResponse, CatalogFolderFilter,
    CatalogFolderFilterCounts, CatalogFolderPageRequest, CatalogFolderPageResponse,
    CatalogFolderSort, RpcResponse, CATALOG_FOLDER_BATCH_MAX_ITEMS, CATALOG_FOLDER_BATCH_MAX_PAGES,
    CATALOG_FOLDER_BATCH_SOFT_BYTES, CATALOG_FOLDER_PAGE_DEFAULT_ITEMS,
    CATALOG_FOLDER_PAGE_MAX_ITEMS,
};
use super::super::guards::{is_system_path_guarded, normalize_path, system_shard_denied};
use super::crud::catalog_list_item_from_node_with_location;

const TEXT_SEARCH_MAX_BYTES: u64 = 1_048_576;

struct FolderListCandidate<'a> {
    node: &'a CatalogNode,
    path: String,
    parent_path: String,
}

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
    match name.rfind('.') {
        Some(index) if index > 0 => &name[index + 1..],
        _ => "",
    }
}

fn join_child_path(parent_path: &str, name: &str) -> String {
    if parent_path == "/" {
        format!("/{name}")
    } else {
        format!("{}/{name}", parent_path.trim_end_matches('/'))
    }
}

const IMAGE_EXTENSIONS: &[&str] = &[
    "jpg", "jpeg", "png", "gif", "webp", "svg", "bmp", "ico", "avif", "heic", "heif", "tif", "tiff",
];
const VIDEO_EXTENSIONS: &[&str] = &["mp4", "webm", "mov", "avi", "mkv", "wmv", "flv"];
const AUDIO_EXTENSIONS: &[&str] = &["mp3", "wav", "ogg", "m4a", "aac", "flac", "wma"];
const MARKDOWN_EXTENSIONS: &[&str] = &["md", "markdown"];
const TEXT_DOCUMENT_EXTENSIONS: &[&str] = &["txt", "csv", "log"];
const DOCUMENT_EXTENSIONS: &[&str] = &[
    "pdf", "doc", "docx", "rtf", "odt", "xls", "xlsx", "ppt", "pptx",
];
const CODE_EXTENSIONS: &[&str] = &[
    "json", "xml", "html", "css", "js", "ts", "jsx", "tsx", "scss", "less", "py", "java", "cpp",
    "c", "h", "go", "rs", "php", "rb", "swift", "kt", "yaml", "yml", "toml", "ini", "sh", "bash",
];
const ARCHIVE_EXTENSIONS: &[&str] = &["zip", "rar", "7z", "tar", "gz", "bz2", "xz", "dmg", "iso"];
const TEXT_MIME_TYPES: &[&str] = &[
    "application/json",
    "application/ld+json",
    "application/xml",
    "application/x-yaml",
    "application/yaml",
    "application/toml",
    "application/x-sh",
    "application/javascript",
    "application/x-javascript",
    "text/csv",
];

const NO_GROUPS: &[&str] = &[];
const IMAGE_GROUPS: &[&str] = &["images"];
const VIDEO_GROUPS: &[&str] = &["videos"];
const AUDIO_GROUPS: &[&str] = &["audio"];
const MARKDOWN_GROUPS: &[&str] = &["markdown", "documents"];
const DOCUMENT_GROUPS: &[&str] = &["documents"];
const CODE_GROUPS: &[&str] = &["code"];
const ARCHIVE_GROUPS: &[&str] = &["archives"];

fn extension_matches(extension: &str, candidates: &[&str]) -> bool {
    candidates.iter().any(|candidate| extension == *candidate)
}

fn mime_matches_document_group(mime: &str) -> bool {
    mime.starts_with("text/")
        || TEXT_MIME_TYPES.iter().any(|candidate| mime == *candidate)
        || mime.ends_with("+json")
        || mime.ends_with("+xml")
        || mime == "application/pdf"
}

fn groups_from_mime(mime: &str) -> &'static [&'static str] {
    if mime == "text/markdown" {
        return MARKDOWN_GROUPS;
    }
    if mime.starts_with("image/") {
        return IMAGE_GROUPS;
    }
    if mime.starts_with("video/") {
        return VIDEO_GROUPS;
    }
    if mime.starts_with("audio/") {
        return AUDIO_GROUPS;
    }
    if mime_matches_document_group(mime) {
        return DOCUMENT_GROUPS;
    }
    NO_GROUPS
}

fn node_filter_groups(node: &CatalogNode) -> &'static [&'static str] {
    if !node.is_file() {
        return NO_GROUPS;
    }

    if let Some(media_info) = &node.media_info {
        return match media_info.kind {
            CatalogMediaKind::Audio => AUDIO_GROUPS,
            CatalogMediaKind::Video => VIDEO_GROUPS,
        };
    }

    let extension = node_extension(&node.name).to_ascii_lowercase();
    let mime = node.mime_type.as_deref().unwrap_or("").to_ascii_lowercase();

    if extension_matches(&extension, MARKDOWN_EXTENSIONS) || mime == "text/markdown" {
        return MARKDOWN_GROUPS;
    }

    if !extension.is_empty() {
        if extension_matches(&extension, IMAGE_EXTENSIONS) {
            return IMAGE_GROUPS;
        }
        if extension_matches(&extension, VIDEO_EXTENSIONS) {
            return VIDEO_GROUPS;
        }
        if extension_matches(&extension, AUDIO_EXTENSIONS) {
            return AUDIO_GROUPS;
        }
        if extension_matches(&extension, TEXT_DOCUMENT_EXTENSIONS)
            || extension_matches(&extension, DOCUMENT_EXTENSIONS)
        {
            return DOCUMENT_GROUPS;
        }
        if extension_matches(&extension, CODE_EXTENSIONS) {
            return CODE_GROUPS;
        }
        if extension_matches(&extension, ARCHIVE_EXTENSIONS) {
            return ARCHIVE_GROUPS;
        }
    }

    groups_from_mime(&mime)
}

fn node_matches_filter_group(node: &CatalogNode, group: &str) -> bool {
    let group = group.to_ascii_lowercase();
    let groups = node_filter_groups(node);
    if groups.iter().any(|candidate| *candidate == group) {
        return true;
    }

    if matches!(
        group.as_str(),
        "audio" | "videos" | "images" | "markdown" | "documents" | "code" | "archives"
    ) {
        return false;
    }

    let extension = node_extension(&node.name).to_ascii_lowercase();
    let mime = node.mime_type.as_deref().unwrap_or("").to_ascii_lowercase();
    extension == group || mime.contains(&group)
}

fn file_type_matches(node: &CatalogNode, file_types: &[String], include_directories: bool) -> bool {
    if file_types.is_empty() || (include_directories && node.is_dir()) {
        return true;
    }
    if node.is_dir() {
        return false;
    }

    file_types
        .iter()
        .any(|kind| node_matches_filter_group(node, kind))
}

fn is_text_searchable_node(node: &CatalogNode) -> bool {
    if !node.is_file() {
        return false;
    }

    let extension = node_extension(&node.name).to_ascii_lowercase();
    let mime = node.mime_type.as_deref().unwrap_or("").to_ascii_lowercase();

    extension_matches(&extension, MARKDOWN_EXTENSIONS)
        || extension_matches(&extension, TEXT_DOCUMENT_EXTENSIONS)
        || extension_matches(&extension, CODE_EXTENSIONS)
        || mime == "text/markdown"
        || mime.starts_with("text/")
        || TEXT_MIME_TYPES.iter().any(|candidate| mime == *candidate)
        || mime.ends_with("+json")
        || mime.ends_with("+xml")
}

fn filter_query(filter: Option<&CatalogFolderFilter>) -> Option<&str> {
    filter?
        .query
        .as_deref()
        .map(str::trim)
        .filter(|query| !query.is_empty())
}

fn include_hidden(filter: Option<&CatalogFolderFilter>) -> bool {
    filter.and_then(|f| f.include_hidden).unwrap_or(false)
}

fn should_search_recursively(filter: Option<&CatalogFolderFilter>) -> bool {
    filter.and_then(|f| f.recursive).unwrap_or(false)
}

fn compute_filter_counts(nodes: &[&CatalogNode]) -> CatalogFolderFilterCounts {
    let mut counts = CatalogFolderFilterCounts::default();

    for node in nodes {
        if !node.is_file() {
            continue;
        }

        counts.all += 1;
        if node_matches_filter_group(node, "markdown") {
            counts.markdown += 1;
        }
        if node_matches_filter_group(node, "images") {
            counts.images += 1;
        }
    }

    counts
}

fn text_content_matches_query(
    session: &VaultSession,
    storage: &Storage,
    node: &CatalogNode,
    folded_query: &str,
) -> bool {
    if node.size > TEXT_SEARCH_MAX_BYTES || !is_text_searchable_node(node) {
        return false;
    }

    let Ok(node_id) = u32::try_from(node.node_id) else {
        return false;
    };

    let mut reader =
        CatalogBlobReader::new(storage.clone(), session.vault_key(), node_id).take(node.size);
    let mut bytes = Vec::with_capacity(node.size.min(TEXT_SEARCH_MAX_BYTES) as usize);
    if reader.read_to_end(&mut bytes).is_err() {
        return false;
    }

    String::from_utf8_lossy(&bytes)
        .to_lowercase()
        .contains(folded_query)
}

fn node_matches_base_filter(
    session: &VaultSession,
    storage: &Storage,
    candidate: &FolderListCandidate<'_>,
    filter: Option<&CatalogFolderFilter>,
) -> bool {
    if !include_hidden(filter) && candidate.node.name.starts_with('.') {
        return false;
    }

    if let Some(query) = filter_query(filter) {
        let folded_query = query.to_lowercase();
        if candidate.node.name.to_lowercase().contains(&folded_query)
            || candidate.path.to_lowercase().contains(&folded_query)
        {
            return true;
        }

        if filter.and_then(|f| f.include_text_content).unwrap_or(false)
            && text_content_matches_query(session, storage, candidate.node, &folded_query)
        {
            return true;
        }

        return false;
    }

    true
}

fn direct_folder_candidates<'a>(
    path: &str,
    nodes: Vec<&'a CatalogNode>,
) -> Vec<FolderListCandidate<'a>> {
    nodes
        .into_iter()
        .filter(|node| path != "/" || !crate::catalog::is_system_shard_id(&node.name))
        .map(|node| FolderListCandidate {
            node,
            path: join_child_path(path, &node.name),
            parent_path: path.to_string(),
        })
        .collect()
}

fn collect_recursive_candidates<'a>(
    current_path: &str,
    node: &'a CatalogNode,
    include_hidden: bool,
    out: &mut Vec<FolderListCandidate<'a>>,
) {
    for child in node.children() {
        if current_path == "/" && crate::catalog::is_system_shard_id(&child.name) {
            continue;
        }
        if !include_hidden && child.name.starts_with('.') {
            continue;
        }

        let child_path = join_child_path(current_path, &child.name);
        out.push(FolderListCandidate {
            node: child,
            path: child_path.clone(),
            parent_path: current_path.to_string(),
        });

        if child.is_dir() {
            collect_recursive_candidates(&child_path, child, include_hidden, out);
        }
    }
}

fn recursive_folder_candidates<'a>(
    session: &'a VaultSession,
    path: &str,
    include_hidden: bool,
) -> Result<Vec<FolderListCandidate<'a>>, RpcResponse> {
    let mut candidates = Vec::new();
    let root = session
        .catalog()
        .find_by_path(path)
        .ok_or_else(|| RpcResponse::error("Node not found", Some(ErrorCode::NodeNotFound)))?;
    collect_recursive_candidates(path, root, include_hidden, &mut candidates);
    Ok(candidates)
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
    storage: &Storage,
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
            filter_counts: CatalogFolderFilterCounts::default(),
            items: Vec::new(),
        });
    }

    let nodes = session
        .catalog()
        .list(&path)
        .map_err(|error| RpcResponse::error(error.to_string(), Some(ErrorCode::NodeNotFound)))?;

    let recursive = should_search_recursively(request.filter.as_ref());
    let include_hidden_files = include_hidden(request.filter.as_ref());
    let candidates = if recursive {
        recursive_folder_candidates(session, &path, include_hidden_files)?
    } else {
        direct_folder_candidates(&path, nodes)
    };

    let base_candidates: Vec<FolderListCandidate<'_>> = candidates
        .into_iter()
        .filter(|candidate| {
            node_matches_base_filter(session, storage, candidate, request.filter.as_ref())
        })
        .collect();
    let filter_counts = if recursive {
        let base_nodes = base_candidates
            .iter()
            .map(|candidate| candidate.node)
            .collect::<Vec<_>>();
        compute_filter_counts(&base_nodes)
    } else {
        let count_base_nodes = recursive_folder_candidates(session, &path, include_hidden_files)?
            .iter()
            .filter(|candidate| {
                node_matches_base_filter(session, storage, candidate, request.filter.as_ref())
            })
            .map(|candidate| candidate.node)
            .collect::<Vec<_>>();
        compute_filter_counts(&count_base_nodes)
    };
    let file_types = request
        .filter
        .as_ref()
        .map(|filter| filter.file_types.as_slice())
        .unwrap_or(&[]);
    let mut nodes: Vec<FolderListCandidate<'_>> = base_candidates
        .into_iter()
        .filter(|candidate| file_type_matches(candidate.node, file_types, !recursive))
        .collect();

    nodes.sort_by(|a, b| compare_nodes(&a.node, &b.node, request.sort.as_ref()));

    let total_count = nodes.len() as u64;
    let start = request.offset.min(total_count) as usize;
    let end = (request.offset.saturating_add(limit)).min(total_count) as usize;
    let items = nodes[start..end]
        .iter()
        .map(|candidate| {
            catalog_list_item_from_node_with_location(
                candidate.node,
                Some(&candidate.path),
                Some(&candidate.parent_path),
            )
        })
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
        filter_counts,
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

pub fn handle_catalog_folder_list(
    session: &VaultSession,
    storage: &Storage,
    data: &Value,
) -> RpcResponse {
    let request = match request_from_value(data) {
        Ok(request) => request,
        Err(response) => return response,
    };

    match build_folder_page(session, storage, request) {
        Ok(response) => {
            log_page_payload("catalog:folder:list", &response);
            RpcResponse::success(response)
        }
        Err(response) => response,
    }
}

pub fn handle_catalog_folder_batch(
    session: &VaultSession,
    storage: &Storage,
    data: &Value,
) -> RpcResponse {
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

        let page = match build_folder_page(session, storage, page_request) {
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::catalog::{CatalogMediaInfo, CatalogMediaKind};

    fn file(id: u64, name: &str, mime_type: Option<&str>) -> CatalogNode {
        CatalogNode::new_file(
            id,
            name.to_string(),
            1024,
            mime_type.map(|value| value.to_string()),
        )
    }

    fn file_types(values: &[&str]) -> Vec<String> {
        values.iter().map(|value| value.to_string()).collect()
    }

    #[test]
    fn catalog_file_type_matches_plural_filter_groups() {
        let image = file(1, "photo.jpg", Some("image/jpeg"));
        let markdown = file(2, "daily.md", Some("text/markdown"));
        let pdf = file(3, "report.pdf", Some("application/pdf"));
        let code = file(4, "app.ts", Some("text/typescript"));
        let archive = file(5, "backup.zip", Some("application/zip"));

        assert!(file_type_matches(&image, &file_types(&["images"]), true));
        assert!(file_type_matches(
            &markdown,
            &file_types(&["markdown"]),
            true
        ));
        assert!(file_type_matches(
            &markdown,
            &file_types(&["documents"]),
            true
        ));
        assert!(file_type_matches(&pdf, &file_types(&["documents"]), true));
        assert!(file_type_matches(&code, &file_types(&["code"]), true));
        assert!(file_type_matches(
            &archive,
            &file_types(&["archives"]),
            true
        ));
        assert!(file_type_matches(
            &image,
            &file_types(&["markdown", "images"]),
            true
        ));
        assert!(!file_type_matches(&image, &file_types(&["markdown"]), true));
    }

    #[test]
    fn catalog_file_type_prefers_media_info_for_audio_video_groups() {
        let mut audio_only_mp4 = file(1, "podcast.mp4", Some("video/mp4"));
        audio_only_mp4.media_info = Some(CatalogMediaInfo {
            kind: CatalogMediaKind::Audio,
            audio_tracks: 1,
            video_tracks: 0,
            playback_mime_type: Some("audio/mp4".to_string()),
            codec_string: None,
            mse_fragmented: None,
            streaming_metadata: None,
        });

        assert!(file_type_matches(
            &audio_only_mp4,
            &file_types(&["audio"]),
            true
        ));
        assert!(!file_type_matches(
            &audio_only_mp4,
            &file_types(&["videos"]),
            true
        ));

        let mut video_mp4 = file(2, "movie.mp4", Some("video/mp4"));
        video_mp4.media_info = Some(CatalogMediaInfo {
            kind: CatalogMediaKind::Video,
            audio_tracks: 1,
            video_tracks: 1,
            playback_mime_type: Some("video/mp4".to_string()),
            codec_string: None,
            mse_fragmented: None,
            streaming_metadata: None,
        });

        assert!(file_type_matches(
            &video_mp4,
            &file_types(&["videos"]),
            true
        ));
        assert!(!file_type_matches(
            &video_mp4,
            &file_types(&["audio"]),
            true
        ));
    }

    #[test]
    fn catalog_filter_counts_ignore_file_type_dimension() {
        let dir = CatalogNode::new_dir(1, "notes".to_string());
        let markdown = file(2, "daily.md", Some("text/markdown"));
        let image = file(3, "photo.jpg", Some("image/jpeg"));
        let document = file(4, "report.pdf", Some("application/pdf"));
        let nodes = vec![&dir, &markdown, &image, &document];

        assert_eq!(
            compute_filter_counts(&nodes),
            CatalogFolderFilterCounts {
                all: 3,
                markdown: 1,
                images: 1,
            }
        );
    }

    #[test]
    fn directories_survive_file_type_filtering() {
        let dir = CatalogNode::new_dir(1, "photos".to_string());

        assert!(file_type_matches(&dir, &file_types(&["images"]), true));
        assert!(!file_type_matches(&dir, &file_types(&["images"]), false));
    }
}
