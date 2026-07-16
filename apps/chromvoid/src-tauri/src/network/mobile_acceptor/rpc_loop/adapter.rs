use crate::core_adapter::{CoreAdapter, LocalCoreAdapter};
use chromvoid_core::catalog::CatalogMediaInfo;
use chromvoid_core::rpc::types::{RpcRequest, RpcResponse};
use chromvoid_core::rpc::{CatalogMediaInspectSnapshot, RpcInputStream, RpcReply};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tracing::{info, warn};

pub(super) enum HostRpcAdapter {
    Shared(Arc<Mutex<Box<dyn CoreAdapter>>>),
    Local(LocalCoreAdapter),
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
            return Ok(Self::Shared(adapter));
        }

        warn!("mobile_acceptor: shared app adapter missing, falling back to LocalCoreAdapter");
        Ok(Self::Local(LocalCoreAdapter::new(storage_root)?))
    }

    pub(super) fn handle(&mut self, req: &RpcRequest) -> Result<RpcResponse, String> {
        match self {
            Self::Shared(adapter) => {
                let mut adapter = adapter
                    .lock()
                    .map_err(|_| "shared adapter mutex poisoned".to_string())?;
                let resp = adapter.handle(req);
                adapter.save()?;
                Ok(resp)
            }
            Self::Local(adapter) => {
                let resp = adapter.handle(req);
                adapter.save()?;
                Ok(resp)
            }
        }
    }

    pub(super) fn snapshot_catalog_media_inspect(
        &mut self,
        node_id: u64,
    ) -> Result<Option<Result<CatalogMediaInspectSnapshot, RpcResponse>>, String> {
        match self {
            Self::Shared(adapter) => {
                let mut adapter = adapter
                    .lock()
                    .map_err(|_| "shared adapter mutex poisoned".to_string())?;
                let snapshot = adapter.snapshot_catalog_media_inspect(node_id);
                adapter.save()?;
                Ok(snapshot)
            }
            Self::Local(adapter) => {
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
        match self {
            Self::Shared(adapter) => {
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
            Self::Local(adapter) => {
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
        match self {
            Self::Shared(adapter) => {
                let mut adapter = adapter
                    .lock()
                    .map_err(|_| "shared adapter mutex poisoned".to_string())?;
                let reply = adapter.handle_with_stream(req, stream);
                adapter.save()?;
                Ok(reply)
            }
            Self::Local(adapter) => {
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
