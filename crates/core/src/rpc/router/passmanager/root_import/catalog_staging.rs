use super::error::RootImportError;
use super::types::PlannedChunk;
use crate::catalog::CatalogManager;
use crate::types::KEY_SIZE;

pub(super) fn ensure_passmanager_root_in_catalog(
    catalog: &mut CatalogManager,
) -> Result<(), RootImportError> {
    if catalog.find_by_path("/.passmanager").is_some() {
        return Ok(());
    }
    catalog
        .create_dir("/", ".passmanager")
        .map(|_| ())
        .map_err(|error| RootImportError::internal(error.to_string()))
}

pub(super) fn clear_passmanager_root_in_catalog(
    catalog: &mut CatalogManager,
) -> Result<(), RootImportError> {
    let child_ids = catalog
        .find_by_path("/.passmanager")
        .map(|root| {
            root.children()
                .iter()
                .map(|child| child.node_id)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    for node_id in child_ids {
        catalog
            .delete(node_id)
            .map_err(|error| RootImportError::internal(error.to_string()))?;
    }
    Ok(())
}

pub(super) fn ensure_dir_path(
    catalog: &mut CatalogManager,
    pm_path: &str,
) -> Result<(), RootImportError> {
    ensure_passmanager_root_in_catalog(catalog)?;
    if pm_path == "/.passmanager" {
        return Ok(());
    }
    let rel = pm_path.trim_start_matches("/.passmanager/");
    let mut current = "/.passmanager".to_string();
    for segment in rel.split('/').filter(|segment| !segment.is_empty()) {
        if !super::super::path::is_valid_catalog_name(segment) {
            return Err(RootImportError::empty_payload(
                "folder path contains invalid segment",
            ));
        }
        let next = format!("{current}/{segment}");
        if catalog.find_by_path(&next).is_none() {
            catalog
                .create_dir(&current, segment)
                .map_err(|error| RootImportError::internal(error.to_string()))?;
        }
        current = next;
    }
    Ok(())
}

pub(super) fn stage_file_bytes(
    catalog: &mut CatalogManager,
    vault_key: &[u8; KEY_SIZE],
    parent_path: &str,
    name: &str,
    bytes: &[u8],
    mime_type: &str,
    chunks: &mut Vec<PlannedChunk>,
) -> Result<u64, RootImportError> {
    let node_id = match catalog
        .find_by_path(parent_path)
        .and_then(|parent| parent.find_child(name))
    {
        Some(node) if node.is_file() => node.node_id,
        Some(_) => return Err(RootImportError::internal("Node is not a file")),
        None => catalog
            .create_file(
                parent_path,
                name,
                bytes.len() as u64,
                Some(mime_type.to_string()),
            )
            .map_err(|error| RootImportError::internal(error.to_string()))?,
    };
    if let Some(node) = catalog.find_by_id_mut(node_id) {
        node.size = bytes.len() as u64;
        node.mime_type = Some(mime_type.to_string());
        node.media_info = None;
        node.media_inspected_revision = 0;
        node.bump_source_revision();
        node.touch();
    }
    let node_id32 =
        u32::try_from(node_id).map_err(|_| RootImportError::internal("Invalid node_id"))?;
    let chunk_name = crate::crypto::blob_chunk_name(vault_key, node_id32, 0);
    let encrypted = crate::crypto::encrypt(bytes, vault_key, chunk_name.as_bytes())
        .map_err(|error| RootImportError::internal(format!("Encryption failed: {error}")))?;
    chunks.push(PlannedChunk {
        name: chunk_name,
        encrypted,
    });
    Ok(node_id)
}
