use super::helpers::*;
use super::*;

impl PrivyFilesystem {
    pub(super) fn alloc_fh(&self) -> u64 {
        // fuser examples use monotonically increasing fh.
        self.next_fh
            .fetch_add(1, Ordering::Relaxed)
            .saturating_add(1)
    }

    pub(super) fn fh_tmp_path(&self, fh: u64) -> PathBuf {
        self.staging_dir.join(format!("fh-{fh}"))
    }

    pub(super) fn parent_and_name(path: &str) -> Result<(String, String), i32> {
        if path == "/" {
            return Err(libc::EPERM);
        }
        let trimmed = path.trim_end_matches('/');
        let Some((parent, name)) = trimmed.rsplit_once('/') else {
            return Err(libc::EPERM);
        };
        let parent = if parent.is_empty() { "/" } else { parent };
        if name.is_empty() {
            return Err(libc::EPERM);
        }
        Ok((parent.to_string(), name.to_string()))
    }

    pub(super) fn download_to_path(&self, node_id: u64, out_path: &Path) -> Result<(), i32> {
        let req = RpcRequest::new("catalog:download".to_string(), json!({"node_id": node_id}));
        let out = {
            let mut adapter = self.adapter.lock().map_err(|_| libc::EIO)?;
            match adapter.handle_with_stream(&req, None) {
                RpcReply::Stream(out) => out,
                RpcReply::Json(r) => match r {
                    RpcResponse::Error { code, .. } => {
                        return Err(rpc_code_to_errno(code.as_deref()));
                    }
                    _ => return Err(libc::EIO),
                },
            }
        };

        let mut reader = out.reader;
        let mut f = OpenOptions::new()
            .create(true)
            .write(true)
            .truncate(true)
            .open(out_path)
            .map_err(|_| libc::EIO)?;
        std::io::copy(&mut reader, &mut f).map_err(|_| libc::EIO)?;
        Ok(())
    }

    pub(super) fn open_download_stream(&self, node_id: u64) -> Result<Box<dyn Read + Send>, i32> {
        let req = RpcRequest::new("catalog:download".to_string(), json!({"node_id": node_id}));
        let out = {
            let mut adapter = self.adapter.lock().map_err(|_| libc::EIO)?;
            match adapter.handle_with_stream(&req, None) {
                RpcReply::Stream(out) => out,
                RpcReply::Json(r) => match r {
                    RpcResponse::Error { code, .. } => {
                        return Err(rpc_code_to_errno(code.as_deref()));
                    }
                    _ => return Err(libc::EIO),
                },
            }
        };
        Ok(out.reader)
    }

    pub(super) fn upload_from_path(
        &self,
        node_id: u64,
        file_path: &Path,
        total_size: u64,
    ) -> Result<(), i32> {
        // NOTE: core currently reads the full incoming stream into memory.
        // We keep memory bounded by chunking uploads.
        let mut adapter = self.adapter.lock().map_err(|_| libc::EIO)?;

        if total_size == 0 {
            let req = RpcRequest::new(
                "catalog:upload".to_string(),
                json!({"node_id": node_id, "size": 0, "offset": 0}),
            );
            match adapter.handle_with_stream(&req, Some(RpcInputStream::from_bytes(Vec::new()))) {
                RpcReply::Json(RpcResponse::Success { .. }) => return Ok(()),
                _ => return Err(libc::EIO),
            }
        }

        let mut offset: u64 = 0;
        while offset < total_size {
            let remaining = total_size - offset;
            let part = std::cmp::min(UPLOAD_PART_BYTES, remaining);

            let mut f = File::open(file_path).map_err(|_| libc::EIO)?;
            f.seek(SeekFrom::Start(offset)).map_err(|_| libc::EIO)?;
            let reader = f.take(part);

            let req = RpcRequest::new(
                "catalog:upload".to_string(),
                json!({"node_id": node_id, "size": part, "offset": offset}),
            );
            match adapter.handle_with_stream(&req, Some(RpcInputStream::new(Box::new(reader)))) {
                RpcReply::Json(RpcResponse::Success { .. }) => {
                    offset = offset.saturating_add(part);
                }
                _ => return Err(libc::EIO),
            }
        }

        Ok(())
    }

    pub(super) fn flush_open_file(&self, ino: u64, state: &mut OpenFileState) -> Result<(), i32> {
        if !state.writeable || !state.dirty {
            return Ok(());
        }

        let catalog_path = build_catalog_path(&self.inode_table, ino).ok_or(libc::ENOENT)?;
        let (parent_path, name) = Self::parent_and_name(&catalog_path)?;

        let size = fs::metadata(&state.tmp_path)
            .map(|m| m.len())
            .map_err(|_| libc::EIO)?;

        // Serialize writes to core.
        let _guard = self.write_lock.lock().map_err(|_| libc::EIO)?;

        // 1) Ensure catalog node exists and declared size matches.
        let parent_val = if parent_path == "/" {
            serde_json::Value::Null
        } else {
            serde_json::Value::String(parent_path)
        };

        let node_id = {
            let mut adapter = self.adapter.lock().map_err(|_| libc::EIO)?;
            let value = rpc_json(
                adapter.as_mut(),
                "catalog:prepareUpload",
                json!({
                    "parent_path": parent_val,
                    "name": name,
                    "size": size,
                    "mime_type": serde_json::Value::Null,
                    "chunk_size": serde_json::Value::Null,
                }),
            )?;

            let prep: PrepareUploadResponse =
                serde_json::from_value(value).map_err(|_| libc::EIO)?;
            prep.node_id
        };

        // 2) Upload in parts to keep memory bounded.
        self.upload_from_path(node_id, &state.tmp_path, size)?;

        // 3) Persist.
        {
            let mut adapter = self.adapter.lock().map_err(|_| libc::EIO)?;
            let emitted = save_and_flush(adapter.as_mut())?;
            info!(
                target: "chromvoid_lib::volume_fuse::imp",
                ino,
                node_id,
                size,
                events_emitted = emitted,
                "FUSE flush_open_file: persisted"
            );
        }

        // Update inode cache.
        if let Some(mut entry) = self.inode_table.get(ino) {
            entry.size = size;
            entry.modified = Some(SystemTime::now());
            self.inode_table.upsert(entry);
        }

        state.node_id = node_id;
        state.dirty = false;
        Ok(())
    }

    /// Build the full catalog path for a child of `parent_ino` named `name` and
    /// reject it with `EACCES` if it is a protected system path.
    pub(super) fn guard_system_child(&self, parent_ino: u64, name: &str) -> Result<(), i32> {
        let parent_path = if parent_ino == FUSE_ROOT_ID {
            "/".to_string()
        } else {
            build_catalog_path(&self.inode_table, parent_ino).ok_or(libc::ENOENT)?
        };
        let child_path = if parent_path == "/" {
            format!("/{}", name)
        } else {
            format!("{}/{}", parent_path, name)
        };
        if is_system_path(&child_path) {
            return Err(libc::EACCES);
        }
        Ok(())
    }

    pub(super) fn find_or_list_child(
        &self,
        parent: u64,
        name_str: &str,
    ) -> Result<InodeEntry, i32> {
        let parent_path = if parent == FUSE_ROOT_ID {
            "/".to_string()
        } else {
            build_catalog_path(&self.inode_table, parent).ok_or(libc::ENOENT)?
        };

        let is_trash_dir = is_trash_path(&parent_path);

        // For trash directories, check the inode_table first — ghost
        // inodes placed by the rename handler live only there.
        if is_trash_dir {
            if let Some(entry) = self.inode_table.find_child(parent, name_str) {
                return Ok(entry);
            }
        }

        let path_val = if parent_path == "/" {
            serde_json::Value::Null
        } else {
            serde_json::Value::String(parent_path)
        };

        let value = {
            let mut adapter = self.adapter.lock().map_err(|_| libc::EIO)?;
            rpc_json(
                adapter.as_mut(),
                "catalog:list",
                json!({"path": path_val, "include_hidden": null}),
            )?
        };
        let res: CatalogListResponse = serde_json::from_value(value).map_err(|_| libc::EIO)?;

        let mut found = None;
        let mut keep_names: HashSet<String> = HashSet::new();
        for item in res.items {
            keep_names.insert(item.name.clone());
            let entry = InodeEntry {
                catalog_node_id: item.node_id,
                name: item.name.clone(),
                parent_ino: parent,
                is_dir: item.is_dir,
                size: item.size.unwrap_or(0),
                modified: Some(ms_to_system_time(item.updated_at)),
            };
            self.inode_table.upsert(entry.clone());
            if item.name == name_str {
                found = Some(entry);
            }
        }

        // For trash directories, skip retain_children so that ghost
        // inodes placed by the rename handler survive.  For all other
        // directories, prune stale cached children.
        if !is_trash_dir {
            self.inode_table.retain_children(parent, &keep_names);
        }
        found.ok_or(libc::ENOENT)
    }
}
