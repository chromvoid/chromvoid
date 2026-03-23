use super::super::helpers::*;
use super::super::*;

pub(in crate::volume_fuse::imp) fn handle_readdir(
    fs: &mut PrivyFilesystem,
    _req: &Request<'_>,
    ino: u64,
    _fh: u64,
    offset: i64,
    mut reply: ReplyDirectory,
) {
    trace!(target: "chromvoid_lib::volume_fuse::imp", ino, fh = _fh, offset, "FUSE readdir");

    let dir_path = if ino == FUSE_ROOT_ID {
        "/".to_string()
    } else {
        match build_catalog_path(&fs.inode_table, ino) {
            Some(p) => p,
            None => {
                reply.error(libc::ENOENT);
                return;
            }
        }
    };

    if is_system_path(&dir_path) {
        reply.error(libc::EACCES);
        return;
    }

    let parent_ino = if ino == FUSE_ROOT_ID {
        FUSE_ROOT_ID
    } else {
        fs.inode_table
            .get(ino)
            .map(|e| e.parent_ino)
            .unwrap_or(FUSE_ROOT_ID)
    };

    let is_trash_dir = is_trash_path(&dir_path);

    let path_val = if dir_path == "/" {
        serde_json::Value::Null
    } else {
        serde_json::Value::String(dir_path.clone())
    };

    let mut adapter = match fs.adapter.lock() {
        Ok(a) => a,
        Err(_) => {
            reply.error(libc::EIO);
            return;
        }
    };

    let value = match rpc_json(
        adapter.as_mut(),
        "catalog:list",
        json!({"path": path_val, "include_hidden": null}),
    ) {
        Ok(v) => v,
        Err(e) => {
            reply.error(e);
            return;
        }
    };

    let res: CatalogListResponse = match serde_json::from_value(value) {
        Ok(r) => r,
        Err(_) => {
            reply.error(libc::EIO);
            return;
        }
    };

    drop(adapter);

    let mut entries: Vec<(u64, FileType, String)> = vec![
        (ino, FileType::Directory, ".".to_string()),
        (parent_ino, FileType::Directory, "..".to_string()),
    ];

    let mut keep_names: HashSet<String> = HashSet::new();
    for item in res.items {
        keep_names.insert(item.name.clone());
        let child_ino = fuse_ino_from_catalog_node_id(item.node_id);
        let ft = if item.is_dir {
            FileType::Directory
        } else {
            FileType::RegularFile
        };
        fs.inode_table.upsert(InodeEntry {
            catalog_node_id: item.node_id,
            name: item.name.clone(),
            parent_ino: ino,
            is_dir: item.is_dir,
            size: item.size.unwrap_or(0),
            modified: Some(ms_to_system_time(item.updated_at)),
        });
        entries.push((child_ino, ft, item.name));
    }

    // For trash directories, skip retain_children so that ghost
    // inodes placed by the rename handler survive for lookup().
    if !is_trash_dir {
        fs.inode_table.retain_children(ino, &keep_names);
    }

    if ino == FUSE_ROOT_ID || is_trash_dir {
        let mut sample_names: Vec<&str> = entries
            .iter()
            .skip(2)
            .map(|(_, _, name)| name.as_str())
            .collect();
        sample_names.sort_unstable();
        if sample_names.len() > 16 {
            sample_names.truncate(16);
        }
        debug!(
            target: "chromvoid_lib::volume_fuse::imp",
            ino,
            dir = dir_path.as_str(),
            items = keep_names.len(),
            sample = ?sample_names,
            "FUSE readdir snapshot"
        );
    }

    for (i, (child_ino, ft, name)) in entries.iter().enumerate().skip(offset as usize) {
        if reply.add(*child_ino, (i + 1) as i64, *ft, name) {
            break;
        }
    }
    reply.ok();
}
