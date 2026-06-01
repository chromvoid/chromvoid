use super::helpers::*;
use super::*;

pub(super) fn handle_init(
    _fs: &PrivyFilesystem,
    _req: &Request,
    _config: &mut fuser::KernelConfig,
) -> std::io::Result<()> {
    info!("FUSE: filesystem initialized");
    Ok(())
}

pub(super) fn handle_destroy(_fs: &PrivyFilesystem) {
    info!("FUSE: filesystem destroyed");
}

pub(super) fn handle_access(
    _fs: &PrivyFilesystem,
    _req: &Request,
    _ino: u64,
    _mask: i32,
    reply: ReplyEmpty,
) {
    trace!(target: "chromvoid_lib::volume_fuse::imp", ino = _ino, mask = _mask, "FUSE access");
    reply.ok();
}

pub(super) fn handle_statfs(fs: &PrivyFilesystem, _req: &Request, _ino: u64, reply: ReplyStatfs) {
    // Finder checks filesystem stats before copy; if this is missing/zero it may report
    // "not enough free space" even when the backing disk has space.
    let (blocks, bfree, bavail, files, ffree, bsize, namelen, frsize) = {
        // SAFETY: libc::statvfs is a C-POD struct; zeroed bytes are a valid representation that
        // statvfs() will fully overwrite on success.
        let mut st: libc::statvfs = unsafe { mem::zeroed() };
        let c_path = CString::new(fs.staging_dir.as_os_str().as_bytes());
        if let Ok(c_path) = c_path {
            // SAFETY: c_path is a freshly-built CString that lives for the call; &mut st points to a
            // stack-allocated statvfs.
            let rc = unsafe { libc::statvfs(c_path.as_ptr(), &mut st) };
            if rc == 0 {
                (
                    st.f_blocks as u64,
                    st.f_bfree as u64,
                    st.f_bavail as u64,
                    st.f_files as u64,
                    st.f_ffree as u64,
                    st.f_bsize as u32,
                    st.f_namemax as u32,
                    st.f_frsize as u32,
                )
            } else {
                // Fallback: claim plenty of space to avoid Finder hard-blocking.
                let bsize: u32 = 4096;
                let blocks: u64 = 1024 * 1024 * 1024; // ~4TB
                (
                    blocks, blocks, blocks, 1_000_000, 1_000_000, bsize, 255, bsize,
                )
            }
        } else {
            let bsize: u32 = 4096;
            let blocks: u64 = 1024 * 1024 * 1024; // ~4TB
            (
                blocks, blocks, blocks, 1_000_000, 1_000_000, bsize, 255, bsize,
            )
        }
    };

    reply.statfs(blocks, bfree, bavail, files, ffree, bsize, namelen, frsize);
}

pub(super) fn handle_getattr(
    fs: &PrivyFilesystem,
    _req: &Request,
    ino: u64,
    _fh: Option<u64>,
    reply: ReplyAttr,
) {
    trace!(target: "chromvoid_lib::volume_fuse::imp", ino, fh = ?_fh, "FUSE getattr");

    if ino == FUSE_ROOT_ID {
        reply.attr(
            &ATTR_TTL,
            &make_attr(FUSE_ROOT_ID, 0, true, SystemTime::now()),
        );
        return;
    }
    match fs.inode_table.get(ino) {
        Some(entry) => {
            // If file is open with a staged temp file, prefer its current size.
            let mut size = entry.size;
            if !entry.is_dir {
                let map = match fs.open_files.lock() {
                    Ok(map) => map,
                    Err(_) => {
                        reply.error(fuse_errno(libc::EIO));
                        return;
                    }
                };
                if let Some((_, st)) = map.iter().find(|(_, st)| st.ino == ino) {
                    if let Ok(m) = std::fs::metadata(&st.tmp_path) {
                        size = m.len();
                    }
                }
            }

            let mtime = entry.modified.unwrap_or(SystemTime::now());
            let mut attr = make_attr(ino, size, entry.is_dir, mtime);
            apply_trash_mode_overrides(&fs.inode_table, ino, &mut attr);
            reply.attr(&ATTR_TTL, &attr);
        }
        None => reply.error(fuse_errno(libc::ENOENT)),
    }
}

pub(super) fn handle_setattr(
    fs: &PrivyFilesystem,
    _req: &Request,
    ino: u64,
    _mode: Option<u32>,
    _uid: Option<u32>,
    _gid: Option<u32>,
    size: Option<u64>,
    _atime: Option<fuser::TimeOrNow>,
    _mtime: Option<fuser::TimeOrNow>,
    _ctime: Option<SystemTime>,
    fh: Option<u64>,
    _crtime: Option<SystemTime>,
    _chgtime: Option<SystemTime>,
    _bkuptime: Option<SystemTime>,
    _flags: Option<u32>,
    reply: ReplyAttr,
) {
    if ino == FUSE_ROOT_ID {
        // Allow no-op setattr on root so that external `touch`
        // commands succeed.  macFUSE fires FSEvents for operations
        // from other processes, so accepting this helps Finder
        // notice directory changes after delete.
        let mtime = fs
            .inode_table
            .get(FUSE_ROOT_ID)
            .and_then(|e| e.modified)
            .unwrap_or_else(SystemTime::now);
        reply.attr(&ATTR_TTL, &make_attr(FUSE_ROOT_ID, 0, true, mtime));
        return;
    }

    if let Some(new_size) = size {
        // Try to apply truncate on an opened staged file.
        let target_fh = if let Some(fh) = fh {
            Some(fh)
        } else {
            let map = match fs.open_files.lock() {
                Ok(map) => map,
                Err(_) => {
                    reply.error(fuse_errno(libc::EIO));
                    return;
                }
            };
            map.iter().find(|(_, st)| st.ino == ino).map(|(k, _)| *k)
        };

        if let Some(fh) = target_fh {
            let mut map = match fs.open_files.lock() {
                Ok(map) => map,
                Err(_) => {
                    reply.error(fuse_errno(libc::EIO));
                    return;
                }
            };
            if let Some(st) = map.get_mut(&fh) {
                if let Ok(f) = OpenOptions::new().write(true).open(&st.tmp_path) {
                    if f.set_len(new_size).is_ok() {
                        st.dirty = true;
                        if let Some(mut entry) = fs.inode_table.get(ino) {
                            entry.size = new_size;
                            entry.modified = Some(SystemTime::now());
                            fs.inode_table.upsert(entry);
                        }
                    }
                }
            }
        }
    }

    // Always reply with best-effort current attrs.
    match fs.inode_table.get(ino) {
        Some(entry) => {
            let mtime = entry.modified.unwrap_or(SystemTime::now());
            let mut attr = make_attr(ino, entry.size, entry.is_dir, mtime);
            apply_trash_mode_overrides(&fs.inode_table, ino, &mut attr);
            reply.attr(&ATTR_TTL, &attr);
        }
        None => reply.error(fuse_errno(libc::ENOENT)),
    }
}
