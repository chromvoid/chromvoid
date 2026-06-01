use super::super::helpers::*;
use super::super::*;

pub(in crate::volume_fuse::imp) fn handle_create(
    fs: &PrivyFilesystem,
    _req: &Request,
    parent: u64,
    name: &OsStr,
    _mode: u32,
    _umask: u32,
    flags: i32,
    reply: ReplyCreate,
) {
    let name_str = match name.to_str() {
        Some(n) => n,
        None => {
            reply.error(fuse_errno(libc::EINVAL));
            return;
        }
    };

    info!(target: "chromvoid_lib::volume_fuse::imp", parent, name = name_str, flags, "FUSE create");

    if let Err(e) = fs.guard_system_child(parent, name_str) {
        reply.error(fuse_errno(e));
        return;
    }

    // If the file already exists, create() should behave like open() (unless O_EXCL).
    let existing = match fs.find_or_list_child(parent, name_str) {
        Ok(e) => Some(e),
        Err(e) if e == libc::ENOENT => None,
        Err(e) => {
            reply.error(fuse_errno(e));
            return;
        }
    };

    let writeable = match flags & libc::O_ACCMODE {
        libc::O_WRONLY | libc::O_RDWR => true,
        _ => false,
    };

    if let Some(existing) = existing {
        if (flags & libc::O_EXCL) != 0 {
            reply.error(fuse_errno(libc::EEXIST));
            return;
        }
        if existing.is_dir {
            reply.error(fuse_errno(libc::EISDIR));
            return;
        }

        let ino = fuse_ino_from_catalog_node_id(existing.catalog_node_id);
        let fh = fs.alloc_fh();
        let tmp_path = fs.fh_tmp_path(fh);
        let truncate = (flags & libc::O_TRUNC) != 0;

        if std::fs::create_dir_all(&fs.staging_dir).is_err() {
            reply.error(fuse_errno(libc::EIO));
            return;
        }

        if truncate {
            if OpenOptions::new()
                .create(true)
                .write(true)
                .truncate(true)
                .open(&tmp_path)
                .is_err()
            {
                reply.error(fuse_errno(libc::EIO));
                return;
            }
            if let Some(mut entry) = fs.inode_table.get(ino) {
                entry.size = 0;
                entry.modified = Some(SystemTime::now());
                fs.inode_table.upsert(entry);
            }
        } else {
            if fs
                .download_to_path(existing.catalog_node_id, &tmp_path)
                .is_err()
            {
                reply.error(fuse_errno(libc::EIO));
                return;
            }
        }

        let mut map = match fs.open_files.lock() {
            Ok(map) => map,
            Err(_) => {
                reply.error(fuse_errno(libc::EIO));
                return;
            }
        };
        map.insert(
            fh,
            OpenFileState {
                ino,
                node_id: existing.catalog_node_id,
                tmp_path,
                writeable,
                dirty: truncate,
                read_stream: None,
                read_pos: 0,
            },
        );

        let size = if truncate { 0 } else { existing.size };
        let attr = make_attr(ino, size, false, SystemTime::now());
        reply.created(
            &ATTR_TTL,
            &attr,
            fuser::Generation(0),
            fuse_fh(fh),
            FopenFlags::empty(),
        );
        return;
    }

    let parent_path = if parent == FUSE_ROOT_ID {
        "/".to_string()
    } else {
        match build_catalog_path(&fs.inode_table, parent) {
            Some(p) => p,
            None => {
                reply.error(fuse_errno(libc::ENOENT));
                return;
            }
        }
    };
    let parent_val = if parent_path == "/" {
        serde_json::Value::Null
    } else {
        serde_json::Value::String(parent_path)
    };

    // Serialize catalog mutations.
    let _guard = match fs.write_lock.lock() {
        Ok(g) => g,
        Err(_) => {
            reply.error(fuse_errno(libc::EIO));
            return;
        }
    };

    // Create an empty file through the stream upload boundary.
    let node_id = {
        let mut adapter = match fs.adapter.lock() {
            Ok(a) => a,
            Err(_) => {
                reply.error(fuse_errno(libc::EIO));
                return;
            }
        };
        let req = RpcRequest::new(
            "catalog:upload".to_string(),
            json!({
                "parent_path": parent_val,
                "name": name_str,
                "total_size": 0,
                "mime_type": serde_json::Value::Null,
                "chunk_size": serde_json::Value::Null,
                "size": 0,
                "offset": 0,
            }),
        );
        let value =
            match adapter.handle_with_stream(&req, Some(RpcInputStream::from_bytes(Vec::new()))) {
                RpcReply::Json(RpcResponse::Success { result, .. }) => result,
                RpcReply::Json(RpcResponse::Error { code, .. }) => {
                    reply.error(fuse_errno(rpc_code_to_errno(code.as_deref())));
                    return;
                }
                RpcReply::Stream(_) | RpcReply::RangeStream(_) => {
                    reply.error(fuse_errno(libc::EIO));
                    return;
                }
            };
        let Some(node_id) = upload_node_id_from_value(&value) else {
            reply.error(fuse_errno(libc::EIO));
            return;
        };
        let emitted = save_and_flush_best_effort(&fs.event_sink, adapter.as_mut());
        if emitted == 0 {
            emit_catalog_create_hint_event(&fs.event_sink, node_id);
        }
        info!(
            target: "chromvoid_lib::volume_fuse::imp",
            parent,
            name = name_str,
            node_id,
            events_emitted = emitted,
            "FUSE create: prepared upload placeholder"
        );
        node_id
    };

    let ino = fuse_ino_from_catalog_node_id(node_id);
    let fh = fs.alloc_fh();
    let tmp_path = fs.fh_tmp_path(fh);

    if std::fs::create_dir_all(&fs.staging_dir).is_err() {
        reply.error(fuse_errno(libc::EIO));
        return;
    }
    if OpenOptions::new()
        .create(true)
        .write(true)
        .truncate(true)
        .open(&tmp_path)
        .is_err()
    {
        reply.error(fuse_errno(libc::EIO));
        return;
    }

    // Cache inode entry.
    fs.inode_table.upsert(InodeEntry {
        catalog_node_id: node_id,
        name: name_str.to_string(),
        parent_ino: parent,
        is_dir: false,
        size: 0,
        modified: Some(SystemTime::now()),
    });

    let mut map = match fs.open_files.lock() {
        Ok(map) => map,
        Err(_) => {
            reply.error(fuse_errno(libc::EIO));
            return;
        }
    };
    map.insert(
        fh,
        OpenFileState {
            ino,
            node_id,
            tmp_path,
            writeable,
            dirty: false,
            read_stream: None,
            read_pos: 0,
        },
    );

    let attr = make_attr(ino, 0, false, SystemTime::now());
    reply.created(
        &ATTR_TTL,
        &attr,
        fuser::Generation(0),
        fuse_fh(fh),
        FopenFlags::empty(),
    );
}

pub(in crate::volume_fuse::imp) fn handle_mknod(
    fs: &PrivyFilesystem,
    _req: &Request,
    parent: u64,
    name: &OsStr,
    mode: u32,
    _umask: u32,
    _rdev: u32,
    reply: ReplyEntry,
) {
    // macOS CLI tools commonly create files via `mknod`/`open(O_CREAT)`.
    // Support regular-file creation (size 0). Other special files are rejected.
    let file_type = mode & (libc::S_IFMT as u32);
    if file_type != (libc::S_IFREG as u32) {
        reply.error(fuse_errno(libc::EPERM));
        return;
    }

    let name_str = match name.to_str() {
        Some(n) => n,
        None => {
            reply.error(fuse_errno(libc::EINVAL));
            return;
        }
    };

    info!(target: "chromvoid_lib::volume_fuse::imp", parent, name = name_str, mode, "FUSE mknod");

    if let Err(e) = fs.guard_system_child(parent, name_str) {
        reply.error(fuse_errno(e));
        return;
    }

    if let Ok(_) = fs.find_or_list_child(parent, name_str) {
        reply.error(fuse_errno(libc::EEXIST));
        return;
    }

    let parent_path = if parent == FUSE_ROOT_ID {
        "/".to_string()
    } else {
        match build_catalog_path(&fs.inode_table, parent) {
            Some(p) => p,
            None => {
                reply.error(fuse_errno(libc::ENOENT));
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
            reply.error(fuse_errno(libc::EIO));
            return;
        }
    };

    let node_id = {
        let mut adapter = match fs.adapter.lock() {
            Ok(a) => a,
            Err(_) => {
                reply.error(fuse_errno(libc::EIO));
                return;
            }
        };
        let req = RpcRequest::new(
            "catalog:upload".to_string(),
            json!({
                "parent_path": parent_val,
                "name": name_str,
                "total_size": 0,
                "mime_type": serde_json::Value::Null,
                "chunk_size": serde_json::Value::Null,
                "size": 0,
                "offset": 0,
            }),
        );
        let value =
            match adapter.handle_with_stream(&req, Some(RpcInputStream::from_bytes(Vec::new()))) {
                RpcReply::Json(RpcResponse::Success { result, .. }) => result,
                RpcReply::Json(RpcResponse::Error { code, .. }) => {
                    reply.error(fuse_errno(rpc_code_to_errno(code.as_deref())));
                    return;
                }
                RpcReply::Stream(_) | RpcReply::RangeStream(_) => {
                    reply.error(fuse_errno(libc::EIO));
                    return;
                }
            };
        let Some(node_id) = upload_node_id_from_value(&value) else {
            reply.error(fuse_errno(libc::EIO));
            return;
        };
        let emitted = save_and_flush_best_effort(&fs.event_sink, adapter.as_mut());
        if emitted == 0 {
            emit_catalog_create_hint_event(&fs.event_sink, node_id);
        }
        info!(
            target: "chromvoid_lib::volume_fuse::imp",
            parent,
            name = name_str,
            node_id,
            events_emitted = emitted,
            "FUSE mknod: prepared upload placeholder"
        );
        node_id
    };

    let ino = fuse_ino_from_catalog_node_id(node_id);
    fs.inode_table.upsert(InodeEntry {
        catalog_node_id: node_id,
        name: name_str.to_string(),
        parent_ino: parent,
        is_dir: false,
        size: 0,
        modified: Some(SystemTime::now()),
    });

    reply.entry(
        &ATTR_TTL,
        &make_attr(ino, 0, false, SystemTime::now()),
        fuser::Generation(0),
    );
}
