use super::super::helpers::*;
use super::super::*;

impl PrivyFilesystem {
    /// Handles rename into a trash directory by deleting the catalog node
    /// and moving the inode to the trash location for Finder verification.
    ///
    /// Returns `true` if the destination was a trash path and the branch was handled
    /// (reply already sent). Returns `false` if this is not a trash rename.
    pub(in crate::volume_fuse::imp) fn rename_trash(
        &mut self,
        parent: u64,
        name_str: &str,
        newparent: u64,
        newname_str: &str,
        node_id: u64,
        dest_parent_path: &str,
        flags: u32,
        reply: ReplyEmpty,
    ) -> Option<ReplyEmpty> {
        if !is_trash_parent_path(dest_parent_path) {
            return Some(reply);
        }

        let _guard = match self.write_lock.lock() {
            Ok(g) => g,
            Err(_) => {
                info!(target: "chromvoid_lib::volume_fuse::imp", branch = "write_lock_poisoned", errno = libc::EIO, node_id, flags, "FUSE rename: early abort");
                reply.error(libc::EIO);
                return None;
            }
        };

        info!(target: "chromvoid_lib::volume_fuse::imp", branch = "trash_delete_start", node_id, flags, "FUSE rename: destination is trash");
        let mut adapter = match self.adapter.lock() {
            Ok(a) => a,
            Err(_) => {
                info!(target: "chromvoid_lib::volume_fuse::imp", branch = "trash_delete_adapter_lock_failed", errno = libc::EIO, node_id, flags, "FUSE rename: early abort");
                reply.error(libc::EIO);
                return None;
            }
        };

        if let Err(e) = rpc_json(
            adapter.as_mut(),
            "catalog:delete",
            json!({"node_id": node_id}),
        ) {
            if e != libc::ENOENT {
                info!(target: "chromvoid_lib::volume_fuse::imp", branch = "trash_delete_core_failed", node_id, flags, errno = e, "FUSE rename: trash delete failed");
                reply.error(e);
                return None;
            }
            info!(
                target: "chromvoid_lib::volume_fuse::imp",
                branch = "trash_delete_already_missing",
                node_id,
                flags,
                "FUSE rename: trash delete already missing"
            );
        } else {
            let emitted = save_and_flush_best_effort(adapter.as_mut());
            info!(
                target: "chromvoid_lib::volume_fuse::imp",
                branch = "trash_delete_ok",
                node_id,
                flags,
                events_emitted = emitted,
                "FUSE rename: trash delete ok"
            );
        }

        // IMPORTANT: Do NOT remove the inode or send notify_kernel_delete
        // here.  The kernel processed this as a RENAME, not a DELETE.
        // It moved the dentry from the source dir to .Trashes/501/.
        // Finder will immediately getattr on the destination path to
        // verify the rename succeeded.  If we remove the inode, Finder
        // gets ENOENT and thinks the rename failed → keeps showing the
        // file in the source listing.
        //
        // Instead: move the inode to the trash location so Finder can
        // verify it.  Delete the catalog data (done above) for security.
        // Schedule deferred inode cleanup after Finder has had time to
        // confirm the rename.
        let child_ino = fuse_ino_from_catalog_node_id(node_id);
        let existing = self.inode_table.get(child_ino);
        self.inode_table.upsert(InodeEntry {
            catalog_node_id: node_id,
            name: newname_str.to_string(),
            parent_ino: newparent,
            is_dir: false,
            size: existing.map(|e| e.size).unwrap_or(0),
            modified: Some(SystemTime::now()),
        });
        touch_dir_mtime(&self.inode_table, parent);
        touch_dir_mtime(&self.inode_table, newparent);
        emit_catalog_delete_event(node_id);
        info!(
            target: "chromvoid_lib::volume_fuse::imp",
            branch = "trash_rename_reply_ok",
            node_id,
            child_ino,
            src_parent = parent,
            dst_parent = newparent,
            name = name_str,
            newname = newname_str,
            "FUSE rename: replying ok to trash rename"
        );
        reply.ok();
        info!(
            target: "chromvoid_lib::volume_fuse::imp",
            branch = "trash_rename_replied",
            node_id,
            child_ino,
            "FUSE rename: reply.ok() sent for trash rename"
        );
        // The ghost inode at .Trashes/501/ will be cleaned up by
        // retain_children on the next readdir of that directory.
        None
    }
}
