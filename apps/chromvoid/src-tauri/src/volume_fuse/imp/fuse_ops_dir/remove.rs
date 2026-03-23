use super::super::helpers::*;
use super::super::platform::*;
use super::super::*;

pub(in crate::volume_fuse::imp) fn handle_rmdir(
    fs: &mut PrivyFilesystem,
    _req: &Request<'_>,
    parent: u64,
    name: &OsStr,
    reply: ReplyEmpty,
) {
    let name_str = match name.to_str() {
        Some(n) => n,
        None => {
            reply.error(libc::EINVAL);
            return;
        }
    };

    info!(target: "chromvoid_lib::volume_fuse::imp", parent, name = name_str, "FUSE rmdir");

    if let Err(e) = fs.guard_system_child(parent, name_str) {
        reply.error(e);
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
            reply.error(e);
            return;
        }
    };
    if !entry.is_dir {
        reply.error(libc::ENOTDIR);
        return;
    }
    let child_ino = fuse_ino_from_catalog_node_id(entry.catalog_node_id);

    let _guard = match fs.write_lock.lock() {
        Ok(g) => g,
        Err(_) => {
            reply.error(libc::EIO);
            return;
        }
    };

    {
        let mut adapter = match fs.adapter.lock() {
            Ok(a) => a,
            Err(_) => {
                reply.error(libc::EIO);
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
                emit_catalog_delete_event(entry.catalog_node_id);
                info!(target: "chromvoid_lib::volume_fuse::imp", node_id = entry.catalog_node_id, "FUSE rmdir: core already missing");
                reply.ok();
                notify_kernel_delete(parent, child_ino, name_str, None);
                return;
            }
            info!(target: "chromvoid_lib::volume_fuse::imp", node_id = entry.catalog_node_id, errno = e, "FUSE rmdir: core delete failed");
            reply.error(e);
            return;
        }
        let emitted = save_and_flush_best_effort(adapter.as_mut());
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
    emit_catalog_delete_event(entry.catalog_node_id);
    let parent_path = if parent == FUSE_ROOT_ID {
        "/".to_string()
    } else {
        build_catalog_path(&fs.inode_table, parent).unwrap_or_default()
    };
    info!(target: "chromvoid_lib::volume_fuse::imp", node_id = entry.catalog_node_id, "FUSE rmdir: ok");
    reply.ok();
    notify_kernel_delete(parent, child_ino, name_str, None);
    poke_finder_dir(&parent_path);
}

pub(in crate::volume_fuse::imp) fn handle_unlink(
    fs: &mut PrivyFilesystem,
    _req: &Request<'_>,
    parent: u64,
    name: &OsStr,
    reply: ReplyEmpty,
) {
    let name_str = match name.to_str() {
        Some(n) => n,
        None => {
            reply.error(libc::EINVAL);
            return;
        }
    };

    info!(target: "chromvoid_lib::volume_fuse::imp", parent, name = name_str, "FUSE unlink");

    if let Err(e) = fs.guard_system_child(parent, name_str) {
        reply.error(e);
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
            reply.error(e);
            return;
        }
    };
    if entry.is_dir {
        reply.error(libc::EISDIR);
        return;
    }
    let child_ino = fuse_ino_from_catalog_node_id(entry.catalog_node_id);

    let _guard = match fs.write_lock.lock() {
        Ok(g) => g,
        Err(_) => {
            reply.error(libc::EIO);
            return;
        }
    };

    {
        let mut adapter = match fs.adapter.lock() {
            Ok(a) => a,
            Err(_) => {
                reply.error(libc::EIO);
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
                emit_catalog_delete_event(entry.catalog_node_id);
                info!(target: "chromvoid_lib::volume_fuse::imp", node_id = entry.catalog_node_id, "FUSE unlink: core already missing");
                reply.ok();
                notify_kernel_delete(parent, child_ino, name_str, None);
                return;
            }
            info!(target: "chromvoid_lib::volume_fuse::imp", node_id = entry.catalog_node_id, errno = e, "FUSE unlink: core delete failed");
            reply.error(e);
            return;
        }
        let emitted = save_and_flush_best_effort(adapter.as_mut());
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
    emit_catalog_delete_event(entry.catalog_node_id);
    let parent_path = if parent == FUSE_ROOT_ID {
        "/".to_string()
    } else {
        build_catalog_path(&fs.inode_table, parent).unwrap_or_default()
    };
    info!(target: "chromvoid_lib::volume_fuse::imp", node_id = entry.catalog_node_id, "FUSE unlink: ok");
    reply.ok();
    notify_kernel_delete(parent, child_ino, name_str, None);
    poke_finder_dir(&parent_path);
}
