use crate::app_state::AppState;
use crate::core_adapter::{CoreAdapter, LocalCoreAdapter, RemoteCoreAdapter, RemoteHost};
use crate::helpers::*;
use crate::usb;

#[tauri::command]
pub(crate) fn usb_scan_devices(state: tauri::State<'_, AppState>) -> Vec<usb::UsbDevice> {
    let mut devices = usb::scan_usb_devices();

    let store = {
        let storage_root = state.storage_root.lock().unwrap();
        let store_path = storage_root.join("paired_usb_devices.json");
        usb::paired_devices::PairedDeviceStore::load(&store_path)
    };

    for d in &mut devices {
        if let Some(sn) = d.serial_number.as_deref() {
            d.is_paired = store.is_paired(sn);
        }
    }

    devices
}

#[tauri::command]
pub(crate) fn usb_connection_state(state: tauri::State<'_, AppState>) -> String {
    let adapter = state.adapter.lock().unwrap();
    let cs = adapter.connection_state();
    serde_json::to_string(&cs).unwrap_or_else(|_| "\"disconnected\"".to_string())
}

#[tauri::command]
pub(crate) fn usb_list_paired(state: tauri::State<'_, AppState>) -> Vec<serde_json::Value> {
    let storage_root = state.storage_root.lock().unwrap();
    let store_path = storage_root.join("paired_usb_devices.json");
    let store = usb::paired_devices::PairedDeviceStore::load(&store_path);
    store
        .list()
        .into_iter()
        .map(|d| {
            serde_json::json!({
                "serial_number": d.serial_number,
                "label": d.label,
                "last_seen": d.last_seen,
                "paired_at": d.paired_at,
            })
        })
        .collect()
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

    let storage_root = state.storage_root.lock().unwrap().clone();
    let store_path = storage_root.join("paired_usb_devices.json");
    let mut store = usb::paired_devices::PairedDeviceStore::load(&store_path);

    if store.is_paired(&serial_number) {
        return Err("device already paired".to_string());
    }

    let mut stream =
        usb::transport::open_serial_port(&port_path, usb::transport::DEFAULT_BAUD_RATE)
            .map_err(|e| format!("Failed to open serial port: {e}"))?;

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

    store.upsert(device);
    store.save()
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

    let storage_root = state.storage_root.lock().unwrap().clone();
    let store_path = storage_root.join("paired_usb_devices.json");
    let paired = {
        let store = usb::paired_devices::PairedDeviceStore::load(&store_path);
        store
            .get(&serial_number)
            .cloned()
            .ok_or_else(|| "device is not paired".to_string())?
    };

    let client_privkey = usb::handshake::decode_hex(&paired.client_privkey_hex)?;
    let device_pubkey = paired.device_pubkey.clone();

    let mut stream =
        usb::transport::open_serial_port(&port_path, usb::transport::DEFAULT_BAUD_RATE)
            .map_err(|e| format!("Failed to open serial port: {e}"))?;

    let noise =
        usb::handshake::handshake_ik_initiator(&mut stream, &client_privkey, &device_pubkey)
            .await?;

    let (req_tx, _evt_rx) = usb::io_task::spawn_io_task(usb::io_task::IoTaskConfig {
        stream,
        noise_transport: noise,
    });

    // Touch last_seen
    {
        let mut store = usb::paired_devices::PairedDeviceStore::load(&store_path);
        store.touch(&serial_number);
        let _ = store.save();
    }

    let host = RemoteHost::OrangePiUsb {
        device_id: serial_number.clone(),
    };
    let remote = RemoteCoreAdapter::new_usb(host, req_tx);

    {
        let mut adapter = state
            .adapter
            .lock()
            .map_err(|_| "Adapter mutex poisoned".to_string())?;
        *adapter = Box::new(remote) as Box<dyn CoreAdapter>;
        emit_basic_state(&app, &storage_root, adapter.as_ref());
    }

    Ok(())
}

#[tauri::command]
pub(crate) fn usb_disconnect(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    let storage_root = state.storage_root.lock().unwrap().clone();
    let adapter = LocalCoreAdapter::new(storage_root.clone()).map_err(|e| e.to_string())?;

    let mut guard = state
        .adapter
        .lock()
        .map_err(|_| "Adapter mutex poisoned".to_string())?;
    *guard = Box::new(adapter) as Box<dyn CoreAdapter>;
    emit_basic_state(&app, &storage_root, guard.as_ref());
    Ok(())
}
