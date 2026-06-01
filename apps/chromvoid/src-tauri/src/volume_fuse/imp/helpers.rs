use super::*;

#[derive(Clone)]
pub(super) struct FuseEventSink {
    app: Option<tauri::AppHandle>,
}

impl FuseEventSink {
    pub(super) fn new(app: tauri::AppHandle) -> Self {
        Self { app: Some(app) }
    }

    pub(super) fn disabled() -> Self {
        Self { app: None }
    }

    fn flush_events(&self, adapter: &mut dyn CoreAdapter) -> usize {
        let Some(app) = &self.app else {
            return 0;
        };
        crate::helpers::flush_core_events(app, adapter)
    }

    fn emit_catalog_delete_event(&self, node_id: u64) {
        let Some(app) = &self.app else {
            return;
        };
        let _ = app.emit(
            "catalog:event",
            json!({
                "type": "delete",
                "node_id": node_id,
                "version": 0,
            }),
        );
    }

    fn emit_catalog_create_hint_event(&self, node_id: u64) {
        let Some(app) = &self.app else {
            return;
        };
        let _ = app.emit(
            "catalog:event",
            json!({
                "type": "create",
                "node_id": node_id,
                "version": 0,
            }),
        );
    }
}

pub(super) fn flush_events(event_sink: &FuseEventSink, adapter: &mut dyn CoreAdapter) -> usize {
    event_sink.flush_events(adapter)
}

pub(super) fn emit_catalog_delete_event(event_sink: &FuseEventSink, node_id: u64) {
    event_sink.emit_catalog_delete_event(node_id);
}

pub(super) fn emit_catalog_create_hint_event(event_sink: &FuseEventSink, node_id: u64) {
    event_sink.emit_catalog_create_hint_event(node_id);
}

pub(super) fn save_and_flush(
    event_sink: &FuseEventSink,
    adapter: &mut dyn CoreAdapter,
) -> Result<usize, i32> {
    adapter.save().map_err(|_| libc::EIO)?;
    Ok(flush_events(event_sink, adapter))
}

pub(super) fn save_and_flush_best_effort(
    event_sink: &FuseEventSink,
    adapter: &mut dyn CoreAdapter,
) -> usize {
    let _ = adapter.save();
    flush_events(event_sink, adapter)
}

pub(super) fn touch_dir_mtime(inode_table: &InodeTable, ino: u64) {
    let Some(mut entry) = inode_table.get(ino) else {
        return;
    };
    if !entry.is_dir {
        return;
    }
    entry.modified = Some(SystemTime::now());
    inode_table.upsert(entry);
}

pub(super) fn rpc_code_to_errno(code: Option<&str>) -> i32 {
    match code {
        Some("ACCESS_DENIED") => libc::EACCES,
        Some("NODE_NOT_FOUND") => libc::ENOENT,
        Some("INVALID_PATH") => libc::ENOENT,
        Some("NOT_A_DIR") => libc::ENOTDIR,
        Some("NAME_EXIST") => libc::EEXIST,
        Some("VAULT_REQUIRED") | Some("VAULT_NOT_UNLOCKED") => libc::EACCES,
        Some("EMPTY_PAYLOAD") => libc::EINVAL,
        _ => libc::EIO,
    }
}

pub(super) fn rpc_json(
    adapter: &mut dyn CoreAdapter,
    command: &str,
    data: serde_json::Value,
) -> Result<serde_json::Value, i32> {
    let req = RpcRequest::new(command.to_string(), data);
    match adapter.handle(&req) {
        chromvoid_core::rpc::types::RpcResponse::Success { result, .. } => Ok(result),
        chromvoid_core::rpc::types::RpcResponse::Error { code, .. } => {
            Err(rpc_code_to_errno(code.as_deref()))
        }
    }
}

pub(super) fn build_catalog_path(inode_table: &InodeTable, ino: u64) -> Option<String> {
    if ino == FUSE_ROOT_ID {
        return Some("/".to_string());
    }
    let entry = inode_table.get(ino)?;
    if entry.parent_ino == FUSE_ROOT_ID {
        return Some(format!("/{}", entry.name));
    }
    let parent_path = build_catalog_path(inode_table, entry.parent_ino)?;
    if parent_path == "/" {
        Some(format!("/{}", entry.name))
    } else {
        Some(format!("{}/{}", parent_path, entry.name))
    }
}

pub(super) fn uid_gid() -> (u32, u32) {
    // SAFETY: getuid and getgid are async-signal-safe and never fail per POSIX; take no args.
    unsafe { (libc::getuid(), libc::getgid()) }
}

pub(super) fn make_attr(ino: u64, size: u64, is_dir: bool, mtime: SystemTime) -> FileAttr {
    let (uid, gid) = uid_gid();
    FileAttr {
        ino: fuse_ino(ino),
        size: if is_dir { 0 } else { size },
        blocks: if is_dir { 0 } else { (size + 511) / 512 },
        atime: mtime,
        mtime,
        ctime: mtime,
        crtime: mtime,
        kind: if is_dir {
            FileType::Directory
        } else {
            FileType::RegularFile
        },
        perm: if is_dir { 0o755 } else { 0o644 },
        nlink: if is_dir { 2 } else { 1 },
        uid,
        gid,
        rdev: 0,
        flags: 0,
        blksize: 512,
    }
}

pub(super) fn is_trash_parent_path(path: &str) -> bool {
    if path.starts_with("/.Trashes/") {
        return true;
    }

    if path == "/.Trash" || path.starts_with("/.Trash/") {
        return true;
    }

    if let Some(rest) = path.strip_prefix("/.Trash-") {
        return !rest.is_empty();
    }

    false
}

pub(super) fn is_trash_path(path: &str) -> bool {
    path == "/.Trashes" || path.starts_with("/.Trashes/")
}

pub(super) fn is_platform_metadata_child(parent_path: &str, name: &str) -> bool {
    #[cfg(target_os = "macos")]
    {
        if parent_path == "/" {
            return matches!(
                name,
                ".fseventsd" | ".Spotlight-V100" | ".DocumentRevisions-V100" | ".TemporaryItems"
            );
        }

        if parent_path == "/.fseventsd" {
            return true;
        }
    }

    let _ = (parent_path, name);
    false
}

pub(super) fn apply_trash_mode_overrides(inode_table: &InodeTable, ino: u64, attr: &mut FileAttr) {
    if attr.kind != FileType::Directory {
        return;
    }

    let Some(path) = build_catalog_path(inode_table, ino) else {
        return;
    };

    if path == "/.Trashes" {
        attr.perm = 0o1777;
        attr.uid = 0;
        attr.gid = 0;
        return;
    }

    if let Some(rest) = path.strip_prefix("/.Trashes/") {
        if !rest.is_empty() && !rest.contains('/') {
            attr.perm = 0o700;
            return;
        }
    }

    if path == "/.Trash" {
        attr.perm = 0o700;
        return;
    }

    if let Some(rest) = path.strip_prefix("/.Trash-") {
        if !rest.is_empty() && !rest.contains('/') {
            attr.perm = 0o700;
        }
    }
}
