use super::super::*;

pub(in crate::volume_fuse::imp) fn handle_write(
    fs: &PrivyFilesystem,
    _req: &Request,
    ino: u64,
    fh: u64,
    offset: u64,
    data: &[u8],
    _write_flags: u32,
    _flags: i32,
    _lock_owner: Option<u64>,
    reply: ReplyWrite,
) {
    trace!(target: "chromvoid_lib::volume_fuse::imp", ino, fh, offset, len = data.len(), "FUSE write");

    let mut map = match fs.open_files.lock() {
        Ok(m) => m,
        Err(_) => {
            reply.error(fuse_errno(libc::EIO));
            return;
        }
    };
    let st = match map.get_mut(&fh) {
        Some(s) => s,
        None => {
            reply.error(fuse_errno(libc::EIO));
            return;
        }
    };
    if st.ino != ino {
        reply.error(fuse_errno(libc::EIO));
        return;
    }
    if !st.writeable {
        reply.error(fuse_errno(libc::EPERM));
        return;
    }

    let off = offset;
    let mut f = match OpenOptions::new().read(true).write(true).open(&st.tmp_path) {
        Ok(f) => f,
        Err(_) => {
            reply.error(fuse_errno(libc::EIO));
            return;
        }
    };
    if f.seek(SeekFrom::Start(off)).is_err() {
        reply.error(fuse_errno(libc::EIO));
        return;
    }
    if f.write_all(data).is_err() {
        reply.error(fuse_errno(libc::EIO));
        return;
    }
    st.dirty = true;

    // Keep inode size monotonic in cache.
    if let Some(mut entry) = fs.inode_table.get(ino) {
        let end = off.saturating_add(data.len() as u64);
        if end > entry.size {
            entry.size = end;
        }
        entry.modified = Some(SystemTime::now());
        fs.inode_table.upsert(entry);
    }

    reply.written(data.len() as u32);
}
