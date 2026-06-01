use super::platform::*;
use super::*;

fn stored_xattr_value(
    xattrs: &Mutex<HashMap<u64, HashMap<String, Vec<u8>>>>,
    ino: u64,
    name: &str,
) -> Result<Option<Vec<u8>>, i32> {
    let map = xattrs.lock().map_err(|_| libc::EIO)?;
    Ok(map.get(&ino).and_then(|attrs| attrs.get(name).cloned()))
}

fn stored_xattr_keys(
    xattrs: &Mutex<HashMap<u64, HashMap<String, Vec<u8>>>>,
    ino: u64,
) -> Result<Vec<String>, i32> {
    let map = xattrs.lock().map_err(|_| libc::EIO)?;
    Ok(map
        .get(&ino)
        .map(|attrs| attrs.keys().cloned().collect())
        .unwrap_or_default())
}

pub(super) fn handle_getxattr(
    fs: &PrivyFilesystem,
    _req: &Request,
    ino: u64,
    name: &OsStr,
    size: u32,
    reply: ReplyXattr,
) {
    let Some(name) = name.to_str() else {
        reply.error(fuse_errno(libc::EINVAL));
        return;
    };

    trace!(target: "chromvoid_lib::volume_fuse::imp", ino, name, size, "FUSE getxattr");

    let stored = match stored_xattr_value(&fs.xattrs, ino, name) {
        Ok(stored) => stored,
        Err(errno) => {
            reply.error(fuse_errno(errno));
            return;
        }
    };

    let value: Vec<u8> = match stored {
        Some(v) => v,
        None => match name {
            "com.apple.FinderInfo" => vec![0u8; 32],
            "com.apple.ResourceFork" => Vec::new(),
            _ => {
                reply.error(fuse_errno(XATTR_NOT_FOUND));
                return;
            }
        },
    };

    if size == 0 {
        reply.size(value.len() as u32);
        return;
    }

    let size = size as usize;
    if size < value.len() {
        reply.error(fuse_errno(libc::ERANGE));
        return;
    }

    reply.data(&value);
}

pub(super) fn handle_listxattr(
    fs: &PrivyFilesystem,
    _req: &Request,
    ino: u64,
    size: u32,
    reply: ReplyXattr,
) {
    trace!(target: "chromvoid_lib::volume_fuse::imp", ino, size, "FUSE listxattr");

    let keys = match stored_xattr_keys(&fs.xattrs, ino) {
        Ok(keys) => keys,
        Err(errno) => {
            reply.error(fuse_errno(errno));
            return;
        }
    };

    let mut out: Vec<u8> = Vec::new();
    for k in keys {
        out.extend_from_slice(k.as_bytes());
        out.push(0);
    }

    if size == 0 {
        reply.size(out.len() as u32);
        return;
    }
    if (size as usize) < out.len() {
        reply.error(fuse_errno(libc::ERANGE));
        return;
    }
    reply.data(&out);
}

pub(super) fn handle_setxattr(
    fs: &PrivyFilesystem,
    _req: &Request,
    ino: u64,
    name: &OsStr,
    value: &[u8],
    flags: i32,
    _position: u32,
    reply: ReplyEmpty,
) {
    let Some(name) = name.to_str() else {
        reply.error(fuse_errno(libc::EINVAL));
        return;
    };

    trace!(
        target: "chromvoid_lib::volume_fuse::imp",
        ino,
        name,
        flags,
        value_len = value.len(),
        "FUSE setxattr"
    );

    let mut map = match fs.xattrs.lock() {
        Ok(m) => m,
        Err(_) => {
            reply.error(fuse_errno(libc::EIO));
            return;
        }
    };

    let attrs = map.entry(ino).or_default();
    let exists = attrs.contains_key(name);

    if (flags & libc::XATTR_CREATE) != 0 && exists {
        reply.error(fuse_errno(libc::EEXIST));
        return;
    }
    if (flags & libc::XATTR_REPLACE) != 0 && !exists {
        reply.error(fuse_errno(XATTR_NOT_FOUND));
        return;
    }

    attrs.insert(name.to_string(), value.to_vec());
    reply.ok();
}

pub(super) fn handle_removexattr(
    fs: &PrivyFilesystem,
    _req: &Request,
    ino: u64,
    name: &OsStr,
    reply: ReplyEmpty,
) {
    let Some(name) = name.to_str() else {
        reply.error(fuse_errno(libc::EINVAL));
        return;
    };

    trace!(target: "chromvoid_lib::volume_fuse::imp", ino, name, "FUSE removexattr");

    let mut map = match fs.xattrs.lock() {
        Ok(m) => m,
        Err(_) => {
            reply.error(fuse_errno(libc::EIO));
            return;
        }
    };

    let Some(attrs) = map.get_mut(&ino) else {
        reply.error(fuse_errno(XATTR_NOT_FOUND));
        return;
    };

    if attrs.remove(name).is_some() {
        reply.ok();
    } else {
        reply.error(fuse_errno(XATTR_NOT_FOUND));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn poisoned_xattr_map() -> Mutex<HashMap<u64, HashMap<String, Vec<u8>>>> {
        let map = Mutex::new(HashMap::new());
        let _ = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            let _guard = map.lock().expect("xattr map lock");
            panic!("poison xattr map for test");
        }));
        map
    }

    #[test]
    fn stored_xattr_value_reads_existing_value() {
        let map = Mutex::new(HashMap::from([(
            7,
            HashMap::from([("user.test".to_string(), b"value".to_vec())]),
        )]));

        assert_eq!(
            stored_xattr_value(&map, 7, "user.test").expect("xattr value lookup"),
            Some(b"value".to_vec())
        );
    }

    #[test]
    fn stored_xattr_value_reports_poisoned_lock() {
        let map = poisoned_xattr_map();

        assert_eq!(stored_xattr_value(&map, 7, "user.test"), Err(libc::EIO));
    }

    #[test]
    fn stored_xattr_keys_returns_empty_for_missing_inode() {
        let map = Mutex::new(HashMap::new());

        assert!(stored_xattr_keys(&map, 7)
            .expect("xattr keys lookup")
            .is_empty());
    }

    #[test]
    fn stored_xattr_keys_reports_poisoned_lock() {
        let map = poisoned_xattr_map();

        assert_eq!(stored_xattr_keys(&map, 7), Err(libc::EIO));
    }
}
