use super::*;

impl Filesystem for PrivyFilesystem {
    fn init(&mut self, _req: &Request<'_>, _config: &mut fuser::KernelConfig) -> Result<(), c_int> {
        fuse_ops_meta::handle_init(self, _req, _config)
    }

    fn destroy(&mut self) {
        fuse_ops_meta::handle_destroy(self)
    }

    fn access(&mut self, _req: &Request<'_>, _ino: u64, _mask: i32, reply: ReplyEmpty) {
        fuse_ops_meta::handle_access(self, _req, _ino, _mask, reply)
    }

    fn statfs(&mut self, _req: &Request<'_>, _ino: u64, reply: ReplyStatfs) {
        fuse_ops_meta::handle_statfs(self, _req, _ino, reply)
    }

    fn getxattr(
        &mut self,
        _req: &Request<'_>,
        ino: u64,
        name: &OsStr,
        size: u32,
        reply: ReplyXattr,
    ) {
        fuse_ops_xattr::handle_getxattr(self, _req, ino, name, size, reply)
    }

    fn listxattr(&mut self, _req: &Request<'_>, ino: u64, size: u32, reply: ReplyXattr) {
        fuse_ops_xattr::handle_listxattr(self, _req, ino, size, reply)
    }

    fn setxattr(
        &mut self,
        _req: &Request<'_>,
        ino: u64,
        name: &OsStr,
        value: &[u8],
        flags: i32,
        _position: u32,
        reply: ReplyEmpty,
    ) {
        fuse_ops_xattr::handle_setxattr(self, _req, ino, name, value, flags, _position, reply)
    }

    fn removexattr(&mut self, _req: &Request<'_>, ino: u64, name: &OsStr, reply: ReplyEmpty) {
        fuse_ops_xattr::handle_removexattr(self, _req, ino, name, reply)
    }

    fn lookup(&mut self, _req: &Request<'_>, parent: u64, name: &OsStr, reply: ReplyEntry) {
        fuse_ops_dir::handle_lookup(self, _req, parent, name, reply)
    }

    fn getattr(&mut self, _req: &Request<'_>, ino: u64, _fh: Option<u64>, reply: ReplyAttr) {
        fuse_ops_meta::handle_getattr(self, _req, ino, _fh, reply)
    }

    fn readdir(
        &mut self,
        _req: &Request<'_>,
        ino: u64,
        _fh: u64,
        offset: i64,
        reply: ReplyDirectory,
    ) {
        fuse_ops_dir::handle_readdir(self, _req, ino, _fh, offset, reply)
    }

    fn read(
        &mut self,
        _req: &Request<'_>,
        ino: u64,
        _fh: u64,
        offset: i64,
        size: u32,
        _flags: i32,
        _lock_owner: Option<u64>,
        reply: ReplyData,
    ) {
        fuse_ops_file::handle_read(
            self,
            _req,
            ino,
            _fh,
            offset,
            size,
            _flags,
            _lock_owner,
            reply,
        )
    }

    fn open(&mut self, _req: &Request<'_>, ino: u64, flags: i32, reply: ReplyOpen) {
        fuse_ops_file::handle_open(self, _req, ino, flags, reply)
    }

    fn create(
        &mut self,
        _req: &Request<'_>,
        parent: u64,
        name: &OsStr,
        _mode: u32,
        _umask: u32,
        flags: i32,
        reply: ReplyCreate,
    ) {
        fuse_ops_file::handle_create(self, _req, parent, name, _mode, _umask, flags, reply)
    }

    fn mknod(
        &mut self,
        _req: &Request<'_>,
        parent: u64,
        name: &OsStr,
        mode: u32,
        _umask: u32,
        _rdev: u32,
        reply: ReplyEntry,
    ) {
        fuse_ops_file::handle_mknod(self, _req, parent, name, mode, _umask, _rdev, reply)
    }

    fn write(
        &mut self,
        _req: &Request<'_>,
        ino: u64,
        fh: u64,
        offset: i64,
        data: &[u8],
        _write_flags: u32,
        _flags: i32,
        _lock_owner: Option<u64>,
        reply: ReplyWrite,
    ) {
        fuse_ops_file::handle_write(
            self,
            _req,
            ino,
            fh,
            offset,
            data,
            _write_flags,
            _flags,
            _lock_owner,
            reply,
        )
    }

    fn flush(
        &mut self,
        _req: &Request<'_>,
        ino: u64,
        fh: u64,
        _lock_owner: u64,
        reply: ReplyEmpty,
    ) {
        fuse_ops_file::handle_flush(self, _req, ino, fh, _lock_owner, reply)
    }

    fn fsync(&mut self, _req: &Request<'_>, ino: u64, fh: u64, _datasync: bool, reply: ReplyEmpty) {
        fuse_ops_file::handle_fsync(self, _req, ino, fh, _datasync, reply)
    }

    fn release(
        &mut self,
        _req: &Request<'_>,
        ino: u64,
        fh: u64,
        _flags: i32,
        _lock_owner: Option<u64>,
        _flush: bool,
        reply: ReplyEmpty,
    ) {
        fuse_ops_file::handle_release(self, _req, ino, fh, _flags, _lock_owner, _flush, reply)
    }

    fn setattr(
        &mut self,
        _req: &Request<'_>,
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
        fuse_ops_meta::handle_setattr(
            self, _req, ino, _mode, _uid, _gid, size, _atime, _mtime, _ctime, fh, _crtime,
            _chgtime, _bkuptime, _flags, reply,
        )
    }

    fn mkdir(
        &mut self,
        _req: &Request<'_>,
        parent: u64,
        name: &OsStr,
        _mode: u32,
        _umask: u32,
        reply: ReplyEntry,
    ) {
        fuse_ops_dir::handle_mkdir(self, _req, parent, name, _mode, _umask, reply)
    }

    fn unlink(&mut self, _req: &Request<'_>, parent: u64, name: &OsStr, reply: ReplyEmpty) {
        fuse_ops_dir::handle_unlink(self, _req, parent, name, reply)
    }

    fn rmdir(&mut self, _req: &Request<'_>, parent: u64, name: &OsStr, reply: ReplyEmpty) {
        fuse_ops_dir::handle_rmdir(self, _req, parent, name, reply)
    }

    fn rename(
        &mut self,
        _req: &Request<'_>,
        parent: u64,
        name: &OsStr,
        newparent: u64,
        newname: &OsStr,
        flags: u32,
        reply: ReplyEmpty,
    ) {
        let name_str = match name.to_str() {
            Some(n) => n,
            None => {
                info!(
                    target: "chromvoid_lib::volume_fuse::imp",
                    branch = "invalid_src_name_utf8",
                    errno = libc::EINVAL,
                    flags,
                    "FUSE rename: early abort"
                );
                reply.error(libc::EINVAL);
                return;
            }
        };
        let newname_str = match newname.to_str() {
            Some(n) => n,
            None => {
                info!(
                    target: "chromvoid_lib::volume_fuse::imp",
                    branch = "invalid_dst_name_utf8",
                    errno = libc::EINVAL,
                    flags,
                    "FUSE rename: early abort"
                );
                reply.error(libc::EINVAL);
                return;
            }
        };

        self.do_rename(parent, name_str, newparent, newname_str, flags, reply);
    }
}
