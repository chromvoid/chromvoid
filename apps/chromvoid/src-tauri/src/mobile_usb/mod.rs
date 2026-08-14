//! Testable foundation for the `usb_mobile` remote transport family.
//!
//! This module owns the USB control-plane contracts and the record adapter that
//! turns a raw USB byte stream into the message-oriented `RemoteTransport`
//! expected by the shared remote data plane.

mod bridge;
mod connect_attempt;
mod controller;
mod error_mapping;
pub(crate) mod observability;
mod pairing_coordinator;
pub(crate) mod pairing_protocol;
mod pairing_store;
mod record_transport;
mod secret_store;
#[cfg(desktop)]
mod session_coordinator;
mod types;

#[cfg(all(
    desktop,
    any(target_os = "linux", target_os = "macos", target_os = "windows")
))]
mod android_aoa;

#[cfg(all(
    desktop,
    any(target_os = "linux", target_os = "macos", target_os = "windows")
))]
mod hotplug;
#[cfg(all(
    desktop,
    any(target_os = "linux", target_os = "macos", target_os = "windows")
))]
pub use hotplug::{spawn_mobile_usb_hotplug_watcher, MOBILE_USB_INVENTORY_CHANGED_EVENT};

#[cfg(all(
    desktop,
    any(target_os = "linux", target_os = "macos", target_os = "windows")
))]
pub fn create_android_aoa_mobile_usb_bridge() -> std::sync::Arc<dyn bridge::MobileUsbBridge> {
    std::sync::Arc::new(android_aoa::AndroidAoaMobileUsbBridge::new())
}
#[cfg(all(
    desktop,
    any(target_os = "linux", target_os = "macos", target_os = "windows")
))]
pub fn create_android_aoa_mobile_usb_bridge_for_app_identifier(
    app_identifier: &str,
) -> std::sync::Arc<dyn bridge::MobileUsbBridge> {
    std::sync::Arc::new(
        android_aoa::AndroidAoaMobileUsbBridge::new_for_app_identifier(app_identifier),
    )
}
pub use bridge::{BoxMobileUsbStream, MobileUsbBridge, UnsupportedMobileUsbBridge};
pub use controller::{
    MobileUsbController, MobileUsbSessionHandle, MobileUsbSessionStarter,
    MobileUsbStartSessionRequest,
};
pub(crate) use pairing_protocol::{
    hex_encode as mobile_usb_hex_encode, recv_pairing_hello as recv_mobile_usb_pairing_hello,
    send_pairing_hello as send_mobile_usb_pairing_hello, MobileUsbPairingHello,
};
pub use pairing_store::{
    classify_scan_result, commit_pairing_with_secret, JsonMobileUsbPairingStore,
    MobileUsbPairingStore,
};
pub use record_transport::{
    MobileUsbByteStream, MobileUsbRemoteTransport, MAX_USB_REMOTE_RECORD_BYTES,
};
pub use secret_store::{
    mobile_usb_secret_service_for_app_identifier, KeyringMobileUsbSecretStore,
    MobileUsbSecretStore, MOBILE_USB_DEV_SECRET_SERVICE, MOBILE_USB_PRODUCTION_SECRET_SERVICE,
    MOBILE_USB_SMOKE_SECRET_SERVICE,
};
#[cfg(desktop)]
pub(crate) use session_coordinator::{
    disconnect_mobile_usb_and_restore_local, disconnect_mobile_usb_for_system_sleep,
    emit_mobile_usb_status_changed, restore_local_after_mobile_usb_session_end,
    TauriMobileUsbSessionStarter,
};
pub use types::{
    ClientKeyRef, HostId, MobileUsbBridgeKind, MobileUsbCommand, MobileUsbDetectCandidate,
    MobileUsbDetectedDevice, MobileUsbDetectedPairedMatch, MobileUsbDetectedPairingState,
    MobileUsbDisconnectReason, MobileUsbError, MobileUsbErrorCode, MobileUsbHostApprovalDecision,
    MobileUsbHostPairingApprovalView, MobileUsbHostSessionApprovalView, MobileUsbHostView,
    MobileUsbOperationKind, MobileUsbOperationToken, MobileUsbPairConfirmRequest,
    MobileUsbPairRequest, MobileUsbPairedHostRecord, MobileUsbPairingApprovalView,
    MobileUsbPlatform, MobileUsbRecoveryAction, MobileUsbScanClassification, MobileUsbScanResult,
    MobileUsbScannedHost, MobileUsbSessionEvent, MobileUsbSessionState, MobileUsbStateMachine,
    MobileUsbStatus, RemoteIoStopReason, SessionId, UsbHint, MOBILE_USB_SESSION_APPROVAL_TIMEOUT,
};

#[cfg(test)]
mod tests;
