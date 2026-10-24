use crate::app_state::AppState;
use crate::mobile_usb::{MobileUsbHostPairingApprovalView, MobileUsbHostSessionApprovalView};
use crate::network::mobile_acceptor::MobileUsbApprovalKind;

#[tauri::command]
pub(crate) fn mobile_usb_host_pending_pairing_approval(
    state: tauri::State<'_, AppState>,
) -> Result<Option<MobileUsbHostPairingApprovalView>, String> {
    state.mobile_acceptor_runtime.pending_usb_pairing_approval()
}

#[tauri::command]
pub(crate) fn mobile_usb_host_approve_pairing(
    state: tauri::State<'_, AppState>,
    attempt_id: String,
) -> Result<(), String> {
    let result = state.mobile_acceptor_runtime.resolve_usb_approval(
        MobileUsbApprovalKind::Pairing,
        &attempt_id,
        true,
    );
    if result.is_ok() {
        cancel_usb_approval_notification();
    }
    result
}

#[tauri::command]
pub(crate) fn mobile_usb_host_reject_pairing(
    state: tauri::State<'_, AppState>,
    attempt_id: String,
) -> Result<(), String> {
    let result = state.mobile_acceptor_runtime.resolve_usb_approval(
        MobileUsbApprovalKind::Pairing,
        &attempt_id,
        false,
    );
    if result.is_ok() {
        cancel_usb_approval_notification();
    }
    result
}

#[tauri::command]
pub(crate) fn mobile_usb_host_pending_session_approval(
    state: tauri::State<'_, AppState>,
) -> Result<Option<MobileUsbHostSessionApprovalView>, String> {
    state.mobile_acceptor_runtime.pending_usb_session_approval()
}

#[tauri::command]
pub(crate) fn mobile_usb_host_approve_session(
    state: tauri::State<'_, AppState>,
    attempt_id: String,
) -> Result<(), String> {
    let result = state.mobile_acceptor_runtime.resolve_usb_approval(
        MobileUsbApprovalKind::Session,
        &attempt_id,
        true,
    );
    if result.is_ok() {
        cancel_usb_approval_notification();
    }
    result
}

#[tauri::command]
pub(crate) fn mobile_usb_host_reject_session(
    state: tauri::State<'_, AppState>,
    attempt_id: String,
) -> Result<(), String> {
    let result = state.mobile_acceptor_runtime.resolve_usb_approval(
        MobileUsbApprovalKind::Session,
        &attempt_id,
        false,
    );
    if result.is_ok() {
        cancel_usb_approval_notification();
    }
    result
}

fn cancel_usb_approval_notification() {}
