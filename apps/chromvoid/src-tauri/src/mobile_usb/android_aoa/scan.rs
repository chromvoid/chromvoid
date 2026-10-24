use super::super::types::{
    MobileUsbBridgeKind, MobileUsbDetectCandidate, MobileUsbError, MobileUsbErrorCode,
    MobileUsbPlatform, MobileUsbScanResult, UsbHint,
};
use super::backend::{
    AndroidAoaBackendError, AndroidAoaDeviceInfo, AndroidAoaEndpointHandle, AndroidAoaUsbBackend,
};
use super::protocol::{negotiate_accessory_mode, AndroidAoaIdentity};
use std::collections::HashSet;
use std::sync::Arc;
use std::time::Duration;

pub(super) const GOOGLE_ACCESSORY_VENDOR_ID: u16 = 0x18D1;
const GOOGLE_ACCESSORY_PRODUCT_IDS: &[u16] = &[0x2D00, 0x2D01, 0x2D02, 0x2D03, 0x2D04, 0x2D05];
// 50ms cadence keeps the same ~5s overall budget while detecting the
// re-enumerated accessory within one tick of it appearing (typically 400-600ms).
const AOA_REENUMERATION_ATTEMPTS: usize = 100;
const AOA_REENUMERATION_DELAY: Duration = Duration::from_millis(50);
pub(super) fn scan_blocking(
    backend: Arc<dyn AndroidAoaUsbBackend>,
    identity: &AndroidAoaIdentity,
) -> Result<Vec<MobileUsbScanResult>, MobileUsbError> {
    // An empty bus is a valid "nothing plugged in" outcome, not an error; probe
    // failures (permission denied, IO) still surface via ensure_accessory_devices.
    let devices = ensure_accessory_devices(backend, identity)?;
    Ok(devices
        .iter()
        .map(|device| scan_result_from_device(device, identity))
        .collect())
}

/// Passive inventory for the "detected on cable" UI: reads descriptors only.
/// Unlike `scan_blocking`, this never opens control transfers that switch a
/// phone into accessory mode, so it is safe to call on page mount or hotplug.
pub(super) fn detect_blocking(
    backend: Arc<dyn AndroidAoaUsbBackend>,
    identity: &AndroidAoaIdentity,
) -> Result<Vec<MobileUsbDetectCandidate>, MobileUsbError> {
    let devices = backend.list_devices().map_err(map_scan_backend_error)?;
    Ok(unique_devices(&devices)
        .map(|device| MobileUsbDetectCandidate {
            scan: scan_result_from_device(device, identity),
            accessory_mode: is_accessory_mode(device),
        })
        .collect())
}

pub(super) fn open_matching_accessory(
    backend: Arc<dyn AndroidAoaUsbBackend>,
    identity: &AndroidAoaIdentity,
    target_hint: &UsbHint,
) -> Result<Box<dyn AndroidAoaEndpointHandle>, MobileUsbError> {
    let devices = ensure_accessory_devices(backend.clone(), identity)?;
    let matches = devices
        .into_iter()
        .filter(|device| {
            scan_result_from_device(device, identity)
                .usb_hint
                .canonical()
                == *target_hint
        })
        .collect::<Vec<_>>();

    match matches.len() {
        0 => Err(MobileUsbError::new(
            MobileUsbErrorCode::NoAccessory,
            "no Android AOA accessory matched the requested USB hint",
        )),
        1 => backend
            .open_accessory(&matches[0])
            .map_err(map_open_backend_error),
        _ => Err(MobileUsbError::new(
            MobileUsbErrorCode::AmbiguousDiscovery,
            "multiple Android AOA accessories matched the requested USB hint",
        )),
    }
}

fn ensure_accessory_devices(
    backend: Arc<dyn AndroidAoaUsbBackend>,
    identity: &AndroidAoaIdentity,
) -> Result<Vec<AndroidAoaDeviceInfo>, MobileUsbError> {
    let mut devices = backend.list_devices().map_err(map_scan_backend_error)?;
    let mut accessories = accessory_devices(&devices);
    tracing::info!(
        device_count = devices.len(),
        accessory_count = accessories.len(),
        devices = %device_list_debug_label(&devices),
        "mobile_usb android_aoa scan initial USB inventory"
    );
    if !accessories.is_empty() {
        return Ok(accessories);
    }

    let mut first_error = None;
    let mut started_accessory_mode = false;
    let mut probe_count = 0usize;
    for device in devices.iter().filter(|device| !is_accessory_mode(device)) {
        probe_count += 1;
        match backend
            .open_device(&device.id)
            .and_then(|mut handle| negotiate_accessory_mode(handle.as_mut(), identity))
        {
            Ok(()) => {
                started_accessory_mode = true;
                tracing::info!(
                    device = %device_debug_label(device),
                    "mobile_usb android_aoa probe started accessory mode"
                );
            }
            Err(
                error @ (AndroidAoaBackendError::UnsupportedProtocol
                | AndroidAoaBackendError::NoDevice),
            ) => {
                tracing::info!(
                    device = %device_debug_label(device),
                    error = ?error,
                    "mobile_usb android_aoa probe skipped incompatible USB device"
                );
            }
            Err(error) => {
                tracing::warn!(
                    device = %device_debug_label(device),
                    error = ?error,
                    "mobile_usb android_aoa probe failed"
                );
                if first_error.is_none() {
                    first_error = Some(error);
                }
            }
        }
    }
    if probe_count == 0 {
        tracing::info!("mobile_usb android_aoa scan found no non-accessory USB devices to probe");
    }

    if started_accessory_mode {
        for attempt in 1..=AOA_REENUMERATION_ATTEMPTS {
            std::thread::sleep(AOA_REENUMERATION_DELAY);
            devices = backend.list_devices().map_err(map_scan_backend_error)?;
            accessories = accessory_devices(&devices);
            tracing::info!(
                attempt,
                device_count = devices.len(),
                accessory_count = accessories.len(),
                devices = %device_list_debug_label(&devices),
                "mobile_usb android_aoa scan reenumeration poll"
            );
            if !accessories.is_empty() {
                return Ok(accessories);
            }
        }
    }

    if let Some(error) = first_error {
        return Err(map_scan_backend_error(error));
    }

    Ok(Vec::new())
}

fn device_list_debug_label(devices: &[AndroidAoaDeviceInfo]) -> String {
    if devices.is_empty() {
        return "none".to_string();
    }

    let mut labels = devices
        .iter()
        .take(12)
        .map(device_debug_label)
        .collect::<Vec<_>>();
    if devices.len() > labels.len() {
        labels.push(format!("+{} more", devices.len() - labels.len()));
    }
    labels.join(", ")
}

fn device_debug_label(device: &AndroidAoaDeviceInfo) -> String {
    format!(
        "bus={} address={} vid=0x{:04x} pid=0x{:04x} accessory={} bulk_endpoints={}",
        device.id.bus_number,
        device.id.address,
        device.vendor_id,
        device.product_id,
        is_accessory_mode(device),
        device.endpoints.is_some()
    )
}

// libusb can repeat a device during accessory reenumeration. Keep its first entry.
fn unique_devices(devices: &[AndroidAoaDeviceInfo]) -> impl Iterator<Item = &AndroidAoaDeviceInfo> {
    let mut seen = HashSet::new();
    devices.iter().filter(move |device| seen.insert(&device.id))
}

fn accessory_devices(devices: &[AndroidAoaDeviceInfo]) -> Vec<AndroidAoaDeviceInfo> {
    unique_devices(devices)
        .filter(|device| is_accessory_mode(device))
        .cloned()
        .collect()
}

fn is_accessory_mode(device: &AndroidAoaDeviceInfo) -> bool {
    device.vendor_id == GOOGLE_ACCESSORY_VENDOR_ID
        && GOOGLE_ACCESSORY_PRODUCT_IDS.contains(&device.product_id)
}

pub(super) fn scan_result_from_device(
    device: &AndroidAoaDeviceInfo,
    identity: &AndroidAoaIdentity,
) -> MobileUsbScanResult {
    let manufacturer = clean_hint_part(device.manufacturer.as_deref());
    let model = clean_hint_part(device.product.as_deref());
    let serial_number = clean_hint_part(device.serial_number.as_deref())
        .filter(|value| value != &identity.protocol_id);
    let label = label_for_device(manufacturer.as_deref(), model.as_deref());

    MobileUsbScanResult {
        platform: MobileUsbPlatform::Android,
        bridge_kind: MobileUsbBridgeKind::AndroidAoa,
        usb_hint: UsbHint {
            manufacturer,
            model,
            serial_number,
            protocol_id: Some(identity.protocol_id.clone()),
        },
        label: Some(label),
    }
}

fn clean_hint_part(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
}

fn label_for_device(manufacturer: Option<&str>, model: Option<&str>) -> String {
    match (manufacturer, model) {
        (_, Some(model)) => model.to_string(),
        (Some(manufacturer), None) => manufacturer.to_string(),
        (None, None) => "Android USB device".to_string(),
    }
}

pub(super) fn map_scan_backend_error(error: AndroidAoaBackendError) -> MobileUsbError {
    match error {
        AndroidAoaBackendError::PermissionDenied => MobileUsbError::new(
            MobileUsbErrorCode::PermissionDenied,
            "permission denied while accessing Android USB device",
        ),
        AndroidAoaBackendError::NoDevice | AndroidAoaBackendError::UnsupportedProtocol => {
            MobileUsbError::new(
                MobileUsbErrorCode::NoAccessory,
                "no compatible Android AOA accessory device found",
            )
        }
        AndroidAoaBackendError::Timeout => MobileUsbError::new(
            MobileUsbErrorCode::NoAccessory,
            "timed out while discovering Android AOA accessory",
        ),
        AndroidAoaBackendError::Io(message) => MobileUsbError::new(
            MobileUsbErrorCode::BridgeUnavailable,
            format!("Android AOA bridge failed: {message}"),
        ),
    }
}

pub(super) fn map_open_backend_error(error: AndroidAoaBackendError) -> MobileUsbError {
    match error {
        AndroidAoaBackendError::PermissionDenied => MobileUsbError::new(
            MobileUsbErrorCode::PermissionDenied,
            "permission denied while opening Android AOA accessory",
        ),
        AndroidAoaBackendError::NoDevice => MobileUsbError::new(
            MobileUsbErrorCode::CableDisconnected,
            "Android AOA accessory disconnected while opening",
        ),
        AndroidAoaBackendError::UnsupportedProtocol => MobileUsbError::new(
            MobileUsbErrorCode::NoAccessory,
            "Android AOA accessory is not available",
        ),
        AndroidAoaBackendError::Timeout => MobileUsbError::new(
            MobileUsbErrorCode::NoAccessory,
            "timed out while opening Android AOA accessory",
        ),
        AndroidAoaBackendError::Io(message) => MobileUsbError::new(
            MobileUsbErrorCode::BridgeUnavailable,
            format!("Android AOA bridge failed: {message}"),
        ),
    }
}
