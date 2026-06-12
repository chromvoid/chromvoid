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

fn truncate_target_fh(
    open_files: &HashMap<u64, OpenFileState>,
    ino: u64,
    fh: Option<u64>,
) -> Result<u64, i32> {
    if let Some(fh) = fh {
        return match open_files.get(&fh) {
            Some(st) if st.ino == ino => Ok(fh),
            Some(_) => Err(libc::EIO),
            None => Err(libc::EBADF),
        };
    }

    open_files
        .iter()
        .find(|(_, st)| st.ino == ino && st.writeable)
        .map(|(fh, _)| *fh)
        .ok_or(libc::EOPNOTSUPP)
}

fn truncate_open_file_state(
    inode_table: &InodeTable,
    open_files: &Mutex<HashMap<u64, OpenFileState>>,
    ino: u64,
    fh: Option<u64>,
    new_size: u64,
) -> Result<(), i32> {
    let target_fh = {
        let map = open_files.lock().map_err(|_| libc::EIO)?;
        truncate_target_fh(&map, ino, fh)?
    };

    let mut map = open_files.lock().map_err(|_| libc::EIO)?;
    let st = map.get_mut(&target_fh).ok_or(libc::EBADF)?;
    if st.ino != ino {
        return Err(libc::EIO);
    }
    if !st.writeable {
        return Err(libc::EBADF);
    }
    let f = OpenOptions::new()
        .write(true)
        .open(&st.tmp_path)
        .map_err(|_| libc::EIO)?;
    f.set_len(new_size).map_err(|_| libc::EIO)?;
    st.dirty = true;

    if let Some(mut entry) = inode_table.get(ino) {
        entry.size = new_size;
        entry.modified = Some(SystemTime::now());
        inode_table.upsert(entry);
    }

    Ok(())
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
        if let Some(entry) = fs.inode_table.get(ino) {
            if entry.is_dir {
                reply.error(fuse_errno(libc::EISDIR));
                return;
            }
        }

        if let Err(e) = truncate_open_file_state(&fs.inode_table, &fs.open_files, ino, fh, new_size)
        {
            reply.error(fuse_errno(e));
            return;
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

#[cfg(test)]
mod tests {
    use super::*;

    fn open_state(ino: u64, writeable: bool, tmp_path: PathBuf) -> OpenFileState {
        OpenFileState {
            ino,
            node_id: 9,
            tmp_path,
            writeable,
            dirty: false,
            read_stream: None,
            read_pos: 0,
        }
    }

    #[test]
    fn truncate_target_fh_rejects_closed_file() {
        let open_files = HashMap::new();

        assert_eq!(
            truncate_target_fh(&open_files, 42, None),
            Err(libc::EOPNOTSUPP)
        );
    }

    #[test]
    fn truncate_open_file_state_updates_staged_file_and_inode() {
        let dir = tempfile::tempdir().expect("tempdir");
        let tmp_path = dir.path().join("fh-1");
        std::fs::write(&tmp_path, b"abcdef").expect("write temp");

        let inode_table = InodeTable::default();
        inode_table.upsert(InodeEntry {
            catalog_node_id: 9,
            name: "file.txt".to_string(),
            parent_ino: FUSE_ROOT_ID,
            is_dir: false,
            size: 6,
            modified: None,
        });
        let ino = fuse_ino_from_catalog_node_id(9);
        let open_files = Mutex::new(HashMap::from([(
            1,
            open_state(ino, true, tmp_path.clone()),
        )]));

        truncate_open_file_state(&inode_table, &open_files, ino, Some(1), 3)
            .expect("truncate open file");

        assert_eq!(std::fs::metadata(&tmp_path).expect("stat temp").len(), 3);
        let state = open_files
            .lock()
            .expect("open files lock")
            .get(&1)
            .expect("open file state")
            .dirty;
        assert!(state);
        assert_eq!(inode_table.get(ino).expect("inode entry").size, 3);
    }
}
