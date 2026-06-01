use crate::app_state::AppState;
use crate::catalog_blocking_io::{CatalogBlockingIoError, CatalogBlockingIoRuntimeState};
use crate::core_adapter::{CoreAdapter, LocalCoreAdapter, RemoteCoreAdapter, RemoteHost};
use crate::helpers::*;
use crate::remote_io_runtime::RemoteIoStopReason;
use crate::state_ext::lock_or_string_err;
use crate::usb;
use std::path::PathBuf;
use std::sync::Arc;

#[tauri::command]
pub(crate) async fn usb_scan_devices(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<usb::UsbDevice>, String> {
    let mut devices = run_usb_device_scan_task(state.catalog_blocking_io_runtime.clone()).await?;

    let store_path = paired_usb_devices_path(&state)?;
    let paired_serials = run_usb_paired_device_store_task(
        state.catalog_blocking_io_runtime.clone(),
        store_path,
        "USB paired device scan",
        |store_path| {
            let loaded_store = usb::paired_devices::PairedDeviceStore::load(&store_path);
            Ok(loaded_store
                .list()
                .into_iter()
                .map(|device| device.serial_number.clone())
                .collect::<Vec<_>>())
        },
    )
    .await?;

    for d in &mut devices {
        if let Some(sn) = d.serial_number.as_deref() {
            d.is_paired = paired_serials.iter().any(|serial| serial == sn);
        }
    }

    Ok(devices)
}

#[tauri::command]
pub(crate) async fn usb_connection_state(
    state: tauri::State<'_, AppState>,
) -> Result<String, String> {
    let adapter = state.adapter.clone();
    let vault_background_io_runtime = state.vault_background_io_runtime.clone();

    match vault_background_io_runtime
        .spawn_blocking(move || {
            let adapter = adapter
                .lock()
                .map_err(|_| "Adapter mutex poisoned".to_string())?;
            let cs = adapter.connection_state();
            match serde_json::to_string(&cs) {
                Ok(state) => Ok(state),
                Err(error) => {
                    tracing::warn!("usb: failed to serialize connection state: {error}");
                    Ok("\"disconnected\"".to_string())
                }
            }
        })
        .await
    {
        Ok(result) => result,
        Err(error) => {
            let (error, _code) = error.into_rpc_error("USB connection state");
            Err(error)
        }
    }
}

#[tauri::command]
pub(crate) async fn usb_list_paired(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<serde_json::Value>, String> {
    let store_path = paired_usb_devices_path(&state)?;
    let paired = run_usb_paired_device_store_task(
        state.catalog_blocking_io_runtime.clone(),
        store_path,
        "USB paired device list",
        |store_path| {
            let loaded_store = usb::paired_devices::PairedDeviceStore::load(&store_path);
            Ok(loaded_store.list().into_iter().cloned().collect::<Vec<_>>())
        },
    )
    .await?;
    Ok(paired
        .into_iter()
        .map(|d| {
            serde_json::json!({
                "serial_number": d.serial_number,
                "label": d.label,
                "last_seen": d.last_seen,
                "paired_at": d.paired_at,
            })
        })
        .collect())
}

#[tauri::command]
pub(crate) async fn usb_pair_device(
    state: tauri::State<'_, AppState>,
    port_path: String,
    serial_number: String,
    label: String,
) -> Result<(), String> {
    if serial_number.trim().is_empty() {
        return Err("serial_number is required".to_string());
    }

    let store_path = paired_usb_devices_path(&state)?;
    let already_paired = run_usb_paired_device_store_task(
        state.catalog_blocking_io_runtime.clone(),
        store_path.clone(),
        "USB paired device preflight",
        {
            let serial_number = serial_number.clone();
            move |store_path| {
                let loaded_store = usb::paired_devices::PairedDeviceStore::load(&store_path);
                Ok(loaded_store.is_paired(&serial_number))
            }
        },
    )
    .await?;
    if already_paired {
        return Err("device already paired".to_string());
    }

    let mut stream =
        open_usb_serial_port_task(state.catalog_blocking_io_runtime.clone(), port_path).await?;

    let (_noise, device_pubkey, keypair) =
        usb::handshake::handshake_xx_initiator(&mut stream).await?;

    let ts = now_secs();
    let device = usb::paired_devices::PairedDevice {
        serial_number: serial_number.clone(),
        device_pubkey,
        client_pubkey: keypair.public.to_vec(),
        client_privkey_hex: usb::handshake::encode_hex(&keypair.private),
        label: if label.trim().is_empty() {
            serial_number.clone()
        } else {
            label
        },
        last_seen: ts,
        paired_at: ts,
    };

    run_usb_paired_device_store_task(
        state.catalog_blocking_io_runtime.clone(),
        store_path,
        "USB paired device save",
        move |store_path| {
            let mut loaded_store = usb::paired_devices::PairedDeviceStore::load(&store_path);
            if loaded_store.is_paired(&device.serial_number) {
                return Err("device already paired".to_string());
            }
            loaded_store.upsert(device);
            loaded_store.save()
        },
    )
    .await
}

#[tauri::command]
pub(crate) async fn usb_connect(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    port_path: String,
    serial_number: String,
) -> Result<(), String> {
    if serial_number.trim().is_empty() {
        return Err("serial_number is required".to_string());
    }

    let storage_root = lock_or_string_err!(state.storage_root, "Storage root").clone();
    let store_path = storage_root.join("paired_usb_devices.json");
    let paired = run_usb_paired_device_store_task(
        state.catalog_blocking_io_runtime.clone(),
        store_path.clone(),
        "USB paired device lookup",
        {
            let serial_number = serial_number.clone();
            move |store_path| {
                let loaded_store = usb::paired_devices::PairedDeviceStore::load(&store_path);
                loaded_store
                    .get(&serial_number)
                    .cloned()
                    .ok_or_else(|| "device is not paired".to_string())
            }
        },
    )
    .await?;

    let client_privkey = usb::handshake::decode_hex(&paired.client_privkey_hex)?;
    let device_pubkey = paired.device_pubkey.clone();

    let mut stream =
        open_usb_serial_port_task(state.catalog_blocking_io_runtime.clone(), port_path).await?;

    let noise =
        usb::handshake::handshake_ik_initiator(&mut stream, &client_privkey, &device_pubkey)
            .await?;

    let req_tx = state
        .remote_io_runtime
        .start_usb_session(usb::io_task::IoTaskConfig {
            stream,
            noise_transport: noise,
        })?;

    if let Err(error) = run_usb_paired_device_store_task(
        state.catalog_blocking_io_runtime.clone(),
        store_path,
        "USB paired device touch",
        {
            let serial_number = serial_number.clone();
            move |store_path| {
                let mut loaded_store = usb::paired_devices::PairedDeviceStore::load(&store_path);
                loaded_store.touch(&serial_number);
                loaded_store.save()
            }
        },
    )
    .await
    {
        tracing::warn!("usb_connect: failed to update paired device last_seen: {error}");
    }

    let host = RemoteHost::OrangePiUsb {
        device_id: serial_number.clone(),
    };
    let usb_start_result = (|| -> Result<(), String> {
        let mut remote = RemoteCoreAdapter::new_usb(host, req_tx);
        remote.probe_capabilities();
        let caps = crate::types::runtime_capabilities_for_current_target();
        crate::pro::guard_pro_feature_for_adapter(
            &mut remote,
            chromvoid_core::license::PRO_FEATURE_REMOTE,
            &caps,
        )
        .map_err(|error| match error {
            crate::types::RpcResult::Error { error, code, .. } => {
                format!(
                    "{}: {}",
                    code.unwrap_or_else(|| "PRO_REQUIRED".to_string()),
                    error
                )
            }
            crate::types::RpcResult::Success { .. } => "Pro license required".to_string(),
        })?;

        {
            let mut adapter = state
                .adapter
                .lock()
                .map_err(|_| "Adapter mutex poisoned".to_string())?;
            *adapter = Box::new(remote) as Box<dyn CoreAdapter>;
            emit_basic_state(&app, &storage_root, adapter.as_ref());
        }

        Ok(())
    })();

    if let Err(error) = usb_start_result {
        if let Err(stop_error) = state
            .remote_io_runtime
            .stop_active(RemoteIoStopReason::StartFailed)
        {
            tracing::warn!("usb_connect: remote IO cleanup failed after start error: {stop_error}");
        }
        return Err(error);
    }

    Ok(())
}

#[tauri::command]
pub(crate) fn usb_disconnect(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    let storage_root = lock_or_string_err!(state.storage_root, "Storage root").clone();
    let adapter = LocalCoreAdapter::new_with_license_store(
        storage_root.clone(),
        state.license_root.clone(),
        crate::pro::current_build_policy(),
    )
    .map_err(|e| e.to_string())?;

    let mut guard = state
        .adapter
        .lock()
        .map_err(|_| "Adapter mutex poisoned".to_string())?;
    *guard = Box::new(adapter) as Box<dyn CoreAdapter>;
    emit_basic_state(&app, &storage_root, guard.as_ref());
    drop(guard);

    if let Err(error) = state
        .remote_io_runtime
        .stop_active(RemoteIoStopReason::UsbDisconnect)
    {
        tracing::warn!("usb_disconnect: remote IO stop failed: {error}");
    }
    Ok(())
}

fn paired_usb_devices_path(state: &tauri::State<'_, AppState>) -> Result<PathBuf, String> {
    let storage_root = lock_or_string_err!(state.storage_root, "Storage root");
    Ok(storage_root.join("paired_usb_devices.json"))
}

async fn run_usb_paired_device_store_task<T, F>(
    catalog_blocking_io_runtime: Arc<CatalogBlockingIoRuntimeState>,
    store_path: PathBuf,
    task_label: &'static str,
    task: F,
) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce(PathBuf) -> Result<T, String> + Send + 'static,
{
    match catalog_blocking_io_runtime
        .spawn_blocking(move || task(store_path))
        .await
    {
        Ok(result) => result,
        Err(error) => Err(usb_blocking_task_err(error, task_label)),
    }
}

async fn run_usb_device_scan_task(
    catalog_blocking_io_runtime: Arc<CatalogBlockingIoRuntimeState>,
) -> Result<Vec<usb::UsbDevice>, String> {
    match catalog_blocking_io_runtime
        .spawn_blocking(usb::scan_usb_devices)
        .await
    {
        Ok(devices) => Ok(devices),
        Err(error) => Err(usb_blocking_task_err(error, "USB device scan")),
    }
}

async fn open_usb_serial_port_task(
    catalog_blocking_io_runtime: Arc<CatalogBlockingIoRuntimeState>,
    port_path: String,
) -> Result<tokio_serial::SerialStream, String> {
    match catalog_blocking_io_runtime
        .spawn_blocking(move || {
            usb::transport::open_serial_port(port_path.as_str(), usb::transport::DEFAULT_BAUD_RATE)
        })
        .await
    {
        Ok(result) => result.map_err(|e| format!("Failed to open serial port: {e}")),
        Err(error) => Err(usb_blocking_task_err(error, "USB serial port open")),
    }
}

fn usb_blocking_task_err(error: CatalogBlockingIoError, task_label: &'static str) -> String {
    let (error, _code) = error.into_rpc_error(task_label);
    error
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn usb_blocking_task_err_maps_shutdown() {
        assert_eq!(
            usb_blocking_task_err(
                CatalogBlockingIoError::ShuttingDown,
                "USB paired device list",
            ),
            "Catalog background IO is shutting down"
        );
    }
}
