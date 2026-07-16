//! Pure Rust FUSE mount support.
//!
//! On Linux this opens the FUSE device directly or delegates to `fusermount`. On macOS it
//! delegates to the mount helper installed by macFUSE and receives the FUSE device over a Unix
//! socket. No macFUSE library is linked or loaded into the application process.

use std::env;
use std::ffi::CStr;
use std::ffi::CString;
use std::ffi::OsStr;
use std::fs::File;
use std::io;
use std::io::Error;
use std::io::ErrorKind;
use std::io::IoSliceMut;
use std::io::Read;
use std::mem;
use std::os::fd::AsFd;
use std::os::fd::BorrowedFd;
use std::os::unix::ffi::OsStrExt;
use std::os::unix::io::AsRawFd;
use std::os::unix::io::FromRawFd;
use std::os::unix::io::RawFd;
use std::os::unix::net::UnixStream;
use std::os::unix::process::CommandExt;
use std::path::Path;
use std::process::Command;
use std::process::Stdio;
use std::sync::Arc;

use log::debug;
use log::error;
#[cfg(target_os = "macos")]
use log::warn;
use nix::fcntl::FcntlArg;
use nix::fcntl::FdFlag;
use nix::fcntl::OFlag;
use nix::fcntl::fcntl;
use nix::sys::socket::ControlMessageOwned;
use nix::sys::socket::MsgFlags;
use nix::sys::socket::SockaddrStorage;
use nix::sys::socket::recvmsg;

use crate::SessionACL;
use crate::dev_fuse::DevFuse;
use crate::mnt::is_mounted;
use crate::mnt::mount_options::MountOption;
use crate::mnt::mount_options::MountOptionGroup;
use crate::mnt::mount_options::option_group;
use crate::mnt::mount_options::option_to_flag;
use crate::mnt::mount_options::option_to_string;

const FUSERMOUNT_BIN: &str = "fusermount";
const FUSERMOUNT3_BIN: &str = "fusermount3";
const FUSERMOUNT_COMM_ENV: &str = "_FUSE_COMMFD";
const MOUNT_FUSEFS_BIN: &str = "mount_fusefs";
#[cfg(target_os = "macos")]
const MACFUSE_MOUNT_BIN: &str = "/Library/Filesystems/macfuse.fs/Contents/Resources/mount_macfuse";
#[cfg(target_os = "macos")]
const MACFUSE_CALL_BY_LIB_ENV: &str = "_FUSE_CALL_BY_LIB";
#[cfg(target_os = "macos")]
const MACFUSE_COMM_VERSION_ENV: &str = "_FUSE_COMMVERS";
#[cfg(target_os = "macos")]
const MACFUSE_DAEMON_PATH_ENV: &str = "_FUSE_DAEMON_PATH";

#[derive(Debug)]
pub(crate) struct MountImpl {
    mountpoint: CString,
    auto_unmount_socket: Option<UnixStream>,
    fuse_device: Arc<DevFuse>,
}
impl MountImpl {
    pub(crate) fn new(
        mountpoint: &Path,
        options: &[MountOption],
        acl: SessionACL,
    ) -> io::Result<(Arc<DevFuse>, MountImpl)> {
        let mountpoint = mountpoint.canonicalize()?;
        let (file, sock) = fuse_mount_pure(mountpoint.as_os_str(), options, acl)?;
        let file = Arc::new(file);
        Ok((
            file.clone(),
            MountImpl {
                mountpoint: CString::new(mountpoint.as_os_str().as_bytes())?,
                auto_unmount_socket: sock,
                fuse_device: file,
            },
        ))
    }

    pub(crate) fn umount_impl(&mut self) -> io::Result<()> {
        if !is_mounted(&self.fuse_device) {
            // If the filesystem has already been unmounted, avoid unmounting it again.
            // Unmounting it a second time could cause a race with a newly mounted filesystem
            // living at the same mountpoint
            return Ok(());
        }
        if let Some(sock) = mem::take(&mut self.auto_unmount_socket) {
            drop(sock);
            // fusermount in auto-unmount mode, no more work to do.
            return Ok(());
        }
        if let Err(err) = crate::mnt::libc_umount(&self.mountpoint) {
            if err == nix::errno::Errno::EPERM {
                // Linux always returns EPERM for non-root users.  We have to let the
                // library go through the setuid-root "fusermount -u" to unmount.
                fuse_unmount_pure(&self.mountpoint);
                return Ok(());
            } else {
                return Err(err.into());
            }
        }
        Ok(())
    }
}

fn fuse_mount_pure(
    mountpoint: &OsStr,
    options: &[MountOption],
    acl: SessionACL,
) -> Result<(DevFuse, Option<UnixStream>), io::Error> {
    #[cfg(target_os = "macos")]
    {
        // `mount_macfuse` does not accept libfuse's `auto_unmount` option. MountImpl owns the
        // mount lifecycle and unmounts it on drop instead.
        return fuse_mount_macfuse(mountpoint, options, acl).map(|file| (file, None));
    }

    #[cfg(not(target_os = "macos"))]
    {
        if options.contains(&MountOption::AutoUnmount) {
            // Auto unmount is only supported via fusermount
            return fuse_mount_fusermount(mountpoint, options, acl);
        }

        // The direct mount path is currently implemented only for Linux. Other supported Unix
        // targets (such as the BSDs) rely on the setuid mount helper, which mirrors libfuse's
        // approach.
        if cfg!(target_os = "linux") {
            let res = fuse_mount_sys(mountpoint, options, acl)?;
            match res {
                Some(file) => return Ok((file, None)),
                None => {
                    // Retry
                }
            }
        }

        fuse_mount_fusermount(mountpoint, options, acl)
    }
}

#[cfg(target_os = "macos")]
fn macfuse_mount_options(options: &[MountOption], acl: SessionACL) -> Vec<String> {
    let mut options_strs: Vec<String> = options
        .iter()
        .filter(|option| **option != MountOption::AutoUnmount)
        .map(option_to_string)
        .collect();
    options_strs.extend(acl.to_mount_option().map(str::to_owned));
    options_strs
}

#[cfg(target_os = "macos")]
fn macfuse_mount_command(
    mountpoint: &OsStr,
    options: &[MountOption],
    acl: SessionACL,
    daemon_path: &Path,
    communication_fd: RawFd,
) -> Command {
    let mut command = Command::new(MACFUSE_MOUNT_BIN);
    command.stdout(Stdio::piped()).stderr(Stdio::piped());

    let options_strs = macfuse_mount_options(options, acl);
    if !options_strs.is_empty() {
        command.arg("-o").arg(options_strs.join(","));
    }

    command
        .arg(mountpoint)
        .env(MACFUSE_CALL_BY_LIB_ENV, "1")
        .env(FUSERMOUNT_COMM_ENV, communication_fd.to_string())
        .env(MACFUSE_COMM_VERSION_ENV, "2")
        .env(MACFUSE_DAEMON_PATH_ENV, daemon_path);
    command
}

#[cfg(target_os = "macos")]
fn receive_macfuse_mount_status(socket: &UnixStream) -> io::Result<i32> {
    let mut status = [0u8; mem::size_of::<i32>()];
    let mut socket = socket;
    socket.read_exact(&mut status)?;
    Ok(i32::from_ne_bytes(status))
}

#[cfg(target_os = "macos")]
fn fuse_mount_macfuse(
    mountpoint: &OsStr,
    options: &[MountOption],
    acl: SessionACL,
) -> Result<DevFuse, Error> {
    let daemon_path = env::current_exe()?;
    let (child_socket, receive_socket) = UnixStream::pair()?;
    let mut command = macfuse_mount_command(
        mountpoint,
        options,
        acl,
        &daemon_path,
        child_socket.as_raw_fd(),
    );

    unsafe {
        clear_cloexec_in_pre_exec(&mut command, child_socket.as_fd());
    }

    let mut child = command.spawn()?;
    drop(child_socket);

    let file = match receive_fusermount_message(&receive_socket) {
        Ok(file) => file,
        Err(receive_error) => {
            drop(receive_socket);
            let output = child.wait_with_output()?;
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(Error::new(
                receive_error.kind(),
                format!("macFUSE mount helper did not return a device: {receive_error}: {stderr}"),
            ));
        }
    };

    if let Err(error) = fcntl(&file, FcntlArg::F_SETFD(FdFlag::FD_CLOEXEC)) {
        drop(file);
        drop(receive_socket);
        let _ = child.kill();
        let _ = child.wait();
        return Err(Error::other(format!(
            "failed to mark macFUSE device close-on-exec: {error}"
        )));
    }

    // macFUSE sends the mount(2) result after the device descriptor. Waiting for that result here
    // can deadlock because the mount may require the FUSE_INIT handshake that starts after this
    // function returns. Consume it and reap the helper asynchronously, as libfuse does.
    std::thread::Builder::new()
        .name("macfuse-mount-status".to_owned())
        .spawn(move || {
            match receive_macfuse_mount_status(&receive_socket) {
                Ok(0) => {}
                Ok(status) => warn!("macFUSE mount helper returned status {status}"),
                Err(error) => warn!("Failed to receive macFUSE mount status: {error}"),
            }
            drop(receive_socket);

            match child.wait_with_output() {
                Ok(output) if output.status.success() => {
                    debug!("mount_macfuse: {}", String::from_utf8_lossy(&output.stdout));
                    debug!("mount_macfuse: {}", String::from_utf8_lossy(&output.stderr));
                }
                Ok(output) => warn!(
                    "mount_macfuse exited with {}: {}",
                    output.status,
                    String::from_utf8_lossy(&output.stderr)
                ),
                Err(error) => warn!("Failed to wait for mount_macfuse: {error}"),
            }
        })?;

    Ok(file)
}

fn fuse_unmount_pure(mountpoint: &CStr) {
    #[cfg(target_os = "linux")]
    {
        if nix::mount::umount2(mountpoint, nix::mount::MntFlags::MNT_DETACH).is_ok() {
            return;
        }
    }
    #[cfg(target_os = "macos")]
    {
        if nix::mount::unmount(mountpoint, nix::mount::MntFlags::MNT_FORCE).is_ok() {
            return;
        }
    }

    let mut builder = Command::new(detect_fusermount_bin());
    builder.stdout(Stdio::piped()).stderr(Stdio::piped());
    builder
        .arg("-u")
        .arg("-q")
        .arg("-z")
        .arg("--")
        .arg(OsStr::new(&mountpoint.to_string_lossy().into_owned()));

    if let Ok(output) = builder.output() {
        debug!("fusermount: {}", String::from_utf8_lossy(&output.stdout));
        debug!("fusermount: {}", String::from_utf8_lossy(&output.stderr));
    }
}

fn detect_fusermount_bin() -> String {
    if let Some(fusermount) = env::var_os("FUSERMOUNT_PATH") {
        return fusermount
            .to_str()
            .expect("FUSERMOUNT_PATH is not UTF-8")
            .to_owned();
    }

    for name in [
        FUSERMOUNT3_BIN.to_string(),
        FUSERMOUNT_BIN.to_string(),
        MOUNT_FUSEFS_BIN.to_string(),
        format!("/sbin/{FUSERMOUNT3_BIN}"),
        format!("/sbin/{FUSERMOUNT_BIN}"),
        format!("/sbin/{MOUNT_FUSEFS_BIN}"),
        format!("/bin/{FUSERMOUNT3_BIN}"),
        format!("/bin/{FUSERMOUNT_BIN}"),
    ]
    .iter()
    {
        if Command::new(name).arg("-h").output().is_ok() {
            return name.to_string();
        }
    }
    // Default to fusermount3
    FUSERMOUNT3_BIN.to_string()
}

fn receive_fusermount_message(socket: &UnixStream) -> Result<DevFuse, Error> {
    let mut io_vec_buf = [0u8];
    let mut iov = [IoSliceMut::new(&mut io_vec_buf)];
    let mut cmsg_buffer = nix::cmsg_space!(RawFd);

    let msg = loop {
        match recvmsg::<SockaddrStorage>(
            socket.as_raw_fd(),
            &mut iov,
            Some(&mut cmsg_buffer),
            MsgFlags::empty(),
        ) {
            Ok(msg) => break msg,
            Err(nix::errno::Errno::EINTR) => continue,
            Err(e) => return Err(e.into()),
        }
    };

    if msg.bytes == 0 {
        return Err(Error::new(
            ErrorKind::UnexpectedEof,
            "Unexpected EOF reading from fusermount",
        ));
    }

    for cmsg in msg
        .cmsgs()
        .map_err(|e| Error::new(ErrorKind::InvalidData, e.to_string()))?
    {
        match cmsg {
            ControlMessageOwned::ScmRights(fds) => {
                if let Some(&fd) = fds.first() {
                    if fd < 0 {
                        return Err(ErrorKind::InvalidData.into());
                    }
                    return Ok(DevFuse(unsafe { File::from_raw_fd(fd) }));
                }
            }
            other => {
                return Err(Error::new(
                    ErrorKind::InvalidData,
                    format!("Unknown control message from fusermount: {:?}", other),
                ));
            }
        }
    }

    Err(Error::new(
        ErrorKind::InvalidData,
        "No SCM_RIGHTS message received from fusermount",
    ))
}

/// Clear `FD_CLOEXEC` after fork before exec.
/// This is needed to pass the file descriptor to a child process without risking descriptor leak.
unsafe fn clear_cloexec_in_pre_exec(command: &mut Command, fd: BorrowedFd<'_>) {
    let fd = fd.as_raw_fd();
    unsafe {
        command.pre_exec(move || {
            let fd = BorrowedFd::borrow_raw(fd);
            let current_flags = fcntl(fd, FcntlArg::F_GETFD)?;
            let current_flags = FdFlag::from_bits_retain(current_flags);
            if current_flags.contains(FdFlag::FD_CLOEXEC) {
                let cleared = current_flags & !FdFlag::FD_CLOEXEC;
                fcntl(fd, FcntlArg::F_SETFD(cleared))?;
            }
            Ok(())
        })
    };
}

fn fuse_mount_fusermount(
    mountpoint: &OsStr,
    options: &[MountOption],
    acl: SessionACL,
) -> Result<(DevFuse, Option<UnixStream>), Error> {
    let fusermount_bin = detect_fusermount_bin();

    if fusermount_bin.ends_with(MOUNT_FUSEFS_BIN) {
        return fuse_mount_mount_fusefs(&fusermount_bin, mountpoint, options, acl);
    }

    let (child_socket, receive_socket) = UnixStream::pair()?;

    let mut builder = Command::new(&fusermount_bin);
    builder.stdout(Stdio::piped()).stderr(Stdio::piped());
    let mut options_strs: Vec<String> = options.iter().map(option_to_string).collect();
    options_strs.extend(acl.to_mount_option().map(|s| s.to_owned()));
    if !options_strs.is_empty() {
        builder.arg("-o");
        builder.arg(options_strs.join(","));
    }
    builder
        .arg("--")
        .arg(mountpoint)
        .env(FUSERMOUNT_COMM_ENV, child_socket.as_raw_fd().to_string());

    unsafe {
        clear_cloexec_in_pre_exec(&mut builder, child_socket.as_fd());
    }

    let fusermount_child = builder.spawn()?;

    drop(child_socket); // close socket in parent

    let file = match receive_fusermount_message(&receive_socket) {
        Ok(f) => f,
        Err(_) => {
            // Drop receive socket, since fusermount has exited with an error
            drop(receive_socket);
            let output = fusermount_child.wait_with_output().unwrap();
            let stderr_string = String::from_utf8_lossy(&output.stderr).to_string();
            return if stderr_string.contains("only allowed if 'user_allow_other' is set") {
                Err(io::Error::new(ErrorKind::PermissionDenied, stderr_string))
            } else {
                Err(io::Error::new(ErrorKind::Other, stderr_string))
            };
        }
    };
    let mut receive_socket = Some(receive_socket);

    if !options.contains(&MountOption::AutoUnmount) {
        // Only close the socket, if auto unmount is not set.
        // fusermount will keep running until the socket is closed, if auto unmount is set
        drop(mem::take(&mut receive_socket));
        let output = fusermount_child.wait_with_output()?;
        debug!("fusermount: {}", String::from_utf8_lossy(&output.stdout));
        debug!("fusermount: {}", String::from_utf8_lossy(&output.stderr));
    } else {
        if let Some(mut stdout) = fusermount_child.stdout {
            // TODO: do not ignore error.
            if let Ok(flags) = fcntl(&stdout, FcntlArg::F_GETFL) {
                let new_flags = OFlag::from_bits_retain(flags) | OFlag::O_NONBLOCK;
                let _ = fcntl(&stdout, FcntlArg::F_SETFL(new_flags));
            }
            let mut buf = vec![0; 64 * 1024];
            if let Ok(len) = stdout.read(&mut buf) {
                debug!("fusermount: {}", String::from_utf8_lossy(&buf[..len]));
            }
        }
        if let Some(mut stderr) = fusermount_child.stderr {
            // TODO: do not ignore error.
            if let Ok(flags) = fcntl(&stderr, FcntlArg::F_GETFL) {
                let new_flags = OFlag::from_bits_retain(flags) | OFlag::O_NONBLOCK;
                let _ = fcntl(&stderr, FcntlArg::F_SETFL(new_flags));
            }
            let mut buf = vec![0; 64 * 1024];
            if let Ok(len) = stderr.read(&mut buf) {
                debug!("fusermount: {}", String::from_utf8_lossy(&buf[..len]));
            }
        }
    }

    // TODO: do not ignore error.
    let _ = fcntl(&file, FcntlArg::F_SETFD(FdFlag::FD_CLOEXEC));

    Ok((file, receive_socket))
}

fn fuse_mount_mount_fusefs(
    fusermount_bin: &str,
    mountpoint: &OsStr,
    options: &[MountOption],
    acl: SessionACL,
) -> Result<(DevFuse, Option<UnixStream>), Error> {
    let fuse_device = DevFuse::open()?;

    let fuse_fd = fuse_device.as_raw_fd();

    let mut builder = Command::new(fusermount_bin);
    builder.stdout(Stdio::piped()).stderr(Stdio::piped());
    let mut options_strs: Vec<String> = options.iter().map(option_to_string).collect();
    options_strs.extend(acl.to_mount_option().map(|s| s.to_owned()));
    if !options_strs.is_empty() {
        builder.arg("-o");
        builder.arg(options_strs.join(","));
    }

    builder.arg(fuse_fd.to_string()).arg(mountpoint);

    unsafe { clear_cloexec_in_pre_exec(&mut builder, fuse_device.as_fd()) };

    let output = builder.output()?;
    if !output.status.success() {
        return Err(io::Error::new(
            ErrorKind::Other,
            String::from_utf8_lossy(&output.stderr).to_string(),
        ));
    }

    Ok((fuse_device, None))
}

// If returned option is none. Then fusermount binary should be tried
#[cfg(any(target_os = "linux", target_os = "macos"))]
fn fuse_mount_sys(
    mountpoint: &OsStr,
    options: &[MountOption],
    acl: SessionACL,
) -> Result<Option<DevFuse>, Error> {
    use std::os::unix::fs::PermissionsExt;

    let mountpoint_mode = File::open(mountpoint)?.metadata()?.permissions().mode();

    // Auto unmount requests must be sent to fusermount binary
    assert!(!options.contains(&MountOption::AutoUnmount));

    let file = match DevFuse::open() {
        Ok(dev_fuse) => dev_fuse,
        Err(error) => {
            if error.kind() == ErrorKind::NotFound {
                error!("{} not found. Try 'modprobe fuse'", DevFuse::PATH);
            }
            return Err(error);
        }
    };
    assert!(
        file.as_raw_fd() > 2,
        "Conflict with stdin/stdout/stderr. fd={}",
        file.as_raw_fd()
    );

    let mut mount_options = format!(
        "fd={},rootmode={:o},user_id={},group_id={}",
        file.as_raw_fd(),
        mountpoint_mode,
        nix::unistd::getuid(),
        nix::unistd::getgid()
    );

    for option in options
        .iter()
        .filter(|x| option_group(x) == MountOptionGroup::KernelOption)
    {
        mount_options.push(',');
        mount_options.push_str(&option_to_string(option));
    }
    if let Some(acl_option) = acl.to_mount_option() {
        mount_options.push(',');
        mount_options.push_str(acl_option);
    }

    #[cfg(target_os = "linux")]
    let mut flags = nix::mount::MsFlags::empty();
    #[cfg(target_os = "macos")]
    let mut flags = nix::mount::MntFlags::empty();

    if !options.contains(&MountOption::Dev) {
        // Default to nodev
        #[cfg(target_os = "linux")]
        {
            flags |= nix::mount::MsFlags::MS_NODEV;
        }
        #[cfg(target_os = "macos")]
        {
            flags |= nix::mount::MntFlags::MNT_NODEV;
        }
    }
    if !options.contains(&MountOption::Suid) {
        // Default to nosuid
        #[cfg(target_os = "linux")]
        {
            flags |= nix::mount::MsFlags::MS_NOSUID;
        }
        #[cfg(target_os = "macos")]
        {
            flags |= nix::mount::MntFlags::MNT_NOSUID;
        }
    }
    for flag in options
        .iter()
        .filter(|x| option_group(x) == MountOptionGroup::KernelFlag)
    {
        flags |= option_to_flag(flag)?;
    }

    // Default name is "/dev/fuse", then use the subtype, and lastly prefer the name
    let mut source = DevFuse::PATH;
    if let Some(MountOption::Subtype(subtype)) = options
        .iter()
        .find(|x| matches!(**x, MountOption::Subtype(_)))
    {
        source = subtype;
    }
    if let Some(MountOption::FSName(name)) = options
        .iter()
        .find(|x| matches!(**x, MountOption::FSName(_)))
    {
        source = name;
    }

    #[cfg(target_os = "linux")]
    let result = nix::mount::mount(
        Some(source),
        mountpoint,
        Some("fuse"),
        flags,
        Some(mount_options.as_str()),
    );
    #[cfg(target_os = "macos")]
    let result = nix::mount::mount(source, mountpoint, flags, Some(mount_options.as_str()));

    match result {
        Ok(()) => Ok(Some(file)),
        Err(nix::errno::Errno::EPERM) => Ok(None), // Retry with fusermount
        Err(e) => Err(Error::new(
            ErrorKind::Other,
            format!(
                "Error calling mount() at {mountpoint:?} with {mount_options:?} and flags={flags:?}: {e}"
            ),
        )),
    }
}

#[cfg(not(any(target_os = "linux", target_os = "macos")))]
fn fuse_mount_sys(
    _mountpoint: &OsStr,
    _options: &[MountOption],
    _acl: SessionACL,
) -> Result<Option<DevFuse>, Error> {
    Ok(None)
}

#[cfg(all(test, target_os = "macos"))]
mod tests {
    use std::ffi::OsStr;
    use std::ffi::OsString;
    use std::io::IoSlice;
    use std::io::Read;
    use std::io::Seek;
    use std::io::SeekFrom;
    use std::io::Write;
    use std::os::fd::AsRawFd;
    use std::os::unix::net::UnixStream;
    use std::path::Path;

    use nix::sys::socket::ControlMessage;
    use nix::sys::socket::MsgFlags;
    use nix::sys::socket::sendmsg;

    use super::FUSERMOUNT_COMM_ENV;
    use super::MACFUSE_CALL_BY_LIB_ENV;
    use super::MACFUSE_COMM_VERSION_ENV;
    use super::MACFUSE_DAEMON_PATH_ENV;
    use super::MACFUSE_MOUNT_BIN;
    use super::macfuse_mount_command;
    use super::receive_fusermount_message;
    use super::receive_macfuse_mount_status;
    use crate::SessionACL;
    use crate::mnt::mount_options::MountOption;

    #[test]
    fn macfuse_command_uses_v2_helper_protocol_without_auto_unmount() {
        let command = macfuse_mount_command(
            OsStr::new("/Volumes/ChromVoid"),
            &[
                MountOption::AutoUnmount,
                MountOption::NoAtime,
                MountOption::FSName("chromvoid".to_owned()),
                MountOption::CUSTOM("volname=ChromVoid".to_owned()),
                MountOption::CUSTOM("local".to_owned()),
            ],
            SessionACL::RootAndOwner,
            Path::new("/Applications/ChromVoid.app/Contents/MacOS/chromvoid"),
            42,
        );

        assert_eq!(command.get_program(), OsStr::new(MACFUSE_MOUNT_BIN));
        assert_eq!(
            command.get_args().map(OsString::from).collect::<Vec<_>>(),
            [
                OsString::from("-o"),
                OsString::from("noatime,fsname=chromvoid,volname=ChromVoid,local,allow_other"),
                OsString::from("/Volumes/ChromVoid"),
            ]
        );

        let env_value = |key: &str| {
            command
                .get_envs()
                .find(|(name, _)| *name == OsStr::new(key))
                .and_then(|(_, value)| value)
        };
        assert_eq!(env_value(MACFUSE_CALL_BY_LIB_ENV), Some(OsStr::new("1")));
        assert_eq!(env_value(FUSERMOUNT_COMM_ENV), Some(OsStr::new("42")));
        assert_eq!(env_value(MACFUSE_COMM_VERSION_ENV), Some(OsStr::new("2")));
        assert_eq!(
            env_value(MACFUSE_DAEMON_PATH_ENV),
            Some(OsStr::new(
                "/Applications/ChromVoid.app/Contents/MacOS/chromvoid"
            ))
        );
    }

    #[test]
    fn macfuse_protocol_receives_device_and_mount_status() {
        let (mut helper_socket, application_socket) = UnixStream::pair().unwrap();
        let mut source = tempfile::tempfile().unwrap();
        source.write_all(b"macfuse-device").unwrap();
        source.seek(SeekFrom::Start(0)).unwrap();

        let descriptors = [source.as_raw_fd()];
        sendmsg::<()>(
            helper_socket.as_raw_fd(),
            &[IoSlice::new(&[0])],
            &[ControlMessage::ScmRights(&descriptors)],
            MsgFlags::empty(),
            None,
        )
        .unwrap();
        helper_socket.write_all(&0i32.to_ne_bytes()).unwrap();

        let mut received = receive_fusermount_message(&application_socket).unwrap();
        let mut contents = String::new();
        received.0.read_to_string(&mut contents).unwrap();
        assert_eq!(contents, "macfuse-device");
        assert_eq!(
            receive_macfuse_mount_status(&application_socket).unwrap(),
            0
        );
    }
}
