use super::super::helpers::*;
use super::super::*;

pub(in crate::volume_fuse::imp) fn handle_mkdir(
    fs: &mut PrivyFilesystem,
    _req: &Request<'_>,
    parent: u64,
    name: &OsStr,
    _mode: u32,
    _umask: u32,
    reply: ReplyEntry,
) {
    let name_str = match name.to_str() {
        Some(n) => n,
        None => {
            reply.error(libc::EINVAL);
            return;
        }
    };

    info!(target: "chromvoid_lib::volume_fuse::imp", parent, name = name_str, "FUSE mkdir");

    if let Err(e) = fs.guard_system_child(parent, name_str) {
        reply.error(e);
        return;
    }

    let parent_path = if parent == FUSE_ROOT_ID {
        "/".to_string()
    } else {
        match build_catalog_path(&fs.inode_table, parent) {
            Some(p) => p,
            None => {
                reply.error(libc::ENOENT);
                return;
            }
        }
    };
    let parent_val = if parent_path == "/" {
        serde_json::Value::Null
    } else {
        serde_json::Value::String(parent_path)
    };

    let _guard = match fs.write_lock.lock() {
        Ok(g) => g,
        Err(_) => {
            reply.error(libc::EIO);
            return;
        }
    };

    let node_id = {
        let mut adapter = match fs.adapter.lock() {
            Ok(a) => a,
            Err(_) => {
                reply.error(libc::EIO);
                return;
            }
        };
        let value = match rpc_json(
            adapter.as_mut(),
            "catalog:createDir",
            json!({"name": name_str, "parent_path": parent_val}),
        ) {
            Ok(v) => v,
            Err(e) => {
                reply.error(e);
                return;
            }
        };
        let created: NodeCreatedResponse = match serde_json::from_value(value) {
            Ok(r) => r,
            Err(_) => {
                reply.error(libc::EIO);
                return;
            }
        };
        let emitted = save_and_flush_best_effort(adapter.as_mut());
        if emitted == 0 {
            emit_catalog_create_hint_event(created.node_id);
        }
        info!(
            target: "chromvoid_lib::volume_fuse::imp",
            parent,
            name = name_str,
            node_id = created.node_id,
            events_emitted = emitted,
            "FUSE mkdir: created"
        );
        created.node_id
    };

    let ino = fuse_ino_from_catalog_node_id(node_id);
    fs.inode_table.upsert(InodeEntry {
        catalog_node_id: node_id,
        name: name_str.to_string(),
        parent_ino: parent,
        is_dir: true,
        size: 0,
        modified: Some(SystemTime::now()),
    });

    let mut attr = make_attr(ino, 0, true, SystemTime::now());
    apply_trash_mode_overrides(&fs.inode_table, ino, &mut attr);
    reply.entry(&ATTR_TTL, &attr, 0);
}
