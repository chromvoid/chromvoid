use chromvoid_core::rpc::{RpcInputStream, RpcReply, RpcRequest, RpcResponse, RpcStreamMeta};
use chromvoid_protocol::{
    frame_continuation, Frame, FrameType, NoiseTransport, RemoteTransport, TransportError,
    TransportType, FLAG_HAS_CONTINUATION,
};
use std::io::{self, Read};
use std::pin::Pin;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::task::{Context, Poll};
use tokio::io::{duplex, AsyncRead, AsyncReadExt, AsyncWrite, AsyncWriteExt, ReadBuf};

use super::bridge::{BoxMobileUsbStream, MobileUsbBridge};
use super::controller::{
    MobileUsbController, MobileUsbSessionHandle, MobileUsbSessionStarter,
    MobileUsbStartSessionRequest,
};
use super::observability::redacted_identifier;
use super::pairing_store::{
    classify_scan_result, commit_pairing_with_secret, InMemoryMobileUsbPairingStore,
    JsonMobileUsbPairingStore, MobileUsbPairingStore,
};
use super::record_transport::{MobileUsbRemoteTransport, MAX_USB_REMOTE_RECORD_BYTES};
use super::secret_store::{InMemoryMobileUsbSecretStore, MobileUsbSecretStore};
#[cfg(desktop)]
use super::session_coordinator::{MobileUsbSessionEventTarget, TauriMobileUsbSessionEventSink};
use super::types::{
    MobileUsbBridgeKind, MobileUsbDetectCandidate, MobileUsbDetectedPairingState, MobileUsbError,
    MobileUsbErrorCode, MobileUsbHostView, MobileUsbOperationKind, MobileUsbOperationToken,
    MobileUsbPairConfirmRequest, MobileUsbPairRequest, MobileUsbPairedHostRecord,
    MobileUsbPairingState, MobileUsbPlatform, MobileUsbRecoveryAction, MobileUsbScanClassification,
    MobileUsbScanResult, MobileUsbSessionEvent, MobileUsbSessionState, MobileUsbStateMachine,
    MobileUsbStatus, RemoteIoStopReason, UsbHint,
};

#[cfg(desktop)]
use super::create_android_aoa_mobile_usb_bridge;
use super::{
    mobile_usb_hex_encode, recv_mobile_usb_pairing_hello, send_mobile_usb_pairing_hello,
    MobileUsbPairingHello,
};

mod controller_connect;
mod controller_detect;
mod controller_pairing;
mod pairing_store;
mod record_transport;
mod shared_data_plane;
mod state_machine;
mod support;
