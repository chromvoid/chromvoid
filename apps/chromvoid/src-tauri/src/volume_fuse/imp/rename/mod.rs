mod standard;
mod swap;
mod trash;

use super::helpers::*;
use super::*;

impl PrivyFilesystem {
    pub(super) fn do_rename(
        &mut self,
        parent: u64,
        name_str: &str,
        newparent: u64,
        newname_str: &str,
        flags: u32,
        reply: ReplyEmpty,
    ) {
        info!(
            target: "chromvoid_lib::volume_fuse::imp",
            branch = "entry",
            parent,
            name = name_str,
            newparent,
            newname = newname_str,
            flags,
            "FUSE rename"
        );

        if let Err(e) = self.guard_system_child(parent, name_str) {
            info!(target: "chromvoid_lib::volume_fuse::imp", branch = "guard_src_parent", errno = e, flags, "FUSE rename: guard blocked");
            reply.error(e);
            return;
        }
        if let Err(e) = self.guard_system_child(newparent, newname_str) {
            info!(target: "chromvoid_lib::volume_fuse::imp", branch = "guard_dst_parent", errno = e, flags, "FUSE rename: guard blocked");
            reply.error(e);
            return;
        }

        // No-op rename.
        if parent == newparent && name_str == newname_str {
            info!(target: "chromvoid_lib::volume_fuse::imp", branch = "noop_same_parent_and_name", flags, "FUSE rename: no-op");
            reply.ok();
            return;
        }

        let src = match self.find_or_list_child(parent, name_str) {
            Ok(e) => e,
            Err(e) => {
                info!(target: "chromvoid_lib::volume_fuse::imp", branch = "src_lookup_failed", errno = e, flags, "FUSE rename: source lookup failed");
                reply.error(e);
                return;
            }
        };
        let node_id = src.catalog_node_id;

        #[cfg(target_os = "macos")]
        const FLAG_SWAP: u32 = libc::RENAME_SWAP as u32;
        #[cfg(target_os = "macos")]
        const FLAG_EXCL: u32 = libc::RENAME_EXCL as u32;

        #[cfg(target_os = "linux")]
        const FLAG_SWAP: u32 = libc::RENAME_EXCHANGE as u32;
        #[cfg(target_os = "linux")]
        const FLAG_EXCL: u32 = libc::RENAME_NOREPLACE as u32;

        let flag_swap = (flags & FLAG_SWAP) != 0;
        let flag_excl = (flags & FLAG_EXCL) != 0;
        let known_flags = FLAG_SWAP | FLAG_EXCL;
        let unsupported_flags = flags & !known_flags;
        if unsupported_flags != 0 {
            info!(
                target: "chromvoid_lib::volume_fuse::imp",
                branch = "unsupported_flags_present",
                flags,
                unsupported_flags,
                "FUSE rename: continuing with unsupported flags"
            );
        }

        let src_parent_path = if parent == FUSE_ROOT_ID {
            "/".to_string()
        } else {
            match build_catalog_path(&self.inode_table, parent) {
                Some(p) => p,
                None => {
                    info!(target: "chromvoid_lib::volume_fuse::imp", branch = "src_parent_path_missing", errno = libc::ENOENT, flags, "FUSE rename: early abort");
                    reply.error(libc::ENOENT);
                    return;
                }
            }
        };

        let dest_parent_path = if newparent == FUSE_ROOT_ID {
            "/".to_string()
        } else {
            match build_catalog_path(&self.inode_table, newparent) {
                Some(p) => p,
                None => {
                    info!(target: "chromvoid_lib::volume_fuse::imp", branch = "dst_parent_path_missing", errno = libc::ENOENT, flags, "FUSE rename: early abort");
                    reply.error(libc::ENOENT);
                    return;
                }
            }
        };
        info!(
            target: "chromvoid_lib::volume_fuse::imp",
            branch = "resolved_paths",
            node_id,
            src_parent_path,
            dest_parent_path,
            flags,
            "FUSE rename: resolved parent paths"
        );
        // Trash branch.
        let reply = match self.rename_trash(
            parent,
            name_str,
            newparent,
            newname_str,
            node_id,
            &dest_parent_path,
            flags,
            reply,
        ) {
            Some(r) => r,
            None => return,
        };

        // Swap branch.
        if flag_swap {
            let _ = self.rename_swap(
                parent,
                name_str,
                newparent,
                newname_str,
                &src,
                node_id,
                &src_parent_path,
                &dest_parent_path,
                flags,
                reply,
            );
            return;
        }

        // Standard rename (excl check, replace, move, rename).
        self.rename_standard(
            parent,
            name_str,
            newparent,
            newname_str,
            &src,
            node_id,
            &dest_parent_path,
            flag_excl,
            flags,
            reply,
        );
    }
}
