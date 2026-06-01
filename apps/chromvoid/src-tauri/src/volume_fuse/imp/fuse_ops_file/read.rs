use super::super::*;

fn read_from_open_stream(
    state: &mut OpenFileState,
    target_off: u64,
    size: u32,
) -> Result<Vec<u8>, i32> {
    let Some(reader) = state.read_stream.as_mut() else {
        return Err(libc::EIO);
    };

    if target_off > state.read_pos {
        let mut to_skip = target_off - state.read_pos;
        let mut sink = vec![0u8; 64 * 1024];
        while to_skip > 0 {
            let want = std::cmp::min(to_skip as usize, sink.len());
            let n = reader.read(&mut sink[..want]).map_err(|_| libc::EIO)?;
            if n == 0 {
                return Ok(Vec::new());
            }
            state.read_pos = state.read_pos.saturating_add(n as u64);
            to_skip = to_skip.saturating_sub(n as u64);
        }
    }

    let mut out = vec![0u8; size as usize];
    let n = reader.read(&mut out).map_err(|_| libc::EIO)?;
    out.truncate(n);
    state.read_pos = state.read_pos.saturating_add(n as u64);
    Ok(out)
}

pub(in crate::volume_fuse::imp) fn handle_read(
    fs: &PrivyFilesystem,
    _req: &Request,
    ino: u64,
    _fh: u64,
    offset: u64,
    size: u32,
    _flags: i32,
    _lock_owner: Option<u64>,
    reply: ReplyData,
) {
    trace!(target: "chromvoid_lib::volume_fuse::imp", ino, fh = _fh, offset, size, "FUSE read");

    let entry = match fs.inode_table.get(ino) {
        Some(e) => e,
        None => {
            reply.error(fuse_errno(libc::ENOENT));
            return;
        }
    };

    if entry.is_dir {
        reply.error(fuse_errno(libc::EISDIR));
        return;
    }

    // Prefer open-backed reads.
    if _fh != 0 {
        // If the file is being written via another fh, prefer reading from the staged
        // temp file to avoid racing core upload/commit while Finder/QuickLook probes.
        let writer_tmp: Option<PathBuf> = match fs.open_files.lock() {
            Ok(map) => map.get(&_fh).and_then(|st| {
                if st.ino != ino || st.writeable {
                    return None;
                }
                map.iter()
                    .find(|(other_fh, other)| {
                        **other_fh != _fh && other.ino == ino && other.writeable
                    })
                    .map(|(_, other)| other.tmp_path.clone())
            }),
            Err(_) => {
                reply.error(fuse_errno(libc::EIO));
                return;
            }
        };

        if let Some(tmp_path) = writer_tmp {
            if let Ok(mut f) = File::open(&tmp_path) {
                if f.seek(SeekFrom::Start(offset)).is_ok() {
                    let mut buf = vec![0u8; size as usize];
                    if let Ok(n) = f.read(&mut buf) {
                        buf.truncate(n);
                        reply.data(&buf);
                        return;
                    }
                }
            }
            // If staged read fails, fall back to core streaming.
        }

        let mut map = match fs.open_files.lock() {
            Ok(map) => map,
            Err(_) => {
                reply.error(fuse_errno(libc::EIO));
                return;
            }
        };
        if let Some(st) = map.get_mut(&_fh) {
            if st.ino == ino {
                // Writable opens use a staged temp file.
                if st.writeable {
                    let tmp_path = st.tmp_path.clone();
                    drop(map);

                    let mut f = match File::open(&tmp_path) {
                        Ok(f) => f,
                        Err(_) => {
                            reply.error(fuse_errno(libc::EIO));
                            return;
                        }
                    };
                    if f.seek(SeekFrom::Start(offset)).is_err() {
                        reply.error(fuse_errno(libc::EIO));
                        return;
                    }
                    let mut buf = vec![0u8; size as usize];
                    let n = match f.read(&mut buf) {
                        Ok(n) => n,
                        Err(_) => {
                            reply.error(fuse_errno(libc::EIO));
                            return;
                        }
                    };
                    buf.truncate(n);
                    reply.data(&buf);
                    return;
                }

                // Read-only opens stream from core and keep a per-fh reader.
                let target_off = offset;

                if st.read_stream.is_none() || target_off < st.read_pos {
                    st.read_stream = Some(match fs.open_download_stream(st.node_id) {
                        Ok(r) => r,
                        Err(e) => {
                            reply.error(fuse_errno(e));
                            return;
                        }
                    });
                    st.read_pos = 0;
                }

                let out = match read_from_open_stream(st, target_off, size) {
                    Ok(out) => out,
                    Err(error) => {
                        reply.error(fuse_errno(error));
                        return;
                    }
                };
                reply.data(&out);
                return;
            }
        }
    }

    // Fallback: stream from core without caching.
    let mut reader = match fs.open_download_stream(entry.catalog_node_id) {
        Ok(r) => r,
        Err(e) => {
            reply.error(fuse_errno(e));
            return;
        }
    };

    let target_off = offset;
    let mut to_skip = target_off;
    let mut sink = vec![0u8; 64 * 1024];
    while to_skip > 0 {
        let want = std::cmp::min(to_skip as usize, sink.len());
        let n = match reader.read(&mut sink[..want]) {
            Ok(n) => n,
            Err(_) => {
                reply.error(fuse_errno(libc::EIO));
                return;
            }
        };
        if n == 0 {
            reply.data(&[]);
            return;
        }
        to_skip = to_skip.saturating_sub(n as u64);
    }

    let mut out = vec![0u8; size as usize];
    let n = match reader.read(&mut out) {
        Ok(n) => n,
        Err(_) => {
            reply.error(fuse_errno(libc::EIO));
            return;
        }
    };
    out.truncate(n);
    reply.data(&out);
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Cursor, Error, ErrorKind};

    struct FailingReader;

    impl Read for FailingReader {
        fn read(&mut self, _buf: &mut [u8]) -> std::io::Result<usize> {
            Err(Error::new(ErrorKind::Other, "read failed"))
        }
    }

    fn open_state(read_stream: Option<Box<dyn Read + Send>>) -> OpenFileState {
        OpenFileState {
            ino: 1,
            node_id: 7,
            tmp_path: PathBuf::new(),
            writeable: false,
            dirty: false,
            read_stream,
            read_pos: 0,
        }
    }

    #[test]
    fn read_from_open_stream_returns_eio_when_stream_is_missing() {
        let mut state = open_state(None);

        assert_eq!(
            read_from_open_stream(&mut state, 0, 4).expect_err("missing stream must fail"),
            libc::EIO
        );
    }

    #[test]
    fn read_from_open_stream_skips_forward_and_advances_position() {
        let mut state = open_state(Some(Box::new(Cursor::new(b"abcdef".to_vec()))));

        let bytes = read_from_open_stream(&mut state, 2, 3).expect("read stream");

        assert_eq!(bytes, b"cde");
        assert_eq!(state.read_pos, 5);
    }

    #[test]
    fn read_from_open_stream_returns_empty_when_skip_reaches_eof() {
        let mut state = open_state(Some(Box::new(Cursor::new(b"abc".to_vec()))));

        let bytes = read_from_open_stream(&mut state, 8, 3).expect("read stream");

        assert!(bytes.is_empty());
        assert_eq!(state.read_pos, 3);
    }

    #[test]
    fn read_from_open_stream_maps_reader_error_to_eio() {
        let mut state = open_state(Some(Box::new(FailingReader)));

        assert_eq!(
            read_from_open_stream(&mut state, 0, 4).expect_err("reader error must fail"),
            libc::EIO
        );
    }
}
