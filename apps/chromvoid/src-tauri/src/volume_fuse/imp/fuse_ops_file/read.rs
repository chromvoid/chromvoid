use super::super::*;

pub(in crate::volume_fuse::imp) fn handle_read(
    fs: &mut PrivyFilesystem,
    _req: &Request<'_>,
    ino: u64,
    _fh: u64,
    offset: i64,
    size: u32,
    _flags: i32,
    _lock_owner: Option<u64>,
    reply: ReplyData,
) {
    trace!(target: "chromvoid_lib::volume_fuse::imp", ino, fh = _fh, offset, size, "FUSE read");

    let entry = match fs.inode_table.get(ino) {
        Some(e) => e,
        None => {
            reply.error(libc::ENOENT);
            return;
        }
    };

    if entry.is_dir {
        reply.error(libc::EISDIR);
        return;
    }

    // Prefer open-backed reads.
    if _fh != 0 {
        // If the file is being written via another fh, prefer reading from the staged
        // temp file to avoid racing core upload/commit while Finder/QuickLook probes.
        let writer_tmp: Option<PathBuf> = fs.open_files.lock().ok().and_then(|map| {
            let st = map.get(&_fh)?;
            if st.ino != ino || st.writeable {
                return None;
            }
            map.iter()
                .find(|(other_fh, other)| **other_fh != _fh && other.ino == ino && other.writeable)
                .map(|(_, other)| other.tmp_path.clone())
        });

        if let Some(tmp_path) = writer_tmp {
            if let Ok(mut f) = File::open(&tmp_path) {
                let off = if offset < 0 { 0 } else { offset as u64 };
                if f.seek(SeekFrom::Start(off)).is_ok() {
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

        if let Ok(mut map) = fs.open_files.lock() {
            if let Some(st) = map.get_mut(&_fh) {
                if st.ino == ino {
                    // Writable opens use a staged temp file.
                    if st.writeable {
                        let tmp_path = st.tmp_path.clone();
                        drop(map);

                        let mut f = match File::open(&tmp_path) {
                            Ok(f) => f,
                            Err(_) => {
                                reply.error(libc::EIO);
                                return;
                            }
                        };
                        let off = if offset < 0 { 0 } else { offset as u64 };
                        if f.seek(SeekFrom::Start(off)).is_err() {
                            reply.error(libc::EIO);
                            return;
                        }
                        let mut buf = vec![0u8; size as usize];
                        let n = match f.read(&mut buf) {
                            Ok(n) => n,
                            Err(_) => {
                                reply.error(libc::EIO);
                                return;
                            }
                        };
                        buf.truncate(n);
                        reply.data(&buf);
                        return;
                    }

                    // Read-only opens stream from core and keep a per-fh reader.
                    let target_off = if offset < 0 { 0 } else { offset as u64 };

                    if st.read_stream.is_none() || target_off < st.read_pos {
                        st.read_stream = Some(match fs.open_download_stream(st.node_id) {
                            Ok(r) => r,
                            Err(e) => {
                                reply.error(e);
                                return;
                            }
                        });
                        st.read_pos = 0;
                    }

                    // Skip forward if needed.
                    if target_off > st.read_pos {
                        let mut to_skip = target_off - st.read_pos;
                        let mut sink = vec![0u8; 64 * 1024];
                        while to_skip > 0 {
                            let want = std::cmp::min(to_skip as usize, sink.len());
                            let n = match st
                                .read_stream
                                .as_mut()
                                .expect("read_stream")
                                .read(&mut sink[..want])
                            {
                                Ok(n) => n,
                                Err(_) => {
                                    reply.error(libc::EIO);
                                    return;
                                }
                            };
                            if n == 0 {
                                // EOF while skipping.
                                reply.data(&[]);
                                return;
                            }
                            st.read_pos = st.read_pos.saturating_add(n as u64);
                            to_skip = to_skip.saturating_sub(n as u64);
                        }
                    }

                    let mut out = vec![0u8; size as usize];
                    let n = match st.read_stream.as_mut().expect("read_stream").read(&mut out) {
                        Ok(n) => n,
                        Err(_) => {
                            reply.error(libc::EIO);
                            return;
                        }
                    };
                    out.truncate(n);
                    st.read_pos = st.read_pos.saturating_add(n as u64);
                    reply.data(&out);
                    return;
                }
            }
        }
    }

    // Fallback: stream from core without caching.
    let mut reader = match fs.open_download_stream(entry.catalog_node_id) {
        Ok(r) => r,
        Err(e) => {
            reply.error(e);
            return;
        }
    };

    let target_off = if offset < 0 { 0 } else { offset as u64 };
    let mut to_skip = target_off;
    let mut sink = vec![0u8; 64 * 1024];
    while to_skip > 0 {
        let want = std::cmp::min(to_skip as usize, sink.len());
        let n = match reader.read(&mut sink[..want]) {
            Ok(n) => n,
            Err(_) => {
                reply.error(libc::EIO);
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
            reply.error(libc::EIO);
            return;
        }
    };
    out.truncate(n);
    reply.data(&out);
}
