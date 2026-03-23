use super::super::helpers::*;
use super::super::*;

impl PrivyFilesystem {
    /// Handles the RENAME_SWAP / RENAME_EXCHANGE flag: atomically swaps
    /// source and destination entries.
    ///
    /// Returns `None` if fully handled (reply sent), or `Some(reply)` if
    /// the swap flag was not set and the caller should continue.
    pub(in crate::volume_fuse::imp) fn rename_swap(
        &mut self,
        parent: u64,
        name_str: &str,
        newparent: u64,
        newname_str: &str,
        src: &InodeEntry,
        node_id: u64,
        src_parent_path: &str,
        dest_parent_path: &str,
        flags: u32,
        reply: ReplyEmpty,
    ) -> Option<ReplyEmpty> {
        info!(target: "chromvoid_lib::volume_fuse::imp", branch = "swap_start", node_id, flags, "FUSE rename: swap branch");

        let _guard = match self.write_lock.lock() {
            Ok(g) => g,
            Err(_) => {
                info!(target: "chromvoid_lib::volume_fuse::imp", branch = "write_lock_poisoned", errno = libc::EIO, node_id, flags, "FUSE rename: early abort");
                reply.error(libc::EIO);
                return None;
            }
        };

        let dst = match self.find_or_list_child(newparent, newname_str) {
            Ok(e) => e,
            Err(e) => {
                info!(target: "chromvoid_lib::volume_fuse::imp", branch = "swap_dst_lookup_failed", node_id, flags, errno = e, "FUSE rename: swap destination lookup failed");
                reply.error(e);
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
            reply.error(libc::EINVAL);
            return None;
        }

        let tmp_name = {
            let mut out: Option<String> = None;
            for attempt in 0..16_u32 {
                let ts = SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_millis();
                let candidate = format!(".chromvoid-swap-{ts}-{attempt}");
                match self.find_or_list_child(newparent, &candidate) {
                    Ok(_) => continue,
                    Err(e) if e == libc::ENOENT => {
                        out = Some(candidate);
                        break;
                    }
                    Err(e) => {
                        info!(target: "chromvoid_lib::volume_fuse::imp", branch = "swap_tmp_lookup_failed", node_id, flags, errno = e, "FUSE rename: swap temp-name lookup failed");
                        reply.error(e);
                        return None;
                    }
                }
            }
            let Some(n) = out else {
                info!(target: "chromvoid_lib::volume_fuse::imp", branch = "swap_tmp_name_exhausted", node_id, flags, errno = libc::EEXIST, "FUSE rename: swap temp-name exhausted");
                reply.error(libc::EEXIST);
                return None;
            };
            n
        };
        info!(target: "chromvoid_lib::volume_fuse::imp", branch = "swap_tmp_name_ready", node_id, dst_node_id = dst.catalog_node_id, flags, tmp_name, "FUSE rename: swap temp name selected");

        // 1) dst -> tmp
        {
            let mut adapter = match self.adapter.lock() {
                Ok(a) => a,
                Err(_) => {
                    info!(target: "chromvoid_lib::volume_fuse::imp", branch = "swap_step1_adapter_lock_failed", node_id, dst_node_id = dst.catalog_node_id, flags, errno = libc::EIO, "FUSE rename: swap step1 lock failed");
                    reply.error(libc::EIO);
                    return None;
                }
            };
            info!(target: "chromvoid_lib::volume_fuse::imp", branch = "swap_step1_dst_to_tmp_start", node_id, dst_node_id = dst.catalog_node_id, flags, tmp_name, "FUSE rename: swap step1 start");
            if let Err(e) = rpc_json(
                adapter.as_mut(),
                "catalog:rename",
                json!({"node_id": dst.catalog_node_id, "new_name": tmp_name}),
            ) {
                info!(target: "chromvoid_lib::volume_fuse::imp", branch = "swap_step1_dst_to_tmp_failed", node_id, dst_node_id = dst.catalog_node_id, flags, errno = e, "FUSE rename: swap step1 failed");
                reply.error(e);
                return None;
            }
            let emitted = save_and_flush_best_effort(adapter.as_mut());
            info!(target: "chromvoid_lib::volume_fuse::imp", branch = "swap_step1_dst_to_tmp_ok", node_id, dst_node_id = dst.catalog_node_id, flags, events_emitted = emitted, "FUSE rename: swap step1 ok");
        }

        // 2) src -> dst location/name
        if newparent != parent {
            {
                let mut adapter = match self.adapter.lock() {
                    Ok(a) => a,
                    Err(_) => {
                        info!(target: "chromvoid_lib::volume_fuse::imp", branch = "swap_step2_move_src_adapter_lock_failed", node_id, flags, errno = libc::EIO, "FUSE rename: swap step2 move lock failed");
                        reply.error(libc::EIO);
                        return None;
                    }
                };
                info!(target: "chromvoid_lib::volume_fuse::imp", branch = "swap_step2_move_src_start", node_id, flags, dest_parent_path, "FUSE rename: swap step2 move src start");
                if let Err(e) = rpc_json(
                    adapter.as_mut(),
                    "catalog:move",
                    json!({"node_id": node_id, "new_parent_path": dest_parent_path, "new_name": serde_json::Value::Null}),
                ) {
                    info!(target: "chromvoid_lib::volume_fuse::imp", branch = "swap_step2_move_src_failed", node_id, flags, errno = e, "FUSE rename: swap step2 move src failed");
                    reply.error(e);
                    return None;
                }
                let emitted = save_and_flush_best_effort(adapter.as_mut());
                info!(target: "chromvoid_lib::volume_fuse::imp", branch = "swap_step2_move_src_ok", node_id, flags, events_emitted = emitted, "FUSE rename: swap step2 move src ok");
            }
        }
        if newname_str != name_str {
            {
                let mut adapter = match self.adapter.lock() {
                    Ok(a) => a,
                    Err(_) => {
                        info!(target: "chromvoid_lib::volume_fuse::imp", branch = "swap_step2_rename_src_adapter_lock_failed", node_id, flags, errno = libc::EIO, "FUSE rename: swap step2 rename lock failed");
                        reply.error(libc::EIO);
                        return None;
                    }
                };
                info!(target: "chromvoid_lib::volume_fuse::imp", branch = "swap_step2_rename_src_start", node_id, flags, new_name = newname_str, "FUSE rename: swap step2 rename src start");
                if let Err(e) = rpc_json(
                    adapter.as_mut(),
                    "catalog:rename",
                    json!({"node_id": node_id, "new_name": newname_str}),
                ) {
                    info!(target: "chromvoid_lib::volume_fuse::imp", branch = "swap_step2_rename_src_failed", node_id, flags, errno = e, "FUSE rename: swap step2 rename src failed");
                    reply.error(e);
                    return None;
                }
                let emitted = save_and_flush_best_effort(adapter.as_mut());
                info!(target: "chromvoid_lib::volume_fuse::imp", branch = "swap_step2_rename_src_ok", node_id, flags, events_emitted = emitted, "FUSE rename: swap step2 rename src ok");
            }
        }

        // 3) tmp(dst) -> src location/name
        if newparent != parent {
            {
                let mut adapter = match self.adapter.lock() {
                    Ok(a) => a,
                    Err(_) => {
                        info!(target: "chromvoid_lib::volume_fuse::imp", branch = "swap_step3_move_dst_adapter_lock_failed", node_id, dst_node_id = dst.catalog_node_id, flags, errno = libc::EIO, "FUSE rename: swap step3 move lock failed");
                        reply.error(libc::EIO);
                        return None;
                    }
                };
                info!(target: "chromvoid_lib::volume_fuse::imp", branch = "swap_step3_move_dst_start", node_id, dst_node_id = dst.catalog_node_id, flags, src_parent_path, "FUSE rename: swap step3 move dst start");
                if let Err(e) = rpc_json(
                    adapter.as_mut(),
                    "catalog:move",
                    json!({"node_id": dst.catalog_node_id, "new_parent_path": src_parent_path, "new_name": serde_json::Value::Null}),
                ) {
                    info!(target: "chromvoid_lib::volume_fuse::imp", branch = "swap_step3_move_dst_failed", node_id, dst_node_id = dst.catalog_node_id, flags, errno = e, "FUSE rename: swap step3 move dst failed");
                    reply.error(e);
                    return None;
                }
                let emitted = save_and_flush_best_effort(adapter.as_mut());
                info!(target: "chromvoid_lib::volume_fuse::imp", branch = "swap_step3_move_dst_ok", node_id, dst_node_id = dst.catalog_node_id, flags, events_emitted = emitted, "FUSE rename: swap step3 move dst ok");
            }
        }
        {
            let mut adapter = match self.adapter.lock() {
                Ok(a) => a,
                Err(_) => {
                    info!(target: "chromvoid_lib::volume_fuse::imp", branch = "swap_step3_rename_dst_adapter_lock_failed", node_id, dst_node_id = dst.catalog_node_id, flags, errno = libc::EIO, "FUSE rename: swap step3 rename lock failed");
                    reply.error(libc::EIO);
                    return None;
                }
            };
            info!(target: "chromvoid_lib::volume_fuse::imp", branch = "swap_step3_rename_dst_start", node_id, dst_node_id = dst.catalog_node_id, flags, new_name = name_str, "FUSE rename: swap step3 rename dst start");
            if let Err(e) = rpc_json(
                adapter.as_mut(),
                "catalog:rename",
                json!({"node_id": dst.catalog_node_id, "new_name": name_str}),
            ) {
                info!(target: "chromvoid_lib::volume_fuse::imp", branch = "swap_step3_rename_dst_failed", node_id, dst_node_id = dst.catalog_node_id, flags, errno = e, "FUSE rename: swap step3 rename dst failed");
                reply.error(e);
                return None;
            }
            let emitted = save_and_flush_best_effort(adapter.as_mut());
            info!(target: "chromvoid_lib::volume_fuse::imp", branch = "swap_step3_rename_dst_ok", node_id, dst_node_id = dst.catalog_node_id, flags, events_emitted = emitted, "FUSE rename: swap step3 rename dst ok");
        }

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

        info!(target: "chromvoid_lib::volume_fuse::imp", branch = "swap_ok", node_id, dst_node_id = dst.catalog_node_id, flags, "FUSE rename: swap ok");
        reply.ok();
        None
    }
}
