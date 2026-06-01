use super::*;

impl Filesystem for PrivyFilesystem {
    fn init(&mut self, _req: &Request, _config: &mut fuser::KernelConfig) -> std::io::Result<()> {
        fuse_ops_meta::handle_init(self, _req, _config)
    }

    fn destroy(&mut self) {
        fuse_ops_meta::handle_destroy(self)
    }

    fn access(&self, _req: &Request, _ino: INodeNo, _mask: AccessFlags, reply: ReplyEmpty) {
        fuse_ops_meta::handle_access(self, _req, _ino.into(), _mask.bits(), reply)
    }

    fn statfs(&self, _req: &Request, _ino: INodeNo, reply: ReplyStatfs) {
        fuse_ops_meta::handle_statfs(self, _req, _ino.into(), reply)
    }

    fn getxattr(&self, _req: &Request, ino: INodeNo, name: &OsStr, size: u32, reply: ReplyXattr) {
        fuse_ops_xattr::handle_getxattr(self, _req, ino.into(), name, size, reply)
    }

    fn listxattr(&self, _req: &Request, ino: INodeNo, size: u32, reply: ReplyXattr) {
        fuse_ops_xattr::handle_listxattr(self, _req, ino.into(), size, reply)
    }

    fn setxattr(
        &self,
        _req: &Request,
        ino: INodeNo,
        name: &OsStr,
        value: &[u8],
        flags: i32,
        _position: u32,
        reply: ReplyEmpty,
    ) {
        fuse_ops_xattr::handle_setxattr(
            self,
            _req,
            ino.into(),
            name,
            value,
            flags,
            _position,
            reply,
        )
    }

    fn removexattr(&self, _req: &Request, ino: INodeNo, name: &OsStr, reply: ReplyEmpty) {
        fuse_ops_xattr::handle_removexattr(self, _req, ino.into(), name, reply)
    }

    fn lookup(&self, _req: &Request, parent: INodeNo, name: &OsStr, reply: ReplyEntry) {
        fuse_ops_dir::handle_lookup(self, _req, parent.into(), name, reply)
    }

    fn getattr(&self, _req: &Request, ino: INodeNo, _fh: Option<FileHandle>, reply: ReplyAttr) {
        fuse_ops_meta::handle_getattr(self, _req, ino.into(), _fh.map(Into::into), reply)
    }

    fn readdir(
        &self,
        _req: &Request,
        ino: INodeNo,
        _fh: FileHandle,
        offset: u64,
        reply: ReplyDirectory,
    ) {
        fuse_ops_dir::handle_readdir(self, _req, ino.into(), _fh.into(), offset, reply)
    }

    fn read(
        &self,
        _req: &Request,
        ino: INodeNo,
        _fh: FileHandle,
        offset: u64,
        size: u32,
        _flags: OpenFlags,
        _lock_owner: Option<LockOwner>,
        reply: ReplyData,
    ) {
        fuse_ops_file::handle_read(
            self,
            _req,
            ino.into(),
            _fh.into(),
            offset,
            size,
            _flags.0,
            _lock_owner.map(|owner| owner.0),
            reply,
        )
    }

    fn open(&self, _req: &Request, ino: INodeNo, flags: OpenFlags, reply: ReplyOpen) {
        fuse_ops_file::handle_open(self, _req, ino.into(), flags.0, reply)
    }

    fn create(
        &self,
        _req: &Request,
        parent: INodeNo,
        name: &OsStr,
        _mode: u32,
        _umask: u32,
        flags: i32,
        reply: ReplyCreate,
    ) {
        fuse_ops_file::handle_create(self, _req, parent.into(), name, _mode, _umask, flags, reply)
    }

    fn mknod(
        &self,
        _req: &Request,
        parent: INodeNo,
        name: &OsStr,
        mode: u32,
        _umask: u32,
        _rdev: u32,
        reply: ReplyEntry,
    ) {
        fuse_ops_file::handle_mknod(self, _req, parent.into(), name, mode, _umask, _rdev, reply)
    }

    fn write(
        &self,
        _req: &Request,
        ino: INodeNo,
        fh: FileHandle,
        offset: u64,
        data: &[u8],
        _write_flags: WriteFlags,
        _flags: OpenFlags,
        _lock_owner: Option<LockOwner>,
        reply: ReplyWrite,
    ) {
        fuse_ops_file::handle_write(
            self,
            _req,
            ino.into(),
            fh.into(),
            offset,
            data,
            _write_flags.bits(),
            _flags.0,
            _lock_owner.map(|owner| owner.0),
            reply,
        )
    }

    fn flush(
        &self,
        _req: &Request,
        ino: INodeNo,
        fh: FileHandle,
        _lock_owner: LockOwner,
        reply: ReplyEmpty,
    ) {
        fuse_ops_file::handle_flush(self, _req, ino.into(), fh.into(), _lock_owner.0, reply)
    }

    fn fsync(
        &self,
        _req: &Request,
        ino: INodeNo,
        fh: FileHandle,
        _datasync: bool,
        reply: ReplyEmpty,
    ) {
        fuse_ops_file::handle_fsync(self, _req, ino.into(), fh.into(), _datasync, reply)
    }

    fn release(
        &self,
        _req: &Request,
        ino: INodeNo,
        fh: FileHandle,
        _flags: OpenFlags,
        _lock_owner: Option<LockOwner>,
        _flush: bool,
        reply: ReplyEmpty,
    ) {
        fuse_ops_file::handle_release(
            self,
            _req,
            ino.into(),
            fh.into(),
            _flags.0,
            _lock_owner.map(|owner| owner.0),
            _flush,
            reply,
        )
    }

    fn setattr(
        &self,
        _req: &Request,
        ino: INodeNo,
        _mode: Option<u32>,
        _uid: Option<u32>,
        _gid: Option<u32>,
        size: Option<u64>,
        _atime: Option<fuser::TimeOrNow>,
        _mtime: Option<fuser::TimeOrNow>,
        _ctime: Option<SystemTime>,
        fh: Option<FileHandle>,
        _crtime: Option<SystemTime>,
        _chgtime: Option<SystemTime>,
        _bkuptime: Option<SystemTime>,
        _flags: Option<BsdFileFlags>,
        reply: ReplyAttr,
    ) {
        fuse_ops_meta::handle_setattr(
            self,
            _req,
            ino.into(),
            _mode,
            _uid,
            _gid,
            size,
            _atime,
            _mtime,
            _ctime,
            fh.map(Into::into),
            _crtime,
            _chgtime,
            _bkuptime,
            _flags.map(|flags| flags.bits()),
            reply,
        )
    }

    fn mkdir(
        &self,
        _req: &Request,
        parent: INodeNo,
        name: &OsStr,
        _mode: u32,
        _umask: u32,
        reply: ReplyEntry,
    ) {
        fuse_ops_dir::handle_mkdir(self, _req, parent.into(), name, _mode, _umask, reply)
    }

    fn unlink(&self, _req: &Request, parent: INodeNo, name: &OsStr, reply: ReplyEmpty) {
        fuse_ops_dir::handle_unlink(self, _req, parent.into(), name, reply)
    }

    fn rmdir(&self, _req: &Request, parent: INodeNo, name: &OsStr, reply: ReplyEmpty) {
        fuse_ops_dir::handle_rmdir(self, _req, parent.into(), name, reply)
    }

    fn rename(
        &self,
        _req: &Request,
        parent: INodeNo,
        name: &OsStr,
        newparent: INodeNo,
        newname: &OsStr,
        flags: RenameFlags,
        reply: ReplyEmpty,
    ) {
        let parent = u64::from(parent);
        let newparent = u64::from(newparent);
        let flags = flags.bits();
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
                reply.error(fuse_errno(libc::EINVAL));
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
                reply.error(fuse_errno(libc::EINVAL));
                return;
            }
        };

        self.do_rename(parent, name_str, newparent, newname_str, flags, reply);
    }
}
