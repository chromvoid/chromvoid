use super::helpers::*;
use super::*;
use base64::{engine::general_purpose, Engine as _};

fn read_dirty_patch_payloads(
    tmp_path: &Path,
    dirty_ranges: &[(u64, u64)],
    file_size: u64,
) -> Result<Vec<serde_json::Value>, i32> {
    let mut ranges = dirty_ranges
        .iter()
        .filter_map(|(offset, len)| {
            if *len == 0 || *offset >= file_size {
                return None;
            }
            let end = offset.saturating_add(*len).min(file_size);
            (end > *offset).then_some((*offset, end))
        })
        .collect::<Vec<_>>();
    ranges.sort_unstable_by_key(|(offset, _)| *offset);

    let mut merged: Vec<(u64, u64)> = Vec::with_capacity(ranges.len());
    for (offset, end) in ranges {
        match merged.last_mut() {
            Some((_, last_end)) if offset <= *last_end => {
                *last_end = (*last_end).max(end);
            }
            _ => merged.push((offset, end)),
        }
    }

    let mut file = File::open(tmp_path).map_err(|_| libc::EIO)?;
    let mut patches = Vec::with_capacity(merged.len());
    for (offset, end) in merged {
        let len = end.saturating_sub(offset);
        if len == 0 {
            continue;
        }
        file.seek(SeekFrom::Start(offset)).map_err(|_| libc::EIO)?;
        let mut bytes = vec![0_u8; len as usize];
        file.read_exact(&mut bytes).map_err(|_| libc::EIO)?;
        patches.push(json!({
            "offset": offset,
            "content_base64": general_purpose::STANDARD.encode(bytes),
        }));
    }

    Ok(patches)
}

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

    pub(super) fn open_file_handle(
        &self,
        fh: u64,
    ) -> Result<Option<Arc<Mutex<OpenFileState>>>, i32> {
        let map = self.open_files.lock().map_err(|_| libc::EIO)?;
        Ok(map.get(&fh).cloned())
    }

    pub(super) fn acquire_write_lease(&self, node_id: u64, fh: u64) -> Result<(), i32> {
        let mut leases = self.write_leases.lock().map_err(|_| libc::EIO)?;
        match leases.get(&node_id).copied() {
            Some(existing_fh) if existing_fh != fh => Err(libc::EBUSY),
            _ => {
                leases.insert(node_id, fh);
                Ok(())
            }
        }
    }

    pub(super) fn release_write_lease(&self, node_id: u64, fh: u64) {
        let Ok(mut leases) = self.write_leases.lock() else {
            return;
        };
        if leases.get(&node_id).copied() == Some(fh) {
            leases.remove(&node_id);
        }
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

    pub(super) fn handle_with_stream_deferred(
        &self,
        req: &RpcRequest,
        stream: Option<RpcInputStream>,
    ) -> Result<RpcReply, i32> {
        let deferred = {
            let mut adapter = self.adapter.lock().map_err(|_| libc::EIO)?;
            adapter.begin_with_stream(req, stream)
        };
        Ok(deferred.wait())
    }

    pub(super) fn rpc_json_deferred(
        &self,
        command: &str,
        data: serde_json::Value,
    ) -> Result<serde_json::Value, i32> {
        let req = RpcRequest::new(command.to_string(), data);
        match self.handle_with_stream_deferred(&req, None)? {
            RpcReply::Json(RpcResponse::Success { result, .. }) => Ok(result),
            RpcReply::Json(RpcResponse::Error { code, .. }) => {
                Err(rpc_code_to_errno(code.as_deref()))
            }
            RpcReply::Stream(_) | RpcReply::RangeStream(_) => Err(libc::EIO),
        }
    }

    pub(super) fn clear_xattrs_for_ino(&self, ino: u64) {
        let Ok(mut xattrs) = self.xattrs.lock() else {
            warn!(
                target: "chromvoid_lib::volume_fuse::imp",
                ino,
                "FUSE xattr map lock poisoned during cleanup"
            );
            return;
        };
        xattrs.remove(&ino);
    }

    pub(super) fn list_trash_entries(&self) -> Result<CatalogTrashListResponse, i32> {
        let value = self.rpc_json_deferred("catalog:trash:list", json!({}))?;
        serde_json::from_value(value).map_err(|_| libc::EIO)
    }

    pub(super) fn download_to_path(&self, node_id: u64, out_path: &Path) -> Result<(), i32> {
        let req = RpcRequest::new("catalog:download".to_string(), json!({"node_id": node_id}));
        let out = match self.handle_with_stream_deferred(&req, None)? {
            RpcReply::Stream(out) => out,
            RpcReply::Json(r) => match r {
                RpcResponse::Error { code, .. } => {
                    return Err(rpc_code_to_errno(code.as_deref()));
                }
                _ => return Err(libc::EIO),
            },
            RpcReply::RangeStream(_) => return Err(libc::EIO),
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
        let out = match self.handle_with_stream_deferred(&req, None)? {
            RpcReply::Stream(out) => out,
            RpcReply::Json(r) => match r {
                RpcResponse::Error { code, .. } => {
                    return Err(rpc_code_to_errno(code.as_deref()));
                }
                _ => return Err(libc::EIO),
            },
            RpcReply::RangeStream(_) => return Err(libc::EIO),
        };
        Ok(out.reader)
    }

    pub(super) fn source_revision_for_node(&self, node_id: u64) -> Result<u64, i32> {
        let result = self.rpc_json_deferred(
            "catalog:source:metadata",
            json!({
                "node_id": node_id,
            }),
        )?;
        result
            .get("source_revision")
            .and_then(serde_json::Value::as_u64)
            .ok_or(libc::EIO)
    }

    pub(super) fn patch_file_size(
        &self,
        node_id: u64,
        new_size: u64,
        source_revision: u64,
    ) -> Result<u64, i32> {
        let mut request = json!({
            "node_id": node_id,
            "size": new_size,
            "patches": [],
        });
        if source_revision > 0 {
            request["expected_source_revision"] = json!(source_revision);
        }

        let result = self.rpc_json_deferred("catalog:file:patch", request)?;
        Ok(result
            .get("source_revision")
            .and_then(serde_json::Value::as_u64)
            .unwrap_or(source_revision))
    }

    pub(super) fn upload_from_path(
        &self,
        mut node_id: Option<u64>,
        parent_path: Option<&str>,
        name: Option<&str>,
        file_path: &Path,
        total_size: u64,
    ) -> Result<(), i32> {
        let result = (|| -> Result<(), i32> {
            if total_size == 0 {
                let req = RpcRequest::new(
                    "catalog:upload".to_string(),
                    match node_id {
                        Some(node_id) => json!({
                            "node_id": node_id,
                            "total_size": 0,
                            "chunk_size": UPLOAD_PART_BYTES,
                            "size": 0,
                            "offset": 0,
                            "finish": true,
                        }),
                        None => json!({
                            "parent_path": parent_path.unwrap_or("/"),
                            "name": name.ok_or(libc::EINVAL)?,
                            "total_size": 0,
                            "size": 0,
                            "offset": 0,
                            "mime_type": serde_json::Value::Null,
                            "chunk_size": UPLOAD_PART_BYTES,
                            "finish": true,
                        }),
                    },
                );
                match self.handle_with_stream_deferred(
                    &req,
                    Some(RpcInputStream::from_bytes(Vec::new())),
                )? {
                    RpcReply::Json(RpcResponse::Success { result, .. }) => {
                        node_id = node_id.or_else(|| upload_node_id_from_value(&result));
                        return node_id.map(|_| ()).ok_or(libc::EIO);
                    }
                    _ => return Err(libc::EIO),
                }
            }

            let mut offset: u64 = 0;
            while offset < total_size {
                let remaining = total_size - offset;
                let part = std::cmp::min(UPLOAD_PART_BYTES, remaining);

                let mut f = File::open(file_path).map_err(|_| libc::EIO)?;
                f.seek(SeekFrom::Start(offset)).map_err(|_| libc::EIO)?;
                let mut chunk = vec![0_u8; part as usize];
                f.read_exact(&mut chunk).map_err(|_| libc::EIO)?;
                let finish = offset.saturating_add(part) >= total_size;

                let req = RpcRequest::new(
                    "catalog:upload".to_string(),
                    match node_id {
                        Some(node_id) => json!({
                            "node_id": node_id,
                            "total_size": total_size,
                            "chunk_size": UPLOAD_PART_BYTES,
                            "size": part,
                            "offset": offset,
                            "finish": finish,
                        }),
                        None => json!({
                            "parent_path": parent_path.unwrap_or("/"),
                            "name": name.ok_or(libc::EINVAL)?,
                            "total_size": total_size,
                            "size": part,
                            "offset": offset,
                            "mime_type": serde_json::Value::Null,
                            "chunk_size": UPLOAD_PART_BYTES,
                            "finish": finish,
                        }),
                    },
                );
                match self
                    .handle_with_stream_deferred(&req, Some(RpcInputStream::from_bytes(chunk)))?
                {
                    RpcReply::Json(RpcResponse::Success { result, .. }) => {
                        if node_id.is_none() {
                            node_id = upload_node_id_from_value(&result);
                            if node_id.is_none() {
                                return Err(libc::EIO);
                            }
                        }
                        offset = offset.saturating_add(part);
                    }
                    _ => return Err(libc::EIO),
                }
            }

            Ok(())
        })();

        if result.is_err() {
            let req = RpcRequest::new("catalog:upload:abort".to_string(), json!({}));
            let mut adapter = self.adapter.lock().map_err(|_| libc::EIO)?;
            let _ = adapter.handle(&req);
        }

        result
    }

    pub(super) fn flush_open_file(&self, ino: u64, state: &mut OpenFileState) -> Result<(), i32> {
        if !state.writeable || !state.dirty {
            return Ok(());
        }

        let size = fs::metadata(&state.tmp_path)
            .map(|m| m.len())
            .map_err(|_| libc::EIO)?;

        let patches = read_dirty_patch_payloads(&state.tmp_path, &state.dirty_ranges, size)?;
        let mut request = json!({
            "node_id": state.node_id,
            "size": size,
            "patches": patches,
        });
        if state.source_revision > 0 {
            request["expected_source_revision"] = json!(state.source_revision);
        }

        let result = self.rpc_json_deferred("catalog:file:patch", request)?;
        if let Some(source_revision) = result
            .get("source_revision")
            .and_then(serde_json::Value::as_u64)
        {
            state.source_revision = source_revision;
        }

        {
            let mut adapter = self.adapter.lock().map_err(|_| libc::EIO)?;
            let emitted = flush_events(&self.event_sink, adapter.as_mut());
            info!(
                target: "chromvoid_lib::volume_fuse::imp",
                ino,
                size,
                events_emitted = emitted,
                "FUSE flush_open_file: persisted"
            );
        }

        // Update inode cache.
        if let Some(mut entry) = self.inode_table.get(ino) {
            entry.size = size;
            entry.source_revision = state.source_revision;
            entry.modified = Some(SystemTime::now());
            self.inode_table.upsert(entry);
        }

        state.dirty = false;
        state.dirty_ranges.clear();
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
        if is_platform_metadata_child(&parent_path, name) {
            return Err(libc::EACCES);
        }
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

        let is_trash_listing = is_trash_listing_path(&parent_path);

        if is_trash_listing {
            let res = self.list_trash_entries()?;
            let mut found = None;
            let mut keep_names: HashSet<String> = HashSet::new();
            for item in &res.items {
                keep_names.insert(item.name.clone());
                let entry = inode_entry_from_trash_item(parent, item);
                self.inode_table.upsert(entry.clone());
                if item.name == name_str {
                    found = Some(entry);
                }
            }
            self.inode_table.retain_children(parent, &keep_names);
            return found.ok_or(libc::ENOENT);
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
                source_revision: item.source_revision,
                modified: Some(ms_to_system_time(item.updated_at)),
            };
            self.inode_table.upsert(entry.clone());
            if item.name == name_str {
                found = Some(entry);
            }
        }

        self.inode_table.retain_children(parent, &keep_names);
        found.ok_or(libc::ENOENT)
    }
}
