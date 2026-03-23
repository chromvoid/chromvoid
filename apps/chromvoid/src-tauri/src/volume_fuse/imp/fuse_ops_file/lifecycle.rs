use super::super::*;

pub(in crate::volume_fuse::imp) fn handle_flush(
    fs: &mut PrivyFilesystem,
    _req: &Request<'_>,
    ino: u64,
    fh: u64,
    _lock_owner: u64,
    reply: ReplyEmpty,
) {
    trace!(target: "chromvoid_lib::volume_fuse::imp", ino, fh, "FUSE flush");

    let mut map = match fs.open_files.lock() {
        Ok(m) => m,
        Err(_) => {
            reply.error(libc::EIO);
            return;
        }
    };
    let Some(st) = map.get_mut(&fh) else {
        reply.ok();
        return;
    };
    if st.ino != ino {
        reply.error(libc::EIO);
        return;
    }
    match fs.flush_open_file(ino, st) {
        Ok(()) => reply.ok(),
        Err(e) => reply.error(e),
    }
}

pub(in crate::volume_fuse::imp) fn handle_fsync(
    fs: &mut PrivyFilesystem,
    _req: &Request<'_>,
    ino: u64,
    fh: u64,
    _datasync: bool,
    reply: ReplyEmpty,
) {
    // Treat fsync as a durability hint; do the same work as flush.
    handle_flush(fs, _req, ino, fh, 0, reply)
}

pub(in crate::volume_fuse::imp) fn handle_release(
    fs: &mut PrivyFilesystem,
    _req: &Request<'_>,
    ino: u64,
    fh: u64,
    _flags: i32,
    _lock_owner: Option<u64>,
    _flush: bool,
    reply: ReplyEmpty,
) {
    trace!(target: "chromvoid_lib::volume_fuse::imp", ino, fh, "FUSE release");

    let mut st = {
        let mut map = match fs.open_files.lock() {
            Ok(m) => m,
            Err(_) => {
                reply.ok();
                return;
            }
        };
        map.remove(&fh)
    };

    let mut flush_err: Option<i32> = None;
    if let Some(ref mut st) = st {
        if st.ino == ino {
            if let Err(e) = fs.flush_open_file(ino, st) {
                warn!(
                    "FUSE: flush on release failed ino={} fh={} err={}",
                    ino, fh, e
                );
                flush_err = Some(e);
            }
        }

        // If flush failed, keep the temp file for debugging / recovery.
        if flush_err.is_none() {
            let _ = std::fs::remove_file(&st.tmp_path);
        }
    }

    if let Some(e) = flush_err {
        reply.error(e);
    } else {
        reply.ok();
    }
}
