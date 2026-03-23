use super::super::helpers::*;
use super::super::*;

pub(in crate::volume_fuse::imp) fn handle_open(
    fs: &mut PrivyFilesystem,
    _req: &Request<'_>,
    ino: u64,
    flags: i32,
    reply: ReplyOpen,
) {
    let mut entry = match fs.inode_table.get(ino) {
        Some(e) => e,
        None => {
            reply.error(libc::ENOENT);
            return;
        }
    };

    if let Some(path) = build_catalog_path(&fs.inode_table, ino) {
        if is_system_path(&path) {
            reply.error(libc::EACCES);
            return;
        }
    }

    if entry.is_dir {
        reply.error(libc::EISDIR);
        return;
    }

    let writeable = match flags & libc::O_ACCMODE {
        libc::O_WRONLY | libc::O_RDWR => true,
        _ => false,
    };

    let truncate = (flags & libc::O_TRUNC) != 0;

    debug!(
        target: "chromvoid_lib::volume_fuse::imp",
        ino,
        name = entry.name.as_str(),
        flags,
        writeable,
        truncate,
        "FUSE open"
    );

    // If the file was modified/deleted outside of FUSE while mounted (e.g. via WebView),
    // the kernel may still hold a stale inode. Re-validate existence via core.
    if writeable {
        let fresh = match fs.find_or_list_child(entry.parent_ino, &entry.name) {
            Ok(e) => e,
            Err(e) => {
                fs.inode_table.remove(ino);
                reply.error(e);
                return;
            }
        };

        // If the name now resolves to a different node_id, treat this inode as stale.
        if fuse_ino_from_catalog_node_id(fresh.catalog_node_id) != ino {
            fs.inode_table.remove(ino);
            reply.error(libc::ENOENT);
            return;
        }

        entry = fresh;
    }

    let fh = fs.alloc_fh();
    let tmp_path = fs.fh_tmp_path(fh);

    // For read-only opens, don't pre-download the entire file.
    // Finder expects open() to be fast and will call read() for content.
    if writeable {
        // Ensure staging dir exists.
        if std::fs::create_dir_all(&fs.staging_dir).is_err() {
            reply.error(libc::EIO);
            return;
        }

        if truncate {
            // O_TRUNC: don't download, just start with an empty temp file.
            if OpenOptions::new()
                .create(true)
                .write(true)
                .truncate(true)
                .open(&tmp_path)
                .is_err()
            {
                reply.error(libc::EIO);
                return;
            }

            if let Some(mut cached) = fs.inode_table.get(ino) {
                cached.size = 0;
                cached.modified = Some(SystemTime::now());
                fs.inode_table.upsert(cached);
            }
        } else {
            // Materialize current content to temp file for writable edits.
            if let Err(e) = fs.download_to_path(entry.catalog_node_id, &tmp_path) {
                reply.error(e);
                return;
            }
        }
    }

    if let Ok(mut map) = fs.open_files.lock() {
        map.insert(
            fh,
            OpenFileState {
                ino,
                node_id: entry.catalog_node_id,
                tmp_path,
                writeable,
                dirty: truncate,
                read_stream: None,
                read_pos: 0,
            },
        );
    }

    reply.opened(fh, 0);
}
