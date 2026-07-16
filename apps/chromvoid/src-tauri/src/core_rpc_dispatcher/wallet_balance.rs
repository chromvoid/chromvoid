use std::sync::{Arc, Mutex};

#[cfg(desktop)]
use chromvoid_core::rpc::types::RpcRequest;
use chromvoid_core::rpc::{execute_wallet_balance_snapshot, RpcResponse};
use serde_json::Value;
use tracing::info;

use crate::core_adapter::CoreAdapter;
#[cfg(desktop)]
use crate::core_adapter::{RemoteJsonClientHandle, RemoteRpcPriority};
use crate::helpers::flush_core_events;
use crate::types::{rpc_err, RpcResult};

use super::{CoreRpcDispatchError, CoreRpcDispatcher, CoreRpcPriority};

enum WalletBalanceStart {
    Local(Result<Option<chromvoid_core::rpc::WalletBalanceSnapshot>, RpcResponse>),
    #[cfg(desktop)]
    Remote(RemoteJsonClientHandle),
    Fallback,
}

pub(crate) async fn dispatch_wallet_balance(
    dispatcher: CoreRpcDispatcher,
    adapter: Arc<Mutex<Box<dyn CoreAdapter>>>,
    app: tauri::AppHandle,
    cancellation_generation: u64,
    data: Value,
) -> Result<Option<RpcResponse>, RpcResult<Value>> {
    let snapshot_started = std::time::Instant::now();
    let adapter_for_snapshot = adapter.clone();
    #[cfg(desktop)]
    let data_for_snapshot = data.clone();
    #[cfg(not(desktop))]
    let data_for_snapshot = data;
    let snapshot_phase = dispatcher
        .run_adapter_phase(
            CoreRpcPriority::UserBlocking,
            "wallet:balance:get",
            "snapshot",
            cancellation_generation,
            move || {
                let mut adapter = adapter_for_snapshot
                    .lock()
                    .map_err(|_| rpc_err("Adapter mutex poisoned", Some("INTERNAL".to_string())))?;
                Ok::<WalletBalanceStart, RpcResult<Value>>(
                    match adapter.snapshot_wallet_balance(&data_for_snapshot) {
                        Some(snapshot) => WalletBalanceStart::Local(snapshot),
                        None => {
                            #[cfg(desktop)]
                            if let Some(remote_client) = adapter.remote_json_client() {
                                return Ok(WalletBalanceStart::Remote(remote_client));
                            }
                            WalletBalanceStart::Fallback
                        }
                    },
                )
            },
        )
        .await
        .map_err(dispatcher_error)?;
    let snapshot = match snapshot_phase.value? {
        WalletBalanceStart::Local(Ok(Some(snapshot))) => snapshot,
        WalletBalanceStart::Local(Ok(None)) => return Ok(None),
        WalletBalanceStart::Local(Err(response)) => return Ok(Some(response)),
        #[cfg(desktop)]
        WalletBalanceStart::Remote(remote_client) => {
            let request = RpcRequest::new("wallet:balance:get", data);
            let remote_started = std::time::Instant::now();
            let response = tokio::task::spawn_blocking(move || {
                remote_client.send_json_blocking(request, RemoteRpcPriority::Normal, None)
            })
            .await
            .map_err(|error| {
                rpc_err(
                    format!("remote wallet balance worker failed: {error}"),
                    Some("INTERNAL".to_string()),
                )
            })?;
            info!(
                remote_wait_ms = remote_started.elapsed().as_millis(),
                "perf:wallet_balance remote complete"
            );
            return Ok(Some(response));
        }
        WalletBalanceStart::Fallback => return Ok(None),
    };
    let snapshot_ms = snapshot_started.elapsed().as_millis();

    let network_started = std::time::Instant::now();
    let execution = tokio::task::spawn_blocking(move || execute_wallet_balance_snapshot(snapshot))
        .await
        .map_err(|error| {
            rpc_err(
                format!("wallet balance worker failed: {error}"),
                Some("INTERNAL".to_string()),
            )
        })?;
    let network_ms = network_started.elapsed().as_millis();

    let adapter_for_commit = adapter.clone();
    let app_for_commit = app.clone();
    let commit_started = std::time::Instant::now();
    let commit_phase = dispatcher
        .run_adapter_phase(
            CoreRpcPriority::UserBlocking,
            "wallet:balance:get",
            "commit",
            cancellation_generation,
            move || {
                let mut adapter = adapter_for_commit
                    .lock()
                    .map_err(|_| rpc_err("Adapter mutex poisoned", Some("INTERNAL".to_string())))?;
                let response = adapter.commit_wallet_balance(execution).ok_or_else(|| {
                    rpc_err(
                        "wallet balance split commit is unavailable",
                        Some("INTERNAL".to_string()),
                    )
                })?;
                let _ = adapter.save();
                flush_core_events(&app_for_commit, adapter.as_mut());
                Ok::<RpcResponse, RpcResult<Value>>(response)
            },
        )
        .await
        .map_err(dispatcher_error)?;
    let response = commit_phase.value?;
    info!(
        snapshot_ms,
        network_ms,
        commit_ms = commit_started.elapsed().as_millis(),
        dispatcher_wait_ms = commit_phase.timing.dispatcher_wait_ms,
        "perf:wallet_balance split complete"
    );
    Ok(Some(response))
}

fn dispatcher_error(error: CoreRpcDispatchError) -> RpcResult<Value> {
    let code = if error == CoreRpcDispatchError::Cancelled {
        "CANCELLED"
    } else {
        "INTERNAL"
    };
    rpc_err(
        format!("wallet balance dispatcher error: {error}"),
        Some(code.to_string()),
    )
}
