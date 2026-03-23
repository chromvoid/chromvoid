use super::platform::*;
use super::*;

pub(super) fn handle_getxattr(
    fs: &mut PrivyFilesystem,
    _req: &Request<'_>,
    ino: u64,
    name: &OsStr,
    size: u32,
    reply: ReplyXattr,
) {
    let Some(name) = name.to_str() else {
        reply.error(libc::EINVAL);
        return;
    };

    trace!(target: "chromvoid_lib::volume_fuse::imp", ino, name, size, "FUSE getxattr");

    let stored = fs
        .xattrs
        .lock()
        .ok()
        .and_then(|m| m.get(&ino).and_then(|attrs| attrs.get(name).cloned()));

    let value: Vec<u8> = match stored {
        Some(v) => v,
        None => match name {
            "com.apple.FinderInfo" => vec![0u8; 32],
            "com.apple.ResourceFork" => Vec::new(),
            _ => {
                reply.error(XATTR_NOT_FOUND);
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
        reply.error(libc::ERANGE);
        return;
    }

    reply.data(&value);
}

pub(super) fn handle_listxattr(
    fs: &mut PrivyFilesystem,
    _req: &Request<'_>,
    ino: u64,
    size: u32,
    reply: ReplyXattr,
) {
    trace!(target: "chromvoid_lib::volume_fuse::imp", ino, size, "FUSE listxattr");

    let keys: Vec<String> = fs
        .xattrs
        .lock()
        .ok()
        .and_then(|m| m.get(&ino).map(|attrs| attrs.keys().cloned().collect()))
        .unwrap_or_default();

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
        reply.error(libc::ERANGE);
        return;
    }
    reply.data(&out);
}

pub(super) fn handle_setxattr(
    fs: &mut PrivyFilesystem,
    _req: &Request<'_>,
    ino: u64,
    name: &OsStr,
    value: &[u8],
    flags: i32,
    _position: u32,
    reply: ReplyEmpty,
) {
    let Some(name) = name.to_str() else {
        reply.error(libc::EINVAL);
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
            reply.error(libc::EIO);
            return;
        }
    };

    let attrs = map.entry(ino).or_default();
    let exists = attrs.contains_key(name);

    if (flags & libc::XATTR_CREATE) != 0 && exists {
        reply.error(libc::EEXIST);
        return;
    }
    if (flags & libc::XATTR_REPLACE) != 0 && !exists {
        reply.error(XATTR_NOT_FOUND);
        return;
    }

    attrs.insert(name.to_string(), value.to_vec());
    reply.ok();
}

pub(super) fn handle_removexattr(
    fs: &mut PrivyFilesystem,
    _req: &Request<'_>,
    ino: u64,
    name: &OsStr,
    reply: ReplyEmpty,
) {
    let Some(name) = name.to_str() else {
        reply.error(libc::EINVAL);
        return;
    };

    trace!(target: "chromvoid_lib::volume_fuse::imp", ino, name, "FUSE removexattr");

    let mut map = match fs.xattrs.lock() {
        Ok(m) => m,
        Err(_) => {
            reply.error(libc::EIO);
            return;
        }
    };

    let Some(attrs) = map.get_mut(&ino) else {
        reply.error(XATTR_NOT_FOUND);
        return;
    };

    if attrs.remove(name).is_some() {
        reply.ok();
    } else {
        reply.error(XATTR_NOT_FOUND);
    }
}
