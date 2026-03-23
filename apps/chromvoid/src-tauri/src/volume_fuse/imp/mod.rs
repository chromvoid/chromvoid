use super::*;
use chromvoid_core::catalog::is_system_path;
use chromvoid_core::rpc::types::{
    CatalogListResponse, NodeCreatedResponse, PrepareUploadResponse, RpcRequest, RpcResponse,
};
use chromvoid_core::rpc::{RpcInputStream, RpcReply};
use fuser::{
    FileAttr, FileType, Filesystem, MountOption, Notifier, ReplyAttr, ReplyCreate, ReplyData,
    ReplyDirectory, ReplyEmpty, ReplyEntry, ReplyOpen, ReplyStatfs, ReplyWrite, ReplyXattr,
    Request,
};
use serde_json::json;
use std::ffi::OsStr;
use std::fs::{self, File, OpenOptions};
use std::io::{Read, Seek, SeekFrom, Write};
use std::os::raw::c_int;
use std::os::unix::ffi::OsStrExt as _;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::{ffi::CString, mem};
use tauri::Emitter;
use tokio::sync::mpsc;
use tracing::{debug, error, info, trace, warn};

mod file_io;
mod fuse_ops;
mod fuse_ops_dir;
mod fuse_ops_file;
mod fuse_ops_meta;
mod fuse_ops_xattr;
mod helpers;
mod platform;
mod rename;

const UPLOAD_PART_BYTES: u64 = 8 * 1024 * 1024;
static FUSE_NOTIFIER: OnceLock<RwLock<Option<Notifier>>> = OnceLock::new();
static FUSE_MOUNT_PATH: OnceLock<PathBuf> = OnceLock::new();

struct OpenFileState {
    ino: u64,
    node_id: u64,
    tmp_path: PathBuf,
    writeable: bool,
    dirty: bool,
    // For read-only opens, keep a streaming reader to avoid full download-on-open.
    read_stream: Option<Box<dyn Read + Send>>,
    read_pos: u64,
}

pub struct PrivyFilesystem {
    adapter: Arc<Mutex<Box<dyn CoreAdapter>>>,
    inode_table: InodeTable,
    staging_dir: PathBuf,
    xattrs: Mutex<HashMap<u64, HashMap<String, Vec<u8>>>>,
    open_files: Mutex<HashMap<u64, OpenFileState>>,
    next_fh: AtomicU64,
    /// Serialize write-ish operations (single-writer semantics).
    write_lock: Mutex<()>,
}

pub async fn start_fuse_server(
    mountpoint: std::path::PathBuf,
    staging_dir: std::path::PathBuf,
    adapter: Arc<Mutex<Box<dyn CoreAdapter>>>,
) -> Result<crate::volume_manager::FuseSessionHandle, String> {
    // Best-effort cleanup from previous runs.
    let _ = std::fs::remove_dir_all(&staging_dir);
    if let Err(e) = std::fs::create_dir_all(&staging_dir) {
        return Err(format!("Failed to create FUSE staging dir: {e}"));
    }

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt as _;

        let _ = std::fs::set_permissions(&staging_dir, std::fs::Permissions::from_mode(0o700));
    }

    let staging_dir_for_handle = staging_dir.clone();

    let fs = PrivyFilesystem {
        adapter,
        inode_table: InodeTable::default(),
        staging_dir,
        xattrs: Mutex::new(HashMap::new()),
        open_files: Mutex::new(HashMap::new()),
        next_fh: AtomicU64::new(0),
        write_lock: Mutex::new(()),
    };

    // Ensure mountpoint exists and is not already mounted.
    if mountpoint.exists() {
        let meta = std::fs::metadata(&mountpoint)
            .map_err(|e| format!("Failed to stat FUSE mountpoint: {e}"))?;
        if !meta.is_dir() {
            return Err("FUSE mountpoint exists but is not a directory".to_string());
        }

        // Heuristic mountpoint detection: if the directory lives on a different device than
        // its parent, it is very likely a mount point.
        #[cfg(unix)]
        {
            use std::os::unix::fs::MetadataExt as _;

            let parent = mountpoint
                .parent()
                .ok_or_else(|| "FUSE mountpoint has no parent".to_string())?;
            let parent_meta = std::fs::metadata(parent)
                .map_err(|e| format!("Failed to stat parent of mountpoint: {e}"))?;

            if meta.dev() != parent_meta.dev() {
                #[cfg(target_os = "macos")]
                {
                    // If the mountpoint is still healthy, do not force-unmount: it may belong
                    // to another running instance.
                    let is_unhealthy = match std::fs::read_dir(&mountpoint) {
                        Ok(_) => false,
                        Err(e) => {
                            matches!(e.raw_os_error(), Some(libc::ENXIO) | Some(libc::EIO))
                        }
                    };

                    if !is_unhealthy {
                        return Err(format!(
                            "FUSE mountpoint already appears mounted: {}",
                            mountpoint.to_string_lossy()
                        ));
                    }

                    warn!(
                        "FUSE: mountpoint appears stale (unhealthy), attempting force unmount: {:?}",
                        mountpoint
                    );

                    // Best-effort cleanup, then re-check the heuristic.
                    if let Err(e) = platform::macos_diskutil_unmount_force(&mountpoint).await {
                        warn!("FUSE: diskutil unmount failed: {}", e);
                    }

                    let meta2 = std::fs::metadata(&mountpoint)
                        .map_err(|e| format!("Failed to stat FUSE mountpoint: {e}"))?;
                    let parent_meta2 = std::fs::metadata(parent)
                        .map_err(|e| format!("Failed to stat parent of mountpoint: {e}"))?;

                    if meta2.dev() != parent_meta2.dev() {
                        return Err(format!(
                            "FUSE mountpoint already appears mounted: {}",
                            mountpoint.to_string_lossy()
                        ));
                    }
                }

                #[cfg(not(target_os = "macos"))]
                {
                    return Err(format!(
                        "FUSE mountpoint already appears mounted: {}",
                        mountpoint.to_string_lossy()
                    ));
                }
            }
        }
    } else {
        std::fs::create_dir_all(&mountpoint)
            .map_err(|e| format!("Failed to create FUSE mountpoint: {e}"))?;
    }

    let mut options = vec![
        MountOption::AutoUnmount,
        MountOption::NoAtime,
        MountOption::FSName("chromvoid".to_string()),
        MountOption::CUSTOM("volname=ChromVoid".to_string()),
    ];

    #[cfg(target_os = "macos")]
    {
        options.push(MountOption::CUSTOM("local".to_string()));
        options.push(MountOption::CUSTOM("daemon_timeout=15".to_string()));
        // Do NOT use `novncache` or `nolocalcaches` here: they interact
        // badly with `auto_cache` and can cause Finder to show -8062
        // errors when setting up .Trashes.  Instead rely on explicit
        // notify_kernel_delete / inval_entry calls + poke_finder_dir.
    }

    info!("FUSE: mounting at {:?}", mountpoint);

    let mp = mountpoint.clone();
    let shutdown_flag = Arc::new(AtomicBool::new(false));
    let flag_clone = shutdown_flag.clone();

    let (ready_tx, ready_rx) = tokio::sync::oneshot::channel::<Result<(), String>>();

    let (shutdown_tx, _shutdown_rx) = mpsc::channel::<()>(1);

    let task = tokio::task::spawn_blocking(move || {
        let session = match fuser::spawn_mount2(fs, &mp, &options) {
            Ok(s) => {
                platform::set_kernel_notifier(Some(s.notifier()));
                let _ = FUSE_MOUNT_PATH.set(mp.clone());
                let _ = ready_tx.send(Ok(()));
                s
            }
            Err(e) => {
                let msg = format!("{e}");
                let _ = ready_tx.send(Err(msg.clone()));
                error!("FUSE: mount failed: {}", msg);
                return;
            }
        };

        info!("FUSE: mounted successfully at {:?}", mp);

        loop {
            if flag_clone.load(Ordering::Relaxed) {
                break;
            }
            std::thread::sleep(Duration::from_millis(100));
        }

        info!("FUSE: unmounting {:?}", mp);
        platform::set_kernel_notifier(None);
        drop(session);
    });

    match tokio::time::timeout(Duration::from_secs(3), ready_rx).await {
        Ok(Ok(Ok(()))) => Ok(crate::volume_manager::FuseSessionHandle::new(
            mountpoint,
            staging_dir_for_handle,
            shutdown_flag,
            shutdown_tx,
            task,
        )),
        Ok(Ok(Err(e))) => Err(format!("FUSE mount failed: {e}")),
        Ok(Err(_closed)) => Err("FUSE mount failed: readiness channel closed".to_string()),
        Err(_timeout) => Err("FUSE mount timed out".to_string()),
    }
}

#[cfg(test)]
mod errno_tests {
    use super::*;
    use helpers::*;

    #[test]
    fn access_denied_maps_to_eacces() {
        assert_eq!(rpc_code_to_errno(Some("ACCESS_DENIED")), libc::EACCES);
    }

    #[test]
    fn node_not_found_maps_to_enoent() {
        assert_eq!(rpc_code_to_errno(Some("NODE_NOT_FOUND")), libc::ENOENT);
    }

    #[test]
    fn invalid_path_maps_to_enoent() {
        assert_eq!(rpc_code_to_errno(Some("INVALID_PATH")), libc::ENOENT);
    }

    #[test]
    fn name_exist_maps_to_eexist() {
        assert_eq!(rpc_code_to_errno(Some("NAME_EXIST")), libc::EEXIST);
    }

    #[test]
    fn vault_required_maps_to_eacces() {
        assert_eq!(rpc_code_to_errno(Some("VAULT_REQUIRED")), libc::EACCES);
        assert_eq!(rpc_code_to_errno(Some("VAULT_NOT_UNLOCKED")), libc::EACCES);
    }

    #[test]
    fn unknown_code_maps_to_eio() {
        assert_eq!(rpc_code_to_errno(Some("SOMETHING_ELSE")), libc::EIO);
        assert_eq!(rpc_code_to_errno(None), libc::EIO);
    }

    #[test]
    fn trash_parent_detection_matches_finder_variants() {
        assert!(is_trash_parent_path("/.Trashes/501"));
        assert!(is_trash_parent_path("/.Trashes/501/foo"));
        assert!(is_trash_parent_path("/.Trash"));
        assert!(is_trash_parent_path("/.Trash/foo"));
        assert!(is_trash_parent_path("/.Trash-501"));
        assert!(is_trash_parent_path("/.Trash-501/foo"));

        assert!(!is_trash_parent_path("/"));
        assert!(!is_trash_parent_path("/docs"));
        assert!(!is_trash_parent_path("/.Trash-"));
    }
}
