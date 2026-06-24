//! Testable foundation for the `usb_mobile` remote transport family.
//!
//! This module owns the USB control-plane contracts and the record adapter that
//! turns a raw USB byte stream into the message-oriented `RemoteTransport`
//! expected by the shared remote data plane.

mod bridge;
mod controller;
pub(crate) mod observability;
mod pairing_protocol;
mod pairing_store;
mod record_transport;
mod secret_store;
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
pub(crate) use android_aoa::AndroidAoaMobileUsbBridge;
#[cfg(all(
    desktop,
    any(target_os = "linux", target_os = "macos", target_os = "windows")
))]
pub fn create_android_aoa_mobile_usb_bridge() -> std::sync::Arc<dyn bridge::MobileUsbBridge> {
    std::sync::Arc::new(android_aoa::AndroidAoaMobileUsbBridge::new())
}
pub use bridge::{BoxMobileUsbStream, MobileUsbBridge, UnsupportedMobileUsbBridge};
#[cfg(desktop)]
pub(crate) use controller::TauriMobileUsbSessionStarter;
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
pub use secret_store::{KeyringMobileUsbSecretStore, MobileUsbSecretStore};
pub use types::{
    ClientKeyRef, HostId, MobileUsbBridgeKind, MobileUsbCommand, MobileUsbDisconnectReason,
    MobileUsbError, MobileUsbErrorCode, MobileUsbHostView, MobileUsbOperationKind,
    MobileUsbPairRequest, MobileUsbPairedHostRecord, MobileUsbPlatform, MobileUsbRecoveryAction,
    MobileUsbScanClassification, MobileUsbScanResult, MobileUsbScannedHost, MobileUsbSessionEvent,
    MobileUsbSessionState, MobileUsbStateMachine, MobileUsbStatus, RemoteIoStopReason, SessionId,
    UsbHint,
};

#[cfg(test)]
mod tests;
