mod dav_fs;

use std::io;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use chromvoid_core::catalog::is_system_path;
use chromvoid_core::rpc::types::{CatalogListResponse, RpcRequest, RpcResponse};
use dav_server::davpath::DavPath;
use dav_server::fs::{FsError, FsResult};
use serde_json::json;
use tauri::Manager;

use crate::core_adapter::CoreAdapter;

pub struct CatalogDavFs<R: tauri::Runtime> {
    app: tauri::AppHandle<R>,
    adapter: Arc<Mutex<Box<dyn CoreAdapter>>>,
    /// Serialize write-ish operations (single-writer semantics).
    write_lock: Arc<Mutex<()>>,
}

impl<R: tauri::Runtime> Clone for CatalogDavFs<R> {
    fn clone(&self) -> Self {
        Self {
            app: self.app.clone(),
            adapter: self.adapter.clone(),
            write_lock: self.write_lock.clone(),
        }
    }
}

impl<R: tauri::Runtime> CatalogDavFs<R> {
    pub fn new(app: tauri::AppHandle<R>, adapter: Arc<Mutex<Box<dyn CoreAdapter>>>) -> Self {
        Self {
            app,
            adapter,
            write_lock: Arc::new(Mutex::new(())),
        }
    }

    fn dav_to_catalog_path(path: &DavPath) -> FsResult<String> {
        let bytes = path.as_bytes();
        let s = String::from_utf8(bytes.to_vec()).map_err(|_| FsError::Forbidden)?;
        if s != "/" && s.ends_with('/') {
            Ok(s.trim_end_matches('/').to_string())
        } else {
            Ok(s)
        }
    }

    fn parent_and_name(path: &str) -> FsResult<(String, String)> {
        if path == "/" {
            return Err(FsError::Forbidden);
        }
        let trimmed = path.trim_end_matches('/');
        let Some((parent, name)) = trimmed.rsplit_once('/') else {
            return Err(FsError::Forbidden);
        };
        let parent = if parent.is_empty() { "/" } else { parent };
        if name.is_empty() {
            return Err(FsError::Forbidden);
        }
        Ok((parent.to_string(), name.to_string()))
    }

    fn ms_to_system_time(ms: u64) -> SystemTime {
        UNIX_EPOCH
            .checked_add(Duration::from_millis(ms))
            .unwrap_or(SystemTime::now())
    }

    fn webdav_staging_dir(app: &tauri::AppHandle<R>) -> FsResult<PathBuf> {
        let dir = app
            .path()
            .app_data_dir()
            .map_err(|_| FsError::GeneralFailure)?
            .join("webdav-staging");
        std::fs::create_dir_all(&dir).map_err(|_| FsError::GeneralFailure)?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt as _;
            let _ = std::fs::set_permissions(&dir, std::fs::Permissions::from_mode(0o700));
        }
        Ok(dir)
    }

    fn create_staging_file(app: &tauri::AppHandle<R>) -> FsResult<PathBuf> {
        let dir = Self::webdav_staging_dir(app)?;
        for _ in 0..8 {
            let path = dir.join(format!("dav-{:016x}.tmp", rand::random::<u64>()));
            match std::fs::OpenOptions::new()
                .create_new(true)
                .write(true)
                .open(&path)
            {
                Ok(_) => return Ok(path),
                Err(e) if e.kind() == io::ErrorKind::AlreadyExists => continue,
                Err(_) => return Err(FsError::GeneralFailure),
            }
        }
        Err(FsError::GeneralFailure)
    }

    pub(crate) fn rpc_json(
        adapter: &mut dyn CoreAdapter,
        command: &str,
        data: serde_json::Value,
    ) -> FsResult<serde_json::Value> {
        let req = RpcRequest::new(command.to_string(), data);
        match adapter.handle(&req) {
            RpcResponse::Success { result, .. } => Ok(result),
            RpcResponse::Error { code, .. } => Err(Self::rpc_code_to_fs_error(code.as_deref())),
        }
    }

    fn guard_system_path(path: &str) -> FsResult<()> {
        if is_system_path(path) {
            return Err(FsError::Forbidden);
        }
        Ok(())
    }

    pub(crate) fn rpc_code_to_fs_error(code: Option<&str>) -> FsError {
        match code {
            Some("ACCESS_DENIED") => FsError::Forbidden,
            Some("NODE_NOT_FOUND") | Some("INVALID_PATH") => FsError::NotFound,
            Some("NAME_EXIST") => FsError::Exists,
            Some("NOT_A_DIR") => FsError::Forbidden,
            Some("VAULT_REQUIRED") | Some("VAULT_NOT_UNLOCKED") => FsError::Forbidden,
            _ => FsError::NotFound,
        }
    }

    fn resolve_path(&self, full_path: &str) -> FsResult<(u64, bool, Option<u64>, u64)> {
        // Returns: (node_id, is_dir, size, updated_at_ms)
        if full_path == "/" {
            // Root is virtual; no node_id
            return Err(FsError::NotImplemented);
        }

        let mut current = "/".to_string();
        let segments: Vec<&str> = full_path
            .trim_start_matches('/')
            .split('/')
            .filter(|s| !s.is_empty())
            .collect();
        if segments.is_empty() {
            return Err(FsError::NotFound);
        }

        let mut last_item = None;

        for (i, seg) in segments.iter().enumerate() {
            let list_path = current.clone();

            let res = {
                let mut adapter = self.adapter.lock().map_err(|_| FsError::GeneralFailure)?;
                let path_val = if list_path == "/" {
                    serde_json::Value::Null
                } else {
                    serde_json::Value::String(list_path)
                };
                let data = json!({"path": path_val, "include_hidden": null});
                let value = Self::rpc_json(adapter.as_mut(), "catalog:list", data)?;
                serde_json::from_value::<CatalogListResponse>(value)
                    .map_err(|_| FsError::GeneralFailure)?
            };

            let Some(item) = res.items.into_iter().find(|it| it.name == *seg) else {
                return Err(FsError::NotFound);
            };
            last_item = Some(item.clone());

            let is_last = i + 1 == segments.len();
            if is_last {
                return Ok((item.node_id, item.is_dir, item.size, item.updated_at));
            }

            if !item.is_dir {
                return Err(FsError::NotFound);
            }

            current = if current == "/" {
                format!("/{seg}")
            } else {
                format!("{current}/{seg}")
            };
        }

        last_item
            .map(|it| (it.node_id, it.is_dir, it.size, it.updated_at))
            .ok_or(FsError::NotFound)
    }
}
