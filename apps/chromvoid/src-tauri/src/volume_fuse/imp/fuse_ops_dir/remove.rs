use super::super::helpers::*;
use super::super::*;

fn removed_child_parent_refresh_path(
    inode_table: &InodeTable,
    parent: u64,
    operation: &'static str,
) -> Option<String> {
    if parent == FUSE_ROOT_ID {
        return Some("/".to_string());
    }

    let path = build_catalog_path(inode_table, parent);
    if path.is_none() {
        warn!(
            target: "chromvoid_lib::volume_fuse::imp",
            parent,
            operation,
            "FUSE remove: parent path unavailable; skipping Finder refresh"
        );
    }
    path
}

pub(in crate::volume_fuse::imp) fn handle_rmdir(
    fs: &PrivyFilesystem,
    _req: &Request,
    parent: u64,
    name: &OsStr,
    reply: ReplyEmpty,
) {
    let name_str = match name.to_str() {
        Some(n) => n,
        None => {
            reply.error(fuse_errno(libc::EINVAL));
            return;
        }
    };

    info!(target: "chromvoid_lib::volume_fuse::imp", parent, name = name_str, "FUSE rmdir");

    if let Err(e) = fs.guard_system_child(parent, name_str) {
        reply.error(fuse_errno(e));
        return;
    }

    let entry = match fs.find_or_list_child(parent, name_str) {
        Ok(e) => e,
        Err(e) if e == libc::ENOENT => {
            info!(target: "chromvoid_lib::volume_fuse::imp", parent, name = name_str, "FUSE rmdir: already missing");
            reply.ok();
            return;
        }
        Err(e) => {
            info!(target: "chromvoid_lib::volume_fuse::imp", parent, name = name_str, errno = e, "FUSE rmdir: find failed");
            reply.error(fuse_errno(e));
            return;
        }
    };
    if !entry.is_dir {
        reply.error(fuse_errno(libc::ENOTDIR));
        return;
    }
    let child_ino = fuse_ino_from_catalog_node_id(entry.catalog_node_id);

    let _guard = match fs.write_lock.lock() {
        Ok(g) => g,
        Err(_) => {
            reply.error(fuse_errno(libc::EIO));
            return;
        }
    };

    {
        let mut adapter = match fs.adapter.lock() {
            Ok(a) => a,
            Err(_) => {
                reply.error(fuse_errno(libc::EIO));
                return;
            }
        };
        if let Err(e) = rpc_json(
            adapter.as_mut(),
            "catalog:delete",
            json!({"node_id": entry.catalog_node_id}),
        ) {
            if e == libc::ENOENT {
                fs.inode_table
                    .remove(fuse_ino_from_catalog_node_id(entry.catalog_node_id));
                touch_dir_mtime(&fs.inode_table, parent);
                emit_catalog_delete_event(&fs.event_sink, entry.catalog_node_id);
                info!(target: "chromvoid_lib::volume_fuse::imp", node_id = entry.catalog_node_id, "FUSE rmdir: core already missing");
                reply.ok();
                fs.platform_runtime
                    .notify_kernel_delete(parent, child_ino, name_str, None);
                return;
            }
            info!(target: "chromvoid_lib::volume_fuse::imp", node_id = entry.catalog_node_id, errno = e, "FUSE rmdir: core delete failed");
            reply.error(fuse_errno(e));
            return;
        }
        let emitted = save_and_flush_best_effort(&fs.event_sink, adapter.as_mut());
        info!(
            target: "chromvoid_lib::volume_fuse::imp",
            node_id = entry.catalog_node_id,
            events_emitted = emitted,
            "FUSE rmdir: core delete persisted"
        );
    }

    fs.inode_table
        .remove(fuse_ino_from_catalog_node_id(entry.catalog_node_id));
    touch_dir_mtime(&fs.inode_table, parent);
    emit_catalog_delete_event(&fs.event_sink, entry.catalog_node_id);
    let parent_path = removed_child_parent_refresh_path(&fs.inode_table, parent, "rmdir");
    info!(target: "chromvoid_lib::volume_fuse::imp", node_id = entry.catalog_node_id, "FUSE rmdir: ok");
    reply.ok();
    fs.platform_runtime
        .notify_kernel_delete(parent, child_ino, name_str, None);
    if let Some(parent_path) = parent_path {
        fs.platform_runtime.poke_finder_dir(&parent_path);
    }
}

pub(in crate::volume_fuse::imp) fn handle_unlink(
    fs: &PrivyFilesystem,
    _req: &Request,
    parent: u64,
    name: &OsStr,
    reply: ReplyEmpty,
) {
    let name_str = match name.to_str() {
        Some(n) => n,
        None => {
            reply.error(fuse_errno(libc::EINVAL));
            return;
        }
    };

    info!(target: "chromvoid_lib::volume_fuse::imp", parent, name = name_str, "FUSE unlink");

    if let Err(e) = fs.guard_system_child(parent, name_str) {
        reply.error(fuse_errno(e));
        return;
    }

    let entry = match fs.find_or_list_child(parent, name_str) {
        Ok(e) => e,
        Err(e) if e == libc::ENOENT => {
            info!(target: "chromvoid_lib::volume_fuse::imp", parent, name = name_str, "FUSE unlink: already missing");
            reply.ok();
            return;
        }
        Err(e) => {
            info!(target: "chromvoid_lib::volume_fuse::imp", parent, name = name_str, errno = e, "FUSE unlink: find failed");
            reply.error(fuse_errno(e));
            return;
        }
    };
    if entry.is_dir {
        reply.error(fuse_errno(libc::EISDIR));
        return;
    }
    let child_ino = fuse_ino_from_catalog_node_id(entry.catalog_node_id);

    let _guard = match fs.write_lock.lock() {
        Ok(g) => g,
        Err(_) => {
            reply.error(fuse_errno(libc::EIO));
            return;
        }
    };

    {
        let mut adapter = match fs.adapter.lock() {
            Ok(a) => a,
            Err(_) => {
                reply.error(fuse_errno(libc::EIO));
                return;
            }
        };
        if let Err(e) = rpc_json(
            adapter.as_mut(),
            "catalog:delete",
            json!({"node_id": entry.catalog_node_id}),
        ) {
            if e == libc::ENOENT {
                fs.inode_table
                    .remove(fuse_ino_from_catalog_node_id(entry.catalog_node_id));
                touch_dir_mtime(&fs.inode_table, parent);
                emit_catalog_delete_event(&fs.event_sink, entry.catalog_node_id);
                info!(target: "chromvoid_lib::volume_fuse::imp", node_id = entry.catalog_node_id, "FUSE unlink: core already missing");
                reply.ok();
                fs.platform_runtime
                    .notify_kernel_delete(parent, child_ino, name_str, None);
                return;
            }
            info!(target: "chromvoid_lib::volume_fuse::imp", node_id = entry.catalog_node_id, errno = e, "FUSE unlink: core delete failed");
            reply.error(fuse_errno(e));
            return;
        }
        let emitted = save_and_flush_best_effort(&fs.event_sink, adapter.as_mut());
        info!(
            target: "chromvoid_lib::volume_fuse::imp",
            node_id = entry.catalog_node_id,
            events_emitted = emitted,
            "FUSE unlink: core delete persisted"
        );
    }

    fs.inode_table
        .remove(fuse_ino_from_catalog_node_id(entry.catalog_node_id));
    touch_dir_mtime(&fs.inode_table, parent);
    emit_catalog_delete_event(&fs.event_sink, entry.catalog_node_id);
    let parent_path = removed_child_parent_refresh_path(&fs.inode_table, parent, "unlink");
    info!(target: "chromvoid_lib::volume_fuse::imp", node_id = entry.catalog_node_id, "FUSE unlink: ok");
    reply.ok();
    fs.platform_runtime
        .notify_kernel_delete(parent, child_ino, name_str, None);
    if let Some(parent_path) = parent_path {
        fs.platform_runtime.poke_finder_dir(&parent_path);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn removed_child_parent_refresh_path_returns_root() {
        let table = InodeTable::default();

        assert_eq!(
            removed_child_parent_refresh_path(&table, FUSE_ROOT_ID, "unlink").as_deref(),
            Some("/")
        );
    }

    #[test]
    fn removed_child_parent_refresh_path_returns_known_parent_path() {
        let table = InodeTable::default();
        let parent_ino = fuse_ino_from_catalog_node_id(41);
        table.upsert(InodeEntry {
            catalog_node_id: 41,
            name: "Photos".to_string(),
            parent_ino: FUSE_ROOT_ID,
            is_dir: true,
            size: 0,
            modified: None,
        });

        assert_eq!(
            removed_child_parent_refresh_path(&table, parent_ino, "rmdir").as_deref(),
            Some("/Photos")
        );
    }

    #[test]
    fn removed_child_parent_refresh_path_skips_missing_parent() {
        let table = InodeTable::default();

        assert_eq!(
            removed_child_parent_refresh_path(&table, fuse_ino_from_catalog_node_id(41), "unlink"),
            None
        );
    }
}
