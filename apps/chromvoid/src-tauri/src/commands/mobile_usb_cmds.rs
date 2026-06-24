use crate::app_state::AppState;
use crate::mobile_usb::{
    HostId, MobileUsbHostView, MobileUsbPairRequest, MobileUsbScannedHost, MobileUsbStatus,
};

#[cfg(test)]
pub(crate) const MOBILE_USB_COMMAND_NAMES: &[&str] = &[
    "mobile_usb_scan",
    "mobile_usb_pair",
    "mobile_usb_connect",
    "mobile_usb_disconnect",
    "mobile_usb_status",
    "mobile_usb_list_paired",
    "mobile_usb_remove_paired",
];

#[tauri::command]
pub(crate) async fn mobile_usb_scan(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<MobileUsbScannedHost>, String> {
    ensure_mobile_usb_enabled()?;
    state.mobile_usb_runtime.scan().await.map_err(map_error)
}

#[tauri::command]
pub(crate) async fn mobile_usb_pair(
    state: tauri::State<'_, AppState>,
    request: MobileUsbPairRequest,
) -> Result<MobileUsbStatus, String> {
    ensure_mobile_usb_enabled()?;
    validate_pair_request(&request)?;
    state
        .mobile_usb_runtime
        .pair(request)
        .await
        .map_err(map_error)
}

#[tauri::command]
pub(crate) async fn mobile_usb_connect(
    state: tauri::State<'_, AppState>,
    host_id: HostId,
) -> Result<MobileUsbStatus, String> {
    ensure_mobile_usb_enabled()?;
    validate_host_id(&host_id)?;
    state
        .mobile_usb_runtime
        .connect(host_id)
        .await
        .map_err(map_error)
}

#[tauri::command]
pub(crate) fn mobile_usb_disconnect(
    state: tauri::State<'_, AppState>,
) -> Result<MobileUsbStatus, String> {
    ensure_mobile_usb_enabled()?;
    state.mobile_usb_runtime.disconnect().map_err(map_error)
}

#[tauri::command]
pub(crate) fn mobile_usb_status(
    state: tauri::State<'_, AppState>,
) -> Result<MobileUsbStatus, String> {
    state.mobile_usb_runtime.status().map_err(map_error)
}

#[tauri::command]
pub(crate) fn mobile_usb_list_paired(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<MobileUsbHostView>, String> {
    ensure_mobile_usb_enabled()?;
    state.mobile_usb_runtime.list_paired().map_err(map_error)
}

#[tauri::command]
pub(crate) fn mobile_usb_remove_paired(
    state: tauri::State<'_, AppState>,
    host_id: HostId,
) -> Result<Vec<MobileUsbHostView>, String> {
    ensure_mobile_usb_enabled()?;
    validate_host_id(&host_id)?;
    state
        .mobile_usb_runtime
        .remove_paired(host_id)
        .map_err(map_error)
}

pub(crate) fn mobile_usb_enabled() -> bool {
    crate::types::runtime_capabilities_for_current_target().supports_mobile_usb_remote
}

fn ensure_mobile_usb_enabled() -> Result<(), String> {
    if mobile_usb_enabled() {
        return Ok(());
    }
    Err(format!(
        "{}: mobile USB remote is disabled",
        crate::mobile_usb::MobileUsbErrorCode::UnsupportedPlatform.as_str()
    ))
}

fn validate_pair_request(request: &MobileUsbPairRequest) -> Result<(), String> {
    let valid_bridge = matches!(
        (request.platform, request.bridge_kind),
        (
            crate::mobile_usb::MobileUsbPlatform::Android,
            crate::mobile_usb::MobileUsbBridgeKind::AndroidAoa
        ) | (
            crate::mobile_usb::MobileUsbPlatform::Ios,
            crate::mobile_usb::MobileUsbBridgeKind::IosExternalAccessory
        )
    );
    if !valid_bridge {
        return Err(format!(
            "{}: mobile USB platform and bridge kind do not match",
            crate::mobile_usb::MobileUsbErrorCode::InvalidState.as_str()
        ));
    }
    Ok(())
}

fn validate_host_id(host_id: &str) -> Result<(), String> {
    if host_id.trim().is_empty() {
        return Err(format!(
            "{}: host_id is required",
            crate::mobile_usb::MobileUsbErrorCode::InvalidState.as_str()
        ));
    }
    Ok(())
}

fn map_error(error: crate::mobile_usb::MobileUsbError) -> String {
    format!("{}: {}", error.code.as_str(), error.message)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::mobile_usb::{MobileUsbBridgeKind, MobileUsbPlatform, UsbHint};

    #[test]
    fn mobile_usb_command_names_do_not_use_legacy_usb_prefix() {
        assert!(MOBILE_USB_COMMAND_NAMES
            .iter()
            .all(|name| name.starts_with("mobile_usb_")));
        assert!(MOBILE_USB_COMMAND_NAMES
            .iter()
            .all(|name| !name.starts_with("usb_")));
    }

    #[test]
    fn mobile_usb_disabled_gate_is_deterministic() {
        if mobile_usb_enabled() {
            return;
        }

        let error = ensure_mobile_usb_enabled().expect_err("disabled by default");

        assert!(error.starts_with("ERR_USB_MOBILE_UNSUPPORTED_PLATFORM"));
    }

    #[test]
    fn mobile_usb_command_validation_rejects_missing_host_id() {
        let error = validate_host_id("  ").expect_err("missing host id");

        assert!(error.starts_with("ERR_USB_MOBILE_INVALID_STATE"));
    }

    #[test]
    fn mobile_usb_command_validation_rejects_invalid_pair_target() {
        let error = validate_pair_request(&MobileUsbPairRequest {
            platform: MobileUsbPlatform::Android,
            bridge_kind: MobileUsbBridgeKind::IosExternalAccessory,
            usb_hint: UsbHint::default(),
            label: None,
        })
        .expect_err("invalid pair target");

        assert!(error.starts_with("ERR_USB_MOBILE_INVALID_STATE"));
    }
}
