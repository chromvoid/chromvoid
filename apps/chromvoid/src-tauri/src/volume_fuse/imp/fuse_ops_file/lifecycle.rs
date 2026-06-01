use std::collections::HashMap;
use std::sync::Mutex;

use super::super::*;

fn take_open_file_for_release(
    open_files: &Mutex<HashMap<u64, OpenFileState>>,
    fh: u64,
) -> Result<Option<OpenFileState>, i32> {
    let mut map = open_files.lock().map_err(|_| libc::EIO)?;
    Ok(map.remove(&fh))
}

fn validate_release_inode(state: &OpenFileState, ino: u64, fh: u64) -> Result<(), i32> {
    if state.ino == ino {
        return Ok(());
    }
    warn!(
        target: "chromvoid_lib::volume_fuse::imp",
        ino,
        state_ino = state.ino,
        fh,
        "FUSE release: open file inode mismatch"
    );
    Err(libc::EIO)
}

pub(in crate::volume_fuse::imp) fn handle_flush(
    fs: &PrivyFilesystem,
    _req: &Request,
    ino: u64,
    fh: u64,
    _lock_owner: u64,
    reply: ReplyEmpty,
) {
    trace!(target: "chromvoid_lib::volume_fuse::imp", ino, fh, "FUSE flush");

    let mut map = match fs.open_files.lock() {
        Ok(m) => m,
        Err(_) => {
            reply.error(fuse_errno(libc::EIO));
            return;
        }
    };
    let Some(st) = map.get_mut(&fh) else {
        reply.ok();
        return;
    };
    if st.ino != ino {
        reply.error(fuse_errno(libc::EIO));
        return;
    }
    match fs.flush_open_file(ino, st) {
        Ok(()) => reply.ok(),
        Err(e) => reply.error(fuse_errno(e)),
    }
}

pub(in crate::volume_fuse::imp) fn handle_fsync(
    fs: &PrivyFilesystem,
    _req: &Request,
    ino: u64,
    fh: u64,
    _datasync: bool,
    reply: ReplyEmpty,
) {
    // Treat fsync as a durability hint; do the same work as flush.
    handle_flush(fs, _req, ino, fh, 0, reply)
}

pub(in crate::volume_fuse::imp) fn handle_release(
    fs: &PrivyFilesystem,
    _req: &Request,
    ino: u64,
    fh: u64,
    _flags: i32,
    _lock_owner: Option<u64>,
    _flush: bool,
    reply: ReplyEmpty,
) {
    trace!(target: "chromvoid_lib::volume_fuse::imp", ino, fh, "FUSE release");

    let mut st = match take_open_file_for_release(&fs.open_files, fh) {
        Ok(st) => st,
        Err(errno) => {
            reply.error(fuse_errno(errno));
            return;
        }
    };

    let mut flush_err: Option<i32> = None;
    if let Some(ref mut st) = st {
        match validate_release_inode(st, ino, fh) {
            Ok(()) => {
                if let Err(e) = fs.flush_open_file(ino, st) {
                    warn!(
                        "FUSE: flush on release failed ino={} fh={} err={}",
                        ino, fh, e
                    );
                    flush_err = Some(e);
                }
            }
            Err(e) => {
                flush_err = Some(e);
            }
        }

        // If flush failed, keep the temp file for debugging / recovery.
        if flush_err.is_none() {
            let _ = std::fs::remove_file(&st.tmp_path);
        }
    }

    if let Some(e) = flush_err {
        reply.error(fuse_errno(e));
    } else {
        reply.ok();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn open_file_state(ino: u64) -> OpenFileState {
        OpenFileState {
            ino,
            node_id: 7,
            tmp_path: PathBuf::from("/tmp/chromvoid-release-test"),
            writeable: false,
            dirty: false,
            read_stream: None,
            read_pos: 0,
        }
    }

    fn poisoned_open_files() -> Mutex<HashMap<u64, OpenFileState>> {
        let map = Mutex::new(HashMap::new());
        let _ = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            let _guard = map.lock().expect("open files lock");
            panic!("poison open files for test");
        }));
        map
    }

    #[test]
    fn take_open_file_for_release_removes_handle() {
        let open_files = Mutex::new(HashMap::from([(9, open_file_state(2))]));

        let state = take_open_file_for_release(&open_files, 9)
            .expect("open file lookup")
            .expect("open file state");

        assert_eq!(state.ino, 2);
        assert!(take_open_file_for_release(&open_files, 9)
            .expect("second open file lookup")
            .is_none());
    }

    #[test]
    fn take_open_file_for_release_reports_poisoned_lock() {
        let open_files = poisoned_open_files();

        assert!(matches!(
            take_open_file_for_release(&open_files, 9),
            Err(error) if error == libc::EIO
        ));
    }

    #[test]
    fn validate_release_inode_rejects_mismatched_inode() {
        let state = open_file_state(2);

        assert_eq!(validate_release_inode(&state, 3, 9), Err(libc::EIO));
    }
}
