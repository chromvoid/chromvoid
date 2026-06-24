use std::collections::VecDeque;

use chromvoid_protocol::TransportType;
use serde::{Deserialize, Serialize};

pub type HostId = String;
pub type SessionId = String;
pub type ClientKeyRef = String;

const PENDING_STOPPED_SESSION_LIMIT: usize = 8;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MobileUsbPlatform {
    Android,
    Ios,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MobileUsbBridgeKind {
    AndroidAoa,
    IosExternalAccessory,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize, Default)]
pub struct UsbHint {
    pub manufacturer: Option<String>,
    pub model: Option<String>,
    pub serial_number: Option<String>,
    pub protocol_id: Option<String>,
}

impl UsbHint {
    pub fn canonical(&self) -> Self {
        Self {
            manufacturer: canonical_hint_part(self.manufacturer.as_deref()),
            model: canonical_hint_part(self.model.as_deref()),
            serial_number: canonical_hint_part(self.serial_number.as_deref()),
            protocol_id: canonical_hint_part(self.protocol_id.as_deref()),
        }
    }
}

fn canonical_hint_part(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct MobileUsbScanResult {
    pub platform: MobileUsbPlatform,
    pub bridge_kind: MobileUsbBridgeKind,
    pub usb_hint: UsbHint,
    pub label: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct MobileUsbPairRequest {
    pub platform: MobileUsbPlatform,
    pub bridge_kind: MobileUsbBridgeKind,
    pub usb_hint: UsbHint,
    pub label: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct MobileUsbPairedHostRecord {
    pub host_id: HostId,
    pub label: String,
    pub platform: MobileUsbPlatform,
    pub bridge_kind: MobileUsbBridgeKind,
    pub peer_pubkey: Vec<u8>,
    pub client_pubkey: Vec<u8>,
    pub client_key_ref: ClientKeyRef,
    pub usb_hint: UsbHint,
    pub paired_at: u64,
    pub last_seen: Option<u64>,
    #[serde(default)]
    pub pairing_confirmed_at: Option<u64>,
}

impl MobileUsbPairedHostRecord {
    pub fn is_valid_for_auto_match(&self) -> bool {
        !self.host_id.trim().is_empty()
            && !self.peer_pubkey.is_empty()
            && !self.client_key_ref.trim().is_empty()
    }

    pub fn matches_scan_result(&self, scan: &MobileUsbScanResult) -> bool {
        self.platform == scan.platform
            && self.bridge_kind == scan.bridge_kind
            && self.usb_hint.canonical() == scan.usb_hint.canonical()
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct MobileUsbHostView {
    pub host_id: HostId,
    pub label: String,
    pub platform: MobileUsbPlatform,
    pub bridge_kind: MobileUsbBridgeKind,
    pub pairing_state: MobileUsbPairingState,
    pub last_seen: Option<u64>,
}

impl MobileUsbHostView {
    pub fn from_record(
        record: &MobileUsbPairedHostRecord,
        pairing_state: MobileUsbPairingState,
    ) -> Self {
        Self {
            host_id: record.host_id.clone(),
            label: record.label.clone(),
            platform: record.platform,
            bridge_kind: record.bridge_kind,
            pairing_state,
            last_seen: record.last_seen,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MobileUsbPairingState {
    Paired,
    BrokenLocalState,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MobileUsbScanClassification {
    Paired { host_id: HostId },
    Unpaired,
    BrokenLocalState { host_id: HostId },
    Ambiguous,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct MobileUsbScannedHost {
    pub scan: MobileUsbScanResult,
    pub classification: MobileUsbScanClassification,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MobileUsbCommand {
    Scan,
    Pair(MobileUsbPairRequest),
    Connect { host_id: HostId },
    Disconnect { reason: MobileUsbDisconnectReason },
    Status,
    ListPaired,
    RemovePaired { host_id: HostId },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MobileUsbDisconnectReason {
    User,
    CableDisconnected,
    HostLocked,
    AppShutdown,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MobileUsbSessionEvent {
    HostUnlockConfirmed {
        session_id: SessionId,
    },
    RemoteIoStopped {
        session_id: SessionId,
        reason: RemoteIoStopReason,
    },
    CableDisconnected {
        session_id: SessionId,
    },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RemoteIoStopReason {
    Disconnected,
    Error(String),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MobileUsbSessionState {
    LockedShell,
    TransportSelect,
    IdleUsbMobile,
    ScanningUsbMobile,
    PairingUsbMobile,
    ConnectingUsbMobile,
    TransportReadyHostLocked,
    RemoteDashboardOpen,
    Disconnected,
    Error,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MobileUsbOperationKind {
    Scan,
    Pair,
    Connect,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum MobileUsbErrorCode {
    #[serde(rename = "ERR_USB_MOBILE_UNSUPPORTED_PLATFORM")]
    UnsupportedPlatform,
    #[serde(rename = "ERR_USB_MOBILE_IOS_MFI_REQUIRED")]
    IosMfiRequired,
    #[serde(rename = "ERR_USB_MOBILE_BUSY")]
    Busy,
    #[serde(rename = "ERR_USB_MOBILE_INVALID_STATE")]
    InvalidState,
    #[serde(rename = "ERR_USB_MOBILE_BRIDGE_UNAVAILABLE")]
    BridgeUnavailable,
    #[serde(rename = "ERR_USB_MOBILE_NO_ACCESSORY")]
    NoAccessory,
    #[serde(rename = "ERR_USB_MOBILE_PERMISSION_DENIED")]
    PermissionDenied,
    #[serde(rename = "ERR_USB_MOBILE_AMBIGUOUS_DISCOVERY")]
    AmbiguousDiscovery,
    #[serde(rename = "ERR_USB_MOBILE_NOT_PAIRED")]
    NotPaired,
    #[serde(rename = "ERR_USB_MOBILE_PAIRING_DUPLICATE")]
    PairingDuplicate,
    #[serde(rename = "ERR_USB_MOBILE_HANDSHAKE_FAILED")]
    HandshakeFailed,
    #[serde(rename = "ERR_USB_MOBILE_STALE_PAIRING")]
    StalePairing,
    #[serde(rename = "ERR_USB_MOBILE_SECRET_STORE_UNAVAILABLE")]
    SecretStoreUnavailable,
    #[serde(rename = "ERR_USB_MOBILE_SECRET_REF_INVALID")]
    SecretRefInvalid,
    #[serde(rename = "ERR_USB_MOBILE_PAIR_COMMIT_FAILED")]
    PairCommitFailed,
    #[serde(rename = "ERR_USB_MOBILE_RECORD_LAYER_FAILED")]
    RecordLayerFailed,
    #[serde(rename = "ERR_USB_MOBILE_CABLE_DISCONNECTED")]
    CableDisconnected,
    #[serde(rename = "ERR_USB_MOBILE_HOST_LOCKED")]
    HostLocked,
    #[serde(rename = "ERR_USB_MOBILE_UNLOCK_NOT_AUTHENTICATED")]
    UnlockNotAuthenticated,
    #[serde(rename = "ERR_USB_MOBILE_WRITER_LOCKED")]
    WriterLocked,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MobileUsbRecoveryAction {
    HideUsbEntry,
    ManualRetry,
    RetryScan,
    RetryPermission,
    WaitInFlight,
    KeepCurrentFlow,
    ListPaired,
    PairHost,
    ConnectExisting,
    RemoveAndRepair,
    DisconnectBeforeRetry,
    WaitForHostUnlock,
    IgnoreStaleUnlock,
    ContinueReadOnly,
}

impl MobileUsbErrorCode {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::UnsupportedPlatform => "ERR_USB_MOBILE_UNSUPPORTED_PLATFORM",
            Self::IosMfiRequired => "ERR_USB_MOBILE_IOS_MFI_REQUIRED",
            Self::Busy => "ERR_USB_MOBILE_BUSY",
            Self::InvalidState => "ERR_USB_MOBILE_INVALID_STATE",
            Self::BridgeUnavailable => "ERR_USB_MOBILE_BRIDGE_UNAVAILABLE",
            Self::NoAccessory => "ERR_USB_MOBILE_NO_ACCESSORY",
            Self::PermissionDenied => "ERR_USB_MOBILE_PERMISSION_DENIED",
            Self::AmbiguousDiscovery => "ERR_USB_MOBILE_AMBIGUOUS_DISCOVERY",
            Self::NotPaired => "ERR_USB_MOBILE_NOT_PAIRED",
            Self::PairingDuplicate => "ERR_USB_MOBILE_PAIRING_DUPLICATE",
            Self::HandshakeFailed => "ERR_USB_MOBILE_HANDSHAKE_FAILED",
            Self::StalePairing => "ERR_USB_MOBILE_STALE_PAIRING",
            Self::SecretStoreUnavailable => "ERR_USB_MOBILE_SECRET_STORE_UNAVAILABLE",
            Self::SecretRefInvalid => "ERR_USB_MOBILE_SECRET_REF_INVALID",
            Self::PairCommitFailed => "ERR_USB_MOBILE_PAIR_COMMIT_FAILED",
            Self::RecordLayerFailed => "ERR_USB_MOBILE_RECORD_LAYER_FAILED",
            Self::CableDisconnected => "ERR_USB_MOBILE_CABLE_DISCONNECTED",
            Self::HostLocked => "ERR_USB_MOBILE_HOST_LOCKED",
            Self::UnlockNotAuthenticated => "ERR_USB_MOBILE_UNLOCK_NOT_AUTHENTICATED",
            Self::WriterLocked => "ERR_USB_MOBILE_WRITER_LOCKED",
        }
    }

    pub fn recovery_action(self) -> MobileUsbRecoveryAction {
        match self {
            Self::UnsupportedPlatform | Self::IosMfiRequired => {
                MobileUsbRecoveryAction::HideUsbEntry
            }
            Self::Busy => MobileUsbRecoveryAction::WaitInFlight,
            Self::InvalidState => MobileUsbRecoveryAction::KeepCurrentFlow,
            Self::BridgeUnavailable
            | Self::HandshakeFailed
            | Self::SecretStoreUnavailable
            | Self::PairCommitFailed
            | Self::RecordLayerFailed => MobileUsbRecoveryAction::ManualRetry,
            Self::NoAccessory => MobileUsbRecoveryAction::RetryScan,
            Self::PermissionDenied => MobileUsbRecoveryAction::RetryPermission,
            Self::AmbiguousDiscovery => MobileUsbRecoveryAction::ListPaired,
            Self::NotPaired => MobileUsbRecoveryAction::PairHost,
            Self::PairingDuplicate => MobileUsbRecoveryAction::ConnectExisting,
            Self::StalePairing | Self::SecretRefInvalid => MobileUsbRecoveryAction::RemoveAndRepair,
            Self::CableDisconnected => MobileUsbRecoveryAction::DisconnectBeforeRetry,
            Self::HostLocked => MobileUsbRecoveryAction::WaitForHostUnlock,
            Self::UnlockNotAuthenticated => MobileUsbRecoveryAction::IgnoreStaleUnlock,
            Self::WriterLocked => MobileUsbRecoveryAction::ContinueReadOnly,
        }
    }
}

impl std::fmt::Display for MobileUsbErrorCode {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.as_str())
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MobileUsbError {
    pub code: MobileUsbErrorCode,
    pub message: String,
}

impl MobileUsbError {
    pub fn new(code: MobileUsbErrorCode, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
        }
    }
}

impl std::fmt::Display for MobileUsbError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}: {}", self.code, self.message)
    }
}

impl std::error::Error for MobileUsbError {}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct MobileUsbStatus {
    pub transport_family: &'static str,
    pub available_transports: Vec<TransportType>,
    pub selected_transport: Option<TransportType>,
    pub session_state: MobileUsbSessionState,
    pub fallback_allowed: bool,
    pub active_host: Option<MobileUsbHostView>,
    pub paired_hosts: Vec<MobileUsbHostView>,
    pub in_flight: Option<MobileUsbOperationKind>,
    pub error_code: Option<MobileUsbErrorCode>,
}

#[derive(Debug, Clone)]
pub struct MobileUsbStateMachine {
    session_state: MobileUsbSessionState,
    selected_transport: Option<TransportType>,
    in_flight: Option<MobileUsbOperationKind>,
    error_code: Option<MobileUsbErrorCode>,
    active_session_id: Option<SessionId>,
    active_host: Option<MobileUsbHostView>,
    pending_stopped_sessions: VecDeque<(SessionId, RemoteIoStopReason)>,
}

impl Default for MobileUsbStateMachine {
    fn default() -> Self {
        Self::new()
    }
}

impl MobileUsbStateMachine {
    pub fn new() -> Self {
        Self {
            session_state: MobileUsbSessionState::IdleUsbMobile,
            selected_transport: None,
            in_flight: None,
            error_code: None,
            active_session_id: None,
            active_host: None,
            pending_stopped_sessions: VecDeque::new(),
        }
    }

    pub fn session_state(&self) -> MobileUsbSessionState {
        self.session_state
    }

    pub fn begin_operation(
        &mut self,
        operation: MobileUsbOperationKind,
    ) -> Result<(), MobileUsbError> {
        if self.in_flight.is_some() {
            return Err(MobileUsbError::new(
                MobileUsbErrorCode::Busy,
                "mobile USB operation already in flight",
            ));
        }

        self.error_code = None;
        self.in_flight = Some(operation);
        self.session_state = match operation {
            MobileUsbOperationKind::Scan => MobileUsbSessionState::ScanningUsbMobile,
            MobileUsbOperationKind::Pair => MobileUsbSessionState::PairingUsbMobile,
            MobileUsbOperationKind::Connect => MobileUsbSessionState::ConnectingUsbMobile,
        };
        Ok(())
    }

    pub fn complete_operation(&mut self) {
        self.in_flight = None;
        if matches!(
            self.session_state,
            MobileUsbSessionState::ScanningUsbMobile
                | MobileUsbSessionState::PairingUsbMobile
                | MobileUsbSessionState::ConnectingUsbMobile
        ) {
            self.session_state = MobileUsbSessionState::IdleUsbMobile;
        }
    }

    pub fn establish_session(
        &mut self,
        session_id: SessionId,
        active_host: MobileUsbHostView,
        host_unlocked: bool,
    ) -> Result<(), MobileUsbError> {
        if let Some(reason) = self.take_pending_stopped_session(&session_id) {
            let error = mobile_usb_stop_reason_error(&reason);
            self.fail(error.code);
            return Err(error);
        }

        self.in_flight = None;
        self.error_code = None;
        self.selected_transport = Some(TransportType::UsbMobile);
        self.active_session_id = Some(session_id);
        self.active_host = Some(active_host);
        self.session_state = if host_unlocked {
            MobileUsbSessionState::RemoteDashboardOpen
        } else {
            MobileUsbSessionState::TransportReadyHostLocked
        };
        Ok(())
    }

    pub fn confirm_host_unlock(&mut self, session_id: &SessionId) -> Result<(), MobileUsbError> {
        if self.active_session_id.as_ref() != Some(session_id) {
            return Err(MobileUsbError::new(
                MobileUsbErrorCode::UnlockNotAuthenticated,
                "host unlock event does not match active mobile USB session",
            ));
        }
        if self.session_state == MobileUsbSessionState::TransportReadyHostLocked {
            self.session_state = MobileUsbSessionState::RemoteDashboardOpen;
        }
        Ok(())
    }

    pub fn remote_io_stopped(
        &mut self,
        session_id: &SessionId,
        reason: RemoteIoStopReason,
    ) -> bool {
        if self.active_session_id.as_ref() != Some(session_id) {
            self.remember_pending_stopped_session(session_id.clone(), reason);
            return false;
        }
        self.disconnect();
        true
    }

    pub fn disconnect(&mut self) {
        self.in_flight = None;
        self.error_code = None;
        self.selected_transport = None;
        self.active_session_id = None;
        self.active_host = None;
        self.session_state = MobileUsbSessionState::Disconnected;
        self.pending_stopped_sessions.clear();
    }

    pub fn is_active_host(&self, host_id: &HostId) -> bool {
        self.active_host
            .as_ref()
            .is_some_and(|host| host.host_id == *host_id)
    }

    pub fn can_reuse_active_host(&self, host_id: &HostId) -> bool {
        self.in_flight.is_none()
            && matches!(
                self.session_state,
                MobileUsbSessionState::TransportReadyHostLocked
                    | MobileUsbSessionState::RemoteDashboardOpen
            )
            && self.is_active_host(host_id)
    }

    pub fn fail(&mut self, code: MobileUsbErrorCode) {
        self.in_flight = None;
        self.error_code = Some(code);
        self.selected_transport = None;
        self.active_session_id = None;
        self.active_host = None;
        self.session_state = MobileUsbSessionState::Error;
        self.pending_stopped_sessions.clear();
    }

    pub fn status(&self, paired_hosts: Vec<MobileUsbHostView>) -> MobileUsbStatus {
        MobileUsbStatus {
            transport_family: "usb_mobile",
            available_transports: vec![TransportType::UsbMobile],
            selected_transport: self.selected_transport,
            session_state: self.session_state,
            fallback_allowed: false,
            active_host: self.active_host.clone(),
            paired_hosts,
            in_flight: self.in_flight,
            error_code: self.error_code,
        }
    }

    fn remember_pending_stopped_session(
        &mut self,
        session_id: SessionId,
        reason: RemoteIoStopReason,
    ) {
        if self
            .pending_stopped_sessions
            .iter()
            .any(|(pending_session_id, _)| pending_session_id == &session_id)
        {
            return;
        }
        if self.pending_stopped_sessions.len() >= PENDING_STOPPED_SESSION_LIMIT {
            self.pending_stopped_sessions.pop_front();
        }
        self.pending_stopped_sessions
            .push_back((session_id, reason));
    }

    fn take_pending_stopped_session(
        &mut self,
        session_id: &SessionId,
    ) -> Option<RemoteIoStopReason> {
        let index = self
            .pending_stopped_sessions
            .iter()
            .position(|(pending_session_id, _)| pending_session_id == session_id)?;
        self.pending_stopped_sessions
            .remove(index)
            .map(|(_, reason)| reason)
    }
}

fn mobile_usb_stop_reason_error(reason: &RemoteIoStopReason) -> MobileUsbError {
    match reason {
        RemoteIoStopReason::Disconnected => MobileUsbError::new(
            MobileUsbErrorCode::CableDisconnected,
            "mobile USB data plane stopped before the session became active",
        ),
        RemoteIoStopReason::Error(message) => MobileUsbError::new(
            MobileUsbErrorCode::RecordLayerFailed,
            format!("mobile USB data plane stopped before the session became active: {message}"),
        ),
    }
}
