//! The local adapter's side of the shared `CoreAdapter` contract.

use crate::adapter::{CoreAdapter, CoreMode};
use crate::local::LocalCoreAdapter;
use chromvoid_core::catalog::CatalogMediaInfo;
use chromvoid_core::rpc::types::{RpcRequest, RpcResponse};
use chromvoid_core::rpc::{
    CatalogDerivativeWriteRequest, CatalogDerivativeWriteResult, CatalogDerivativeWriteSnapshot,
    CatalogMediaInspectSnapshot, RpcInputStream, RpcReply, WalletBalanceExecution,
    WalletBalanceSnapshot, WalletHistoryExecution, WalletHistorySnapshot,
};
use chromvoid_core::vault::{VaultRekeyProgress, VaultRekeyRequest};
use serde_json::Value;

impl CoreAdapter for LocalCoreAdapter {
    fn mode(&self) -> CoreMode {
        CoreMode::Local
    }

    fn is_unlocked(&self) -> bool {
        LocalCoreAdapter::is_unlocked(self)
    }

    fn handle(&mut self, req: &RpcRequest) -> RpcResponse {
        LocalCoreAdapter::handle(self, req)
    }

    #[cfg(feature = "desktop")]
    fn resolve_env_runtime_for_spawn(
        &mut self,
        request: chromvoid_core::env_runtime::PrivateSpawnResolutionRequestV1,
    ) -> Option<
        chromvoid_core::env_runtime::EnvRuntimeResult<
            chromvoid_core::env_runtime::ResolvedEnvLeaseV1,
        >,
    > {
        LocalCoreAdapter::resolve_env_runtime_for_spawn(self, request)
    }

    fn rekey_vault(
        &mut self,
        request: VaultRekeyRequest,
        cancel_requested: &(dyn Fn() -> bool + Send + Sync),
        progress: &mut dyn FnMut(VaultRekeyProgress),
    ) -> Option<RpcResponse> {
        LocalCoreAdapter::rekey_vault(self, request, cancel_requested, progress)
    }

    fn snapshot_catalog_media_inspect(
        &mut self,
        node_id: u64,
    ) -> Option<Result<CatalogMediaInspectSnapshot, RpcResponse>> {
        LocalCoreAdapter::snapshot_catalog_media_inspect(self, node_id)
    }

    fn commit_catalog_media_inspect(
        &mut self,
        snapshot: &CatalogMediaInspectSnapshot,
        media_info: Option<CatalogMediaInfo>,
        media_inspected_revision: u64,
    ) -> Option<RpcResponse> {
        LocalCoreAdapter::commit_catalog_media_inspect(
            self,
            snapshot,
            media_info,
            media_inspected_revision,
        )
    }

    fn snapshot_catalog_derivative_write(
        &mut self,
        request: CatalogDerivativeWriteRequest,
    ) -> Option<Result<CatalogDerivativeWriteSnapshot, RpcResponse>> {
        LocalCoreAdapter::snapshot_catalog_derivative_write(self, request)
    }

    fn commit_catalog_derivative_write(
        &mut self,
        snapshot: &CatalogDerivativeWriteSnapshot,
        write_result: &CatalogDerivativeWriteResult,
    ) -> Option<RpcResponse> {
        LocalCoreAdapter::commit_catalog_derivative_write(self, snapshot, write_result)
    }

    fn snapshot_wallet_balance(
        &mut self,
        data: &Value,
    ) -> Option<Result<Option<WalletBalanceSnapshot>, RpcResponse>> {
        LocalCoreAdapter::snapshot_wallet_balance(self, data)
    }

    fn commit_wallet_balance(&mut self, execution: WalletBalanceExecution) -> Option<RpcResponse> {
        LocalCoreAdapter::commit_wallet_balance(self, execution)
    }

    fn snapshot_wallet_history(
        &mut self,
        data: &Value,
    ) -> Option<Result<WalletHistorySnapshot, RpcResponse>> {
        LocalCoreAdapter::snapshot_wallet_history(self, data)
    }

    fn commit_wallet_history(&mut self, execution: WalletHistoryExecution) -> Option<RpcResponse> {
        LocalCoreAdapter::commit_wallet_history(self, execution)
    }

    fn handle_with_stream(&mut self, req: &RpcRequest, stream: Option<RpcInputStream>) -> RpcReply {
        LocalCoreAdapter::handle_with_stream(self, req, stream)
    }

    fn save(&mut self) -> Result<(), String> {
        LocalCoreAdapter::save(self)
    }

    fn take_events(&mut self) -> Vec<Value> {
        LocalCoreAdapter::take_events(self)
    }

    fn set_master_key(&mut self, key: Option<String>) {
        LocalCoreAdapter::set_master_key(self, key)
    }
}
