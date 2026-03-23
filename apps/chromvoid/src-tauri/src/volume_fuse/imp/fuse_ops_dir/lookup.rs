use super::super::helpers::*;
use super::super::*;

pub(in crate::volume_fuse::imp) fn handle_lookup(
    fs: &mut PrivyFilesystem,
    _req: &Request<'_>,
    parent: u64,
    name: &OsStr,
    reply: ReplyEntry,
) {
    let name_str = match name.to_str() {
        Some(n) => n,
        None => {
            reply.error(libc::ENOENT);
            return;
        }
    };

    trace!(target: "chromvoid_lib::volume_fuse::imp", parent, name = name_str, "FUSE lookup");

    if let Err(e) = fs.guard_system_child(parent, name_str) {
        reply.error(e);
        return;
    }

    let entry = match fs.find_or_list_child(parent, name_str) {
        Ok(e) => e,
        Err(e) => {
            reply.error(e);
            return;
        }
    };
    let ino = fuse_ino_from_catalog_node_id(entry.catalog_node_id);
    let mtime = entry.modified.unwrap_or(SystemTime::now());
    let mut attr = make_attr(ino, entry.size, entry.is_dir, mtime);
    apply_trash_mode_overrides(&fs.inode_table, ino, &mut attr);
    reply.entry(&ATTR_TTL, &attr, 0);
}
