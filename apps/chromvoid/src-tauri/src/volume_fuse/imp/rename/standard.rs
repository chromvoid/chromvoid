use super::super::helpers::*;
use super::super::*;

impl PrivyFilesystem {
    /// Handles standard rename: RENAME_EXCL check, POSIX replace-if-exists,
    /// catalog move, catalog rename, and inode cache update.
    pub(in crate::volume_fuse::imp) fn rename_standard(
        &mut self,
        parent: u64,
        name_str: &str,
        newparent: u64,
        newname_str: &str,
        src: &InodeEntry,
        node_id: u64,
        dest_parent_path: &str,
        flag_excl: bool,
        flags: u32,
        reply: ReplyEmpty,
    ) {
        let _guard = match self.write_lock.lock() {
            Ok(g) => g,
            Err(_) => {
                info!(target: "chromvoid_lib::volume_fuse::imp", branch = "write_lock_poisoned", errno = libc::EIO, node_id, flags, "FUSE rename: early abort");
                reply.error(libc::EIO);
                return;
            }
        };

        if flag_excl {
            match self.find_or_list_child(newparent, newname_str) {
                Ok(dst) => {
                    info!(target: "chromvoid_lib::volume_fuse::imp", branch = "flag_excl_dst_exists", node_id, dst_node_id = dst.catalog_node_id, flags, "FUSE rename: excl destination exists");
                    if dst.catalog_node_id != src.catalog_node_id {
                        info!(target: "chromvoid_lib::volume_fuse::imp", branch = "flag_excl_reject_eexist", node_id, dst_node_id = dst.catalog_node_id, flags, errno = libc::EEXIST, "FUSE rename: excl rejected");
                        reply.error(libc::EEXIST);
                        return;
                    }
                    info!(target: "chromvoid_lib::volume_fuse::imp", branch = "flag_excl_noop_same_node", node_id, flags, "FUSE rename: excl no-op");
                    reply.ok();
                    return;
                }
                Err(e) => {
                    info!(target: "chromvoid_lib::volume_fuse::imp", branch = "flag_excl_dst_missing_or_error", node_id, flags, errno = e, "FUSE rename: excl destination lookup result");
                }
            }
        }

        // If destination exists and both are files, emulate POSIX rename-replace by deleting dest.
        match self.find_or_list_child(newparent, newname_str) {
            Ok(dst) => {
                info!(target: "chromvoid_lib::volume_fuse::imp", branch = "replace_dst_exists", node_id, dst_node_id = dst.catalog_node_id, flags, dst_is_dir = dst.is_dir, src_is_dir = src.is_dir, "FUSE rename: destination exists");
                // If destination resolves to the same node, treat as no-op.
                if dst.catalog_node_id == src.catalog_node_id {
                    info!(target: "chromvoid_lib::volume_fuse::imp", branch = "replace_noop_same_node", node_id, flags, "FUSE rename: replace no-op");
                    reply.ok();
                    return;
                }
                if dst.is_dir || src.is_dir {
                    info!(target: "chromvoid_lib::volume_fuse::imp", branch = "replace_reject_eexist_type", node_id, dst_node_id = dst.catalog_node_id, flags, errno = libc::EEXIST, "FUSE rename: replace rejected by type");
                    reply.error(libc::EEXIST);
                    return;
                }
                let mut adapter = match self.adapter.lock() {
                    Ok(a) => a,
                    Err(_) => {
                        info!(target: "chromvoid_lib::volume_fuse::imp", branch = "replace_delete_adapter_lock_failed", node_id, dst_node_id = dst.catalog_node_id, flags, errno = libc::EIO, "FUSE rename: replace delete lock failed");
                        reply.error(libc::EIO);
                        return;
                    }
                };
                info!(target: "chromvoid_lib::volume_fuse::imp", branch = "replace_delete_start", node_id, dst_node_id = dst.catalog_node_id, flags, "FUSE rename: replace delete start");
                if let Err(e) = rpc_json(
                    adapter.as_mut(),
                    "catalog:delete",
                    json!({"node_id": dst.catalog_node_id}),
                ) {
                    info!(target: "chromvoid_lib::volume_fuse::imp", branch = "replace_delete_failed", node_id, dst_node_id = dst.catalog_node_id, flags, errno = e, "FUSE rename: replace delete failed");
                    reply.error(e);
                    return;
                }
                let emitted = save_and_flush_best_effort(adapter.as_mut());
                self.inode_table
                    .remove(fuse_ino_from_catalog_node_id(dst.catalog_node_id));
                info!(target: "chromvoid_lib::volume_fuse::imp", branch = "replace_delete_ok", node_id, dst_node_id = dst.catalog_node_id, flags, events_emitted = emitted, "FUSE rename: replace delete ok");
            }
            Err(e) => {
                info!(target: "chromvoid_lib::volume_fuse::imp", branch = "replace_dst_missing_or_lookup_error", node_id, flags, errno = e, "FUSE rename: destination lookup result");
            }
        }

        // Move to new parent.
        if newparent != parent {
            info!(target: "chromvoid_lib::volume_fuse::imp", branch = "move_start", node_id, flags, dest_parent_path, "FUSE rename: move start");
            let mut adapter = match self.adapter.lock() {
                Ok(a) => a,
                Err(_) => {
                    info!(target: "chromvoid_lib::volume_fuse::imp", branch = "move_adapter_lock_failed", node_id, flags, errno = libc::EIO, "FUSE rename: move lock failed");
                    reply.error(libc::EIO);
                    return;
                }
            };
            if let Err(e) = rpc_json(
                adapter.as_mut(),
                "catalog:move",
                json!({"node_id": node_id, "new_parent_path": dest_parent_path, "new_name": serde_json::Value::Null}),
            ) {
                info!(target: "chromvoid_lib::volume_fuse::imp", branch = "move_failed", node_id, flags, errno = e, "FUSE rename: move failed");
                reply.error(e);
                return;
            }
            let emitted = save_and_flush_best_effort(adapter.as_mut());
            info!(target: "chromvoid_lib::volume_fuse::imp", branch = "move_ok", node_id, flags, events_emitted = emitted, "FUSE rename: move ok");
        }

        // Rename if needed.
        if newname_str != name_str {
            info!(target: "chromvoid_lib::volume_fuse::imp", branch = "rename_start", node_id, flags, new_name = newname_str, "FUSE rename: rename start");
            let mut adapter = match self.adapter.lock() {
                Ok(a) => a,
                Err(_) => {
                    info!(target: "chromvoid_lib::volume_fuse::imp", branch = "rename_adapter_lock_failed", node_id, flags, errno = libc::EIO, "FUSE rename: rename lock failed");
                    reply.error(libc::EIO);
                    return;
                }
            };
            if let Err(e) = rpc_json(
                adapter.as_mut(),
                "catalog:rename",
                json!({"node_id": node_id, "new_name": newname_str}),
            ) {
                info!(target: "chromvoid_lib::volume_fuse::imp", branch = "rename_failed", node_id, flags, errno = e, "FUSE rename: rename failed");
                reply.error(e);
                return;
            }
            let emitted = save_and_flush_best_effort(adapter.as_mut());
            info!(target: "chromvoid_lib::volume_fuse::imp", branch = "rename_ok", node_id, flags, events_emitted = emitted, "FUSE rename: rename ok");
        }

        // Update inode cache for moved entry.
        let ino = fuse_ino_from_catalog_node_id(node_id);
        if let Some(mut entry) = self.inode_table.get(ino) {
            entry.name = newname_str.to_string();
            entry.parent_ino = newparent;
            entry.modified = Some(SystemTime::now());
            self.inode_table.upsert(entry);
        }

        info!(target: "chromvoid_lib::volume_fuse::imp", branch = "final_success", node_id, flags, "FUSE rename: ok");
        reply.ok();
    }
}
