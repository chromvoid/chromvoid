use crate::core_adapter::{CoreAdapter, LocalCoreAdapter};
use chromvoid_core::catalog::CatalogMediaInfo;
use chromvoid_core::rpc::types::{RpcRequest, RpcResponse};
use chromvoid_core::rpc::{CatalogMediaInspectSnapshot, RpcInputStream, RpcReply};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tracing::{info, warn};

enum HostRpcBackend {
    Shared(Arc<Mutex<Box<dyn CoreAdapter>>>),
    Local(LocalCoreAdapter),
}

/// Per-peer owner; the final Arc is released after any in-flight adapter task finishes.
pub(super) struct HostRpcAdapter {
    backend: HostRpcBackend,
    credential_import_id: Option<String>,
}

impl Drop for HostRpcAdapter {
    fn drop(&mut self) {
        let Some(id) = self.credential_import_id.take() else {
            return;
        };
        let HostRpcBackend::Shared(adapter) = &self.backend else {
            return;
        };
        let adapter = adapter.clone();
        // The shared vault outlives the peer. Revoke only the token allocated by this peer,
        // including when the connection disappeared before its start/review reply arrived.
        tauri::async_runtime::spawn_blocking(move || {
            if let Ok(mut adapter) = adapter.lock() {
                let _ = adapter.handle(&RpcRequest::new(
                    "passmanager:import:cancel",
                    serde_json::json!({"import_id":id}),
                ));
            }
        });
    }
}

fn track_credential_import(id: &mut Option<String>, request: &RpcRequest, response: &RpcResponse) {
    if request.command == "passmanager:import:start" && response.is_ok() {
        *id = response
            .result()
            .and_then(|value| value.get("import_id"))
            .and_then(serde_json::Value::as_str)
            .map(str::to_owned);
    } else if matches!(
        request.command.as_str(),
        "passmanager:import:commit" | "passmanager:import:cancel"
    ) && response.is_ok()
        && request
            .data
            .get("import_id")
            .and_then(serde_json::Value::as_str)
            == id.as_deref()
    {
        *id = None;
    }
}

pub(super) type SharedHostRpcAdapter = Arc<Mutex<HostRpcAdapter>>;

pub(super) struct LazyHostRpcAdapter {
    adapter: Option<SharedHostRpcAdapter>,
    seed_adapter: Option<Arc<Mutex<Box<dyn CoreAdapter>>>>,
    storage_root: PathBuf,
}

impl LazyHostRpcAdapter {
    pub(super) fn new(
        seed_adapter: Option<Arc<Mutex<Box<dyn CoreAdapter>>>>,
        storage_root: PathBuf,
    ) -> Self {
        Self {
            adapter: None,
            seed_adapter,
            storage_root,
        }
    }

    /// Resolve the shared adapter handle, loading it on first use.
    ///
    /// After the first successful call this returns a cached `Arc` clone and
    /// never performs blocking work.
    pub(super) async fn shared(&mut self) -> Result<SharedHostRpcAdapter, String> {
        self.get().await
    }

    async fn get(&mut self) -> Result<SharedHostRpcAdapter, String> {
        if let Some(adapter) = &self.adapter {
            return Ok(adapter.clone());
        }

        let seed_adapter = self.seed_adapter.take();
        let storage_root = self.storage_root.clone();
        let loaded = tauri::async_runtime::spawn_blocking(move || {
            HostRpcAdapter::load(seed_adapter, storage_root)
        })
        .await
        .map_err(|error| format!("mobile acceptor host adapter load task failed: {error}"))??;
        let adapter = Arc::new(Mutex::new(loaded));
        self.adapter = Some(adapter.clone());
        Ok(adapter)
    }
}

impl HostRpcAdapter {
    fn load(
        adapter: Option<Arc<Mutex<Box<dyn CoreAdapter>>>>,
        storage_root: std::path::PathBuf,
    ) -> Result<Self, String> {
        if let Some(adapter) = adapter {
            info!("mobile_acceptor: using shared app adapter for host rpc loop");
            return Ok(Self {
                backend: HostRpcBackend::Shared(adapter),
                credential_import_id: None,
            });
        }

        warn!("mobile_acceptor: shared app adapter missing, falling back to LocalCoreAdapter");
        Ok(Self {
            backend: HostRpcBackend::Local(LocalCoreAdapter::new(storage_root)?),
            credential_import_id: None,
        })
    }

    pub(super) fn handle(&mut self, req: &RpcRequest) -> Result<RpcResponse, String> {
        match &mut self.backend {
            HostRpcBackend::Shared(adapter) => {
                let mut adapter = adapter
                    .lock()
                    .map_err(|_| "shared adapter mutex poisoned".to_string())?;
                let resp = adapter.handle(req);
                track_credential_import(&mut self.credential_import_id, req, &resp);
                adapter.save()?;
                Ok(resp)
            }
            HostRpcBackend::Local(adapter) => {
                let resp = adapter.handle(req);
                track_credential_import(&mut self.credential_import_id, req, &resp);
                adapter.save()?;
                Ok(resp)
            }
        }
    }

    pub(super) fn snapshot_catalog_media_inspect(
        &mut self,
        node_id: u64,
    ) -> Result<Option<Result<CatalogMediaInspectSnapshot, RpcResponse>>, String> {
        match &mut self.backend {
            HostRpcBackend::Shared(adapter) => {
                let mut adapter = adapter
                    .lock()
                    .map_err(|_| "shared adapter mutex poisoned".to_string())?;
                let snapshot = adapter.snapshot_catalog_media_inspect(node_id);
                adapter.save()?;
                Ok(snapshot)
            }
            HostRpcBackend::Local(adapter) => {
                let snapshot = adapter.snapshot_catalog_media_inspect(node_id);
                adapter.save()?;
                Ok(snapshot)
            }
        }
    }

    pub(super) fn commit_catalog_media_inspect(
        &mut self,
        snapshot: &CatalogMediaInspectSnapshot,
        media_info: Option<CatalogMediaInfo>,
        media_inspected_revision: u64,
    ) -> Result<Option<RpcResponse>, String> {
        match &mut self.backend {
            HostRpcBackend::Shared(adapter) => {
                let mut adapter = adapter
                    .lock()
                    .map_err(|_| "shared adapter mutex poisoned".to_string())?;
                let response = adapter.commit_catalog_media_inspect(
                    snapshot,
                    media_info,
                    media_inspected_revision,
                );
                adapter.save()?;
                Ok(response)
            }
            HostRpcBackend::Local(adapter) => {
                let response = adapter.commit_catalog_media_inspect(
                    snapshot,
                    media_info,
                    media_inspected_revision,
                );
                adapter.save()?;
                Ok(response)
            }
        }
    }

    pub(super) fn handle_with_stream(
        &mut self,
        req: &RpcRequest,
        stream: Option<RpcInputStream>,
    ) -> Result<RpcReply, String> {
        match &mut self.backend {
            HostRpcBackend::Shared(adapter) => {
                let mut adapter = adapter
                    .lock()
                    .map_err(|_| "shared adapter mutex poisoned".to_string())?;
                let reply = adapter.handle_with_stream(req, stream);
                adapter.save()?;
                Ok(reply)
            }
            HostRpcBackend::Local(adapter) => {
                let reply = adapter.handle_with_stream(req, stream);
                adapter.save()?;
                Ok(reply)
            }
        }
    }
}

pub(super) async fn run_host_adapter_task<T, F>(
    adapter: &mut LazyHostRpcAdapter,
    label: &'static str,
    task: F,
) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce(&mut HostRpcAdapter) -> Result<T, String> + Send + 'static,
{
    let adapter = adapter.get().await?;
    run_shared_host_adapter_task(adapter, label, task).await
}

/// Same as [`run_host_adapter_task`] but for callers that already hold a
/// resolved shared adapter handle (e.g. the media inspection commit worker
/// which runs off the RPC loop).
pub(super) async fn run_shared_host_adapter_task<T, F>(
    adapter: SharedHostRpcAdapter,
    label: &'static str,
    task: F,
) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce(&mut HostRpcAdapter) -> Result<T, String> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(move || {
        let mut adapter = adapter
            .lock()
            .map_err(|_| "host rpc adapter mutex poisoned".to_string())?;
        task(&mut adapter)
    })
    .await
    .map_err(|error| format!("{label} task failed: {error}"))?
}

#[cfg(test)]
mod credential_import_tests {
    use super::*;
    use serde_json::json;

    #[tokio::test]
    async fn credential_import_peer_drop_revokes_its_resource_after_in_flight_work() {
        let root = tempfile::tempdir().expect("synthetic peer vault");
        let mut local =
            LocalCoreAdapter::new_with_test_keystore(root.path().join("vault")).unwrap();
        local.set_master_key(Some("synthetic master".into()));
        assert!(local
            .handle(&RpcRequest::new(
                "master:setup",
                json!({"master_password":"synthetic master"})
            ))
            .is_ok());
        assert!(local
            .handle(&RpcRequest::new(
                "vault:unlock",
                json!({"password":"synthetic vault"})
            ))
            .is_ok());
        let local: Arc<Mutex<Box<dyn CoreAdapter>>> = Arc::new(Mutex::new(Box::new(local)));
        let peer = Arc::new(Mutex::new(
            HostRpcAdapter::load(Some(local.clone()), root.path().to_owned()).unwrap(),
        ));
        let in_flight = peer.clone();
        drop(peer); // Simulate loop teardown before the start task returns its token.
        let started = in_flight
            .lock()
            .unwrap()
            .handle(&RpcRequest::new(
                "passmanager:import:start",
                json!({"byte_count":10,"mode":"merge"}),
            ))
            .unwrap();
        assert!(started.is_ok());
        let id = started.result().unwrap()["import_id"].clone();
        drop(in_flight);
        tokio::time::timeout(std::time::Duration::from_secs(2), async {
            loop {
                let response = local.lock().unwrap().handle(&RpcRequest::new(
                    "passmanager:import:start",
                    json!({"byte_count":10,"mode":"merge"}),
                ));
                if response.is_ok() {
                    break;
                }
                assert_eq!(response.code(), Some("CREDENTIAL_IMPORT_BUSY"));
                tokio::task::yield_now().await;
            }
        })
        .await
        .expect("peer resource revoked");
        assert_eq!(
            local
                .lock()
                .unwrap()
                .handle(&RpcRequest::new(
                    "passmanager:import:commit",
                    json!({"import_id":id,"confirm":true})
                ))
                .code(),
            Some("NODE_NOT_FOUND")
        );
    }
}
