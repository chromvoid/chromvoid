use super::super::helpers::save_and_flush_best_effort;
use super::super::*;

impl PrivyFilesystem {
    /// Handles the RENAME_SWAP / RENAME_EXCHANGE flag: atomically swaps
    /// source and destination entries.
    ///
    /// Returns `None` if fully handled (reply sent), or `Some(reply)` if
    /// the swap flag was not set and the caller should continue.
    pub(in crate::volume_fuse::imp) fn rename_swap(
        &self,
        parent: u64,
        name_str: &str,
        newparent: u64,
        newname_str: &str,
        src: &InodeEntry,
        node_id: u64,
        _src_parent_path: &str,
        _dest_parent_path: &str,
        flags: u32,
        reply: ReplyEmpty,
    ) -> Option<ReplyEmpty> {
        info!(target: "chromvoid_lib::volume_fuse::imp", branch = "swap_start", node_id, flags, "FUSE rename: swap branch");

        let dst = match self.find_or_list_child(newparent, newname_str) {
            Ok(e) => e,
            Err(e) => {
                info!(target: "chromvoid_lib::volume_fuse::imp", branch = "swap_dst_lookup_failed", node_id, flags, errno = e, "FUSE rename: swap destination lookup failed");
                reply.error(fuse_errno(e));
                return None;
            }
        };

        if dst.catalog_node_id == src.catalog_node_id {
            info!(target: "chromvoid_lib::volume_fuse::imp", branch = "swap_noop_same_node", node_id, flags, "FUSE rename: swap no-op");
            reply.ok();
            return None;
        }
        if dst.is_dir != src.is_dir {
            info!(target: "chromvoid_lib::volume_fuse::imp", branch = "swap_type_mismatch", node_id, dst_node_id = dst.catalog_node_id, flags, errno = libc::EINVAL, "FUSE rename: swap type mismatch");
            reply.error(fuse_errno(libc::EINVAL));
            return None;
        }

        if let Err(e) = self.rpc_json_deferred(
            "catalog:exchange",
            json!({
                "src_node_id": node_id,
                "dst_node_id": dst.catalog_node_id,
            }),
        ) {
            info!(target: "chromvoid_lib::volume_fuse::imp", branch = "swap_exchange_failed", node_id, dst_node_id = dst.catalog_node_id, flags, errno = e, "FUSE rename: exchange failed");
            reply.error(fuse_errno(e));
            return None;
        }

        let emitted = match self.adapter.lock() {
            Ok(mut adapter) => save_and_flush_best_effort(&self.event_sink, adapter.as_mut()),
            Err(_) => 0,
        };

        // Update inode cache (best-effort).
        let src_ino = fuse_ino_from_catalog_node_id(node_id);
        if let Some(mut entry) = self.inode_table.get(src_ino) {
            entry.name = newname_str.to_string();
            entry.parent_ino = newparent;
            entry.modified = Some(SystemTime::now());
            self.inode_table.upsert(entry);
        }
        let dst_ino = fuse_ino_from_catalog_node_id(dst.catalog_node_id);
        if let Some(mut entry) = self.inode_table.get(dst_ino) {
            entry.name = name_str.to_string();
            entry.parent_ino = parent;
            entry.modified = Some(SystemTime::now());
            self.inode_table.upsert(entry);
        }

        info!(target: "chromvoid_lib::volume_fuse::imp", branch = "swap_ok", node_id, dst_node_id = dst.catalog_node_id, flags, events_emitted = emitted, "FUSE rename: swap ok");
        reply.ok();
        None
    }
}
