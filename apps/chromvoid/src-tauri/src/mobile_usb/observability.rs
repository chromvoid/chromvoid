use std::collections::BTreeMap;
use std::hash::{Hash, Hasher};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

use chromvoid_protocol::TransportType;

use super::types::{
    HostId, MobileUsbBridgeKind, MobileUsbErrorCode, MobileUsbOperationKind, MobileUsbSessionState,
    SessionId,
};

pub(crate) const MOBILE_USB_TRANSPORT_FAMILY: &str = "usb_mobile";
const SPEC_ID: &str = "SPEC-006";
static MOBILE_USB_TIMELINE_SEQUENCE: AtomicU64 = AtomicU64::new(0);

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub(crate) struct MobileUsbMetricsSnapshot {
    pub operation_total: BTreeMap<String, u64>,
    pub state_transition_total: BTreeMap<String, u64>,
    pub error_total: BTreeMap<String, u64>,
    pub pair_duration_ms: Vec<u64>,
    pub connect_duration_ms: Vec<u64>,
}

#[derive(Default)]
pub(crate) struct MobileUsbObservability {
    metrics: Mutex<MobileUsbMetricsSnapshot>,
}

pub(crate) struct MobileUsbTimelineEvent<'a> {
    pub(crate) trace_id: Option<&'a str>,
    pub(crate) usb_session_id: Option<&'a str>,
    pub(crate) owner: &'static str,
    pub(crate) phase: &'static str,
    pub(crate) operation: &'static str,
    pub(crate) duration_ms: Option<u64>,
    pub(crate) host_id: Option<&'a str>,
    pub(crate) peer_id: Option<&'a str>,
    pub(crate) bridge_kind: Option<MobileUsbBridgeKind>,
    pub(crate) stop_reason: Option<&'a str>,
    pub(crate) error_code: Option<MobileUsbErrorCode>,
}

#[derive(Debug, Clone, Default)]
pub(crate) struct TransportSessionContext {
    inner: Arc<Mutex<TransportSessionContextFields>>,
}

#[derive(Debug, Clone, Default)]
struct TransportSessionContextFields {
    generation: Option<u64>,
    trace_id: Option<String>,
    usb_session_id: Option<String>,
    host_id: Option<String>,
    peer_id: Option<String>,
    bridge_kind: Option<MobileUsbBridgeKind>,
    transport_type: Option<TransportType>,
}

#[derive(Debug, Clone, Default)]
pub(crate) struct TransportSessionContextSnapshot {
    generation: Option<u64>,
    trace_id: Option<String>,
    usb_session_id: Option<String>,
    host_id: Option<String>,
    peer_id: Option<String>,
    bridge_kind: Option<MobileUsbBridgeKind>,
    transport_type: Option<TransportType>,
}

impl TransportSessionContext {
    pub(crate) fn new() -> Self {
        Self::default()
    }

    pub(crate) fn snapshot(&self) -> TransportSessionContextSnapshot {
        match self.inner.lock() {
            Ok(fields) => TransportSessionContextSnapshot {
                generation: fields.generation,
                trace_id: fields.trace_id.clone(),
                usb_session_id: fields.usb_session_id.clone(),
                host_id: fields.host_id.clone(),
                peer_id: fields.peer_id.clone(),
                bridge_kind: fields.bridge_kind,
                transport_type: fields.transport_type,
            },
            Err(_) => {
                tracing::warn!("mobile_usb: transport session context mutex poisoned");
                TransportSessionContextSnapshot::default()
            }
        }
    }

    pub(crate) fn set_generation(&self, generation: u64) {
        self.update(|fields| fields.generation = Some(generation));
    }

    pub(crate) fn set_host_id(&self, host_id: impl Into<String>) {
        self.update(|fields| fields.host_id = Some(host_id.into()));
    }

    pub(crate) fn with_trace_id(self, trace_id: impl Into<String>) -> Self {
        self.update(|fields| fields.trace_id = Some(trace_id.into()));
        self
    }

    pub(crate) fn with_usb_session_id(self, usb_session_id: impl Into<String>) -> Self {
        self.update(|fields| fields.usb_session_id = Some(usb_session_id.into()));
        self
    }

    pub(crate) fn with_host_id(self, host_id: impl Into<String>) -> Self {
        self.update(|fields| fields.host_id = Some(host_id.into()));
        self
    }

    #[cfg(test)]
    pub(crate) fn with_peer_id(self, peer_id: impl Into<String>) -> Self {
        self.update(|fields| fields.peer_id = Some(peer_id.into()));
        self
    }

    pub(crate) fn with_bridge_kind(self, bridge_kind: MobileUsbBridgeKind) -> Self {
        self.update(|fields| fields.bridge_kind = Some(bridge_kind));
        self
    }

    pub(crate) fn with_transport_type(self, transport_type: TransportType) -> Self {
        self.update(|fields| fields.transport_type = Some(transport_type));
        self
    }

    fn update(&self, update: impl FnOnce(&mut TransportSessionContextFields)) {
        match self.inner.lock() {
            Ok(mut fields) => update(&mut fields),
            Err(_) => tracing::warn!("mobile_usb: transport session context mutex poisoned"),
        }
    }
}

impl TransportSessionContextSnapshot {
    pub(crate) fn generation_label(&self) -> String {
        self.generation
            .map(|generation| generation.to_string())
            .unwrap_or_else(|| "none".to_string())
    }

    pub(crate) fn trace_id_label(&self) -> String {
        redacted_identifier(self.trace_id.as_deref())
    }

    pub(crate) fn usb_session_id_label(&self) -> String {
        redacted_identifier(self.usb_session_id.as_deref())
    }

    pub(crate) fn host_id_label(&self) -> String {
        redacted_identifier(self.host_id.as_deref())
    }

    pub(crate) fn peer_id_label(&self) -> String {
        redacted_identifier(self.peer_id.as_deref())
    }

    pub(crate) fn bridge_kind_label(&self) -> &'static str {
        self.bridge_kind.map(bridge_kind_name).unwrap_or("none")
    }

    pub(crate) fn transport_type_label(&self) -> String {
        self.transport_type
            .map(|transport_type| format!("{transport_type:?}"))
            .unwrap_or_else(|| "none".to_string())
    }

    pub(crate) fn diagnostic_fields_label(&self) -> String {
        format!(
            "bridge_kind={} transport_type={} session_generation={} trace_id={} usb_session_id={} host_id={} peer_id={}",
            self.bridge_kind_label(),
            self.transport_type_label(),
            self.generation_label(),
            self.trace_id_label(),
            self.usb_session_id_label(),
            self.host_id_label(),
            self.peer_id_label(),
        )
    }
}

#[cfg(test)]
mod transport_session_context_tests {
    use super::*;

    #[test]
    fn diagnostic_fields_label_redacts_session_identifiers() {
        let context = TransportSessionContext::new()
            .with_trace_id("trace-secret")
            .with_usb_session_id("usb-session-secret")
            .with_host_id("host-secret")
            .with_peer_id("peer-secret")
            .with_bridge_kind(MobileUsbBridgeKind::AndroidAoa)
            .with_transport_type(TransportType::UsbMobile);
        context.set_generation(77);

        let label = context.snapshot().diagnostic_fields_label();

        assert!(label.contains("session_generation=77"));
        assert!(label.contains("bridge_kind=android_aoa"));
        assert!(label.contains("transport_type=UsbMobile"));
        assert!(label.contains("trace_id=redacted:"));
        assert!(label.contains("usb_session_id=redacted:"));
        assert!(label.contains("host_id=redacted:"));
        assert!(label.contains("peer_id=redacted:"));
        assert!(!label.contains("trace-secret"));
        assert!(!label.contains("usb-session-secret"));
        assert!(!label.contains("host-secret"));
        assert!(!label.contains("peer-secret"));
    }
}

impl Default for MobileUsbTimelineEvent<'_> {
    fn default() -> Self {
        Self {
            trace_id: None,
            usb_session_id: None,
            owner: "unknown",
            phase: "unknown",
            operation: "unknown",
            duration_ms: None,
            host_id: None,
            peer_id: None,
            bridge_kind: None,
            stop_reason: None,
            error_code: None,
        }
    }
}

impl MobileUsbObservability {
    pub(crate) fn record_operation(
        &self,
        operation: &str,
        outcome: &str,
        error_code: Option<MobileUsbErrorCode>,
        duration_ms: u64,
    ) {
        let mut metrics = match self.metrics.lock() {
            Ok(metrics) => metrics,
            Err(_) => return,
        };

        let error_label = error_code.map(MobileUsbErrorCode::as_str).unwrap_or("none");
        increment(
            &mut metrics.operation_total,
            format!("{operation}|{outcome}|{error_label}"),
        );
        if let Some(error_code) = error_code {
            increment(&mut metrics.error_total, error_code.as_str().to_string());
        }
        match operation {
            "pair" => metrics.pair_duration_ms.push(duration_ms),
            "connect" => metrics.connect_duration_ms.push(duration_ms),
            _ => {}
        }
    }

    pub(crate) fn record_state_transition(
        &self,
        state_from: MobileUsbSessionState,
        state_to: MobileUsbSessionState,
    ) {
        if state_from == state_to {
            return;
        }
        let mut metrics = match self.metrics.lock() {
            Ok(metrics) => metrics,
            Err(_) => return,
        };
        increment(
            &mut metrics.state_transition_total,
            format!(
                "{}->{}",
                session_state_name(state_from),
                session_state_name(state_to)
            ),
        );
    }

    #[cfg(test)]
    pub(crate) fn snapshot(&self) -> MobileUsbMetricsSnapshot {
        self.metrics.lock().expect("mobile usb metrics").clone()
    }
}

pub(crate) fn mobile_usb_operation_name(operation: MobileUsbOperationKind) -> &'static str {
    match operation {
        MobileUsbOperationKind::Scan => "scan",
        MobileUsbOperationKind::Pair => "pair",
        MobileUsbOperationKind::PairConfirm => "pair_confirm",
        MobileUsbOperationKind::Connect => "connect",
    }
}

pub(crate) fn log_operation_start(
    operation: &str,
    host_id: Option<&HostId>,
    session_id: Option<&SessionId>,
    bridge_kind: Option<MobileUsbBridgeKind>,
) {
    tracing::info!(
        spec_id = SPEC_ID,
        transport_family = MOBILE_USB_TRANSPORT_FAMILY,
        operation,
        outcome = "start",
        host_id = %redacted_identifier(host_id.map(String::as_str)),
        session_id = %redacted_identifier(session_id.map(String::as_str)),
        bridge_kind = bridge_kind.map(bridge_kind_name).unwrap_or("none"),
        "mobile_usb operation start"
    );
}

pub(crate) fn log_operation_finish(
    operation: &str,
    outcome: &str,
    error_code: Option<MobileUsbErrorCode>,
    duration_ms: u64,
    host_id: Option<&HostId>,
    session_id: Option<&SessionId>,
    bridge_kind: Option<MobileUsbBridgeKind>,
) {
    tracing::info!(
        spec_id = SPEC_ID,
        transport_family = MOBILE_USB_TRANSPORT_FAMILY,
        operation,
        outcome,
        error_code = error_code.map(MobileUsbErrorCode::as_str).unwrap_or("none"),
        duration_ms,
        host_id = %redacted_identifier(host_id.map(String::as_str)),
        session_id = %redacted_identifier(session_id.map(String::as_str)),
        bridge_kind = bridge_kind.map(bridge_kind_name).unwrap_or("none"),
        "mobile_usb operation finish"
    );
}

pub(crate) fn log_state_transition(
    state_from: MobileUsbSessionState,
    state_to: MobileUsbSessionState,
    error_code: Option<MobileUsbErrorCode>,
    host_id: Option<&HostId>,
    session_id: Option<&SessionId>,
) {
    if state_from == state_to {
        return;
    }
    tracing::info!(
        spec_id = SPEC_ID,
        transport_family = MOBILE_USB_TRANSPORT_FAMILY,
        state_from = session_state_name(state_from),
        state_to = session_state_name(state_to),
        error_code = error_code.map(MobileUsbErrorCode::as_str).unwrap_or("none"),
        host_id = %redacted_identifier(host_id.map(String::as_str)),
        session_id = %redacted_identifier(session_id.map(String::as_str)),
        "mobile_usb state transition"
    );
}

pub(crate) fn new_timeline_trace_id() -> String {
    format!("mobile-usb-trace-{}", uuid::Uuid::new_v4())
}

pub(crate) fn log_timeline_event(event: MobileUsbTimelineEvent<'_>) {
    let seq = MOBILE_USB_TIMELINE_SEQUENCE
        .fetch_add(1, Ordering::AcqRel)
        .saturating_add(1);
    tracing::info!(
        spec_id = SPEC_ID,
        transport_family = MOBILE_USB_TRANSPORT_FAMILY,
        trace_id = %redacted_identifier(event.trace_id),
        usb_session_id = %redacted_identifier(event.usb_session_id),
        owner = event.owner,
        phase = event.phase,
        seq,
        operation = event.operation,
        duration_ms = event.duration_ms.unwrap_or(0),
        host_id = %redacted_identifier(event.host_id),
        peer_id = %redacted_identifier(event.peer_id),
        bridge_kind = event.bridge_kind.map(bridge_kind_name).unwrap_or("none"),
        stop_reason = event.stop_reason.unwrap_or("none"),
        error_code = event.error_code.map(MobileUsbErrorCode::as_str).unwrap_or("none"),
        "mobile_usb session timeline"
    );
}

pub(crate) fn redacted_identifier(value: Option<&str>) -> String {
    let Some(value) = value.map(str::trim).filter(|value| !value.is_empty()) else {
        return "none".to_string();
    };

    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    value.hash(&mut hasher);
    format!("redacted:{:016x}", hasher.finish())
}

fn increment(map: &mut BTreeMap<String, u64>, key: String) {
    *map.entry(key).or_default() += 1;
}

pub(crate) fn bridge_kind_name(bridge_kind: MobileUsbBridgeKind) -> &'static str {
    match bridge_kind {
        MobileUsbBridgeKind::AndroidAoa => "android_aoa",
        MobileUsbBridgeKind::IosExternalAccessory => "ios_external_accessory",
    }
}

fn session_state_name(state: MobileUsbSessionState) -> &'static str {
    match state {
        MobileUsbSessionState::LockedShell => "locked_shell",
        MobileUsbSessionState::TransportSelect => "transport_select",
        MobileUsbSessionState::IdleUsbMobile => "idle_usb_mobile",
        MobileUsbSessionState::ScanningUsbMobile => "scanning_usb_mobile",
        MobileUsbSessionState::PairingUsbMobile => "pairing_usb_mobile",
        MobileUsbSessionState::PairingApprovalRequired => "pairing_approval_required",
        MobileUsbSessionState::ConnectingUsbMobile => "connecting_usb_mobile",
        MobileUsbSessionState::SessionApprovalRequired => "session_approval_required",
        MobileUsbSessionState::TransportReadyHostLocked => "transport_ready_host_locked",
        MobileUsbSessionState::RemoteDashboardOpen => "remote_dashboard_open",
        MobileUsbSessionState::Disconnected => "disconnected",
        MobileUsbSessionState::Error => "error",
    }
}
