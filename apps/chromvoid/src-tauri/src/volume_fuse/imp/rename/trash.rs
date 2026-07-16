use super::super::helpers::*;
use super::super::*;

impl PrivyFilesystem {
    /// Handles rename into a trash directory by moving the catalog node
    /// into core-managed reversible Trash.
    ///
    /// Returns `true` if the destination was a trash path and the branch was handled
    /// (reply already sent). Returns `false` if this is not a trash rename.
    pub(in crate::volume_fuse::imp) fn rename_trash(
        &self,
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

        info!(target: "chromvoid_lib::volume_fuse::imp", branch = "trash_move_start", node_id, flags, "FUSE rename: destination is trash");

        if let Err(e) = self.rpc_json_deferred("catalog:trash", json!({"node_id": node_id})) {
            if e != libc::ENOENT {
                info!(target: "chromvoid_lib::volume_fuse::imp", branch = "trash_move_core_failed", node_id, flags, errno = e, "FUSE rename: trash move failed");
                reply.error(fuse_errno(e));
                return None;
            }
            info!(
                target: "chromvoid_lib::volume_fuse::imp",
                branch = "trash_move_already_missing",
                node_id,
                flags,
                "FUSE rename: trash source already missing"
            );
        } else {
            let emitted = match self.adapter.lock() {
                Ok(mut adapter) => save_and_flush_best_effort(&self.event_sink, adapter.as_mut()),
                Err(_) => 0,
            };
            info!(
                target: "chromvoid_lib::volume_fuse::imp",
                branch = "trash_move_ok",
                node_id,
                flags,
                events_emitted = emitted,
                "FUSE rename: trash move ok"
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
        // verify it.  The durable catalog node has already moved into
        // core-managed hidden Trash.
        let child_ino = fuse_ino_from_catalog_node_id(node_id);
        let existing = self.inode_table.get(child_ino);
        let (is_dir, size, source_revision) = existing
            .map(|e| (e.is_dir, e.size, e.source_revision))
            .unwrap_or((false, 0, 0));
        self.inode_table.upsert(InodeEntry {
            catalog_node_id: node_id,
            name: newname_str.to_string(),
            parent_ino: newparent,
            is_dir,
            size,
            source_revision,
            modified: Some(SystemTime::now()),
        });
        self.clear_xattrs_for_ino(child_ino);
        touch_dir_mtime(&self.inode_table, parent);
        touch_dir_mtime(&self.inode_table, newparent);
        emit_catalog_delete_event(&self.event_sink, node_id);
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
        None
    }

    pub(in crate::volume_fuse::imp) fn rename_restore_from_trash(
        &self,
        parent: u64,
        newparent: u64,
        newname_str: &str,
        node_id: u64,
        src_parent_path: &str,
        dest_parent_path: &str,
        flags: u32,
        reply: ReplyEmpty,
    ) -> Option<ReplyEmpty> {
        if !is_trash_listing_path(src_parent_path) || is_trash_parent_path(dest_parent_path) {
            return Some(reply);
        }

        info!(
            target: "chromvoid_lib::volume_fuse::imp",
            branch = "trash_restore_start",
            node_id,
            flags,
            dest_parent_path,
            new_name = newname_str,
            "FUSE rename: restoring from trash"
        );

        if let Err(e) = self.rpc_json_deferred(
            "catalog:trash:restore",
            json!({
                "node_id": node_id,
                "restore_parent_path": dest_parent_path,
                "new_name": newname_str,
            }),
        ) {
            info!(
                target: "chromvoid_lib::volume_fuse::imp",
                branch = "trash_restore_failed",
                node_id,
                flags,
                errno = e,
                "FUSE rename: trash restore failed"
            );
            reply.error(fuse_errno(e));
            return None;
        }

        let emitted = match self.adapter.lock() {
            Ok(mut adapter) => save_and_flush_best_effort(&self.event_sink, adapter.as_mut()),
            Err(_) => 0,
        };

        let ino = fuse_ino_from_catalog_node_id(node_id);
        if let Some(mut entry) = self.inode_table.get(ino) {
            entry.name = newname_str.to_string();
            entry.parent_ino = newparent;
            entry.modified = Some(SystemTime::now());
            self.inode_table.upsert(entry);
        }
        touch_dir_mtime(&self.inode_table, parent);
        touch_dir_mtime(&self.inode_table, newparent);
        emit_catalog_create_hint_event(&self.event_sink, node_id);

        info!(
            target: "chromvoid_lib::volume_fuse::imp",
            branch = "trash_restore_ok",
            node_id,
            flags,
            events_emitted = emitted,
            "FUSE rename: trash restore ok"
        );
        reply.ok();
        None
    }
}
