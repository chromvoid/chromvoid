#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum AndroidMobileUsbHostStopReason {
    Shutdown,
    VaultLocked,
    PeerClosed,
    AccessoryDetached,
    ExplicitDisconnect,
    SessionReplaced,
    LocalError,
    TransportClosed,
    PairingComplete,
    StreamTimeout,
    DataPlaneError,
    Error,
}

impl AndroidMobileUsbHostStopReason {
    pub(crate) fn as_str(self) -> &'static str {
        match self {
            Self::Shutdown => "shutdown",
            Self::VaultLocked => "vault_locked",
            Self::PeerClosed => "peer_closed",
            Self::AccessoryDetached => "accessory_detached",
            Self::ExplicitDisconnect => "explicit_disconnect",
            Self::SessionReplaced => "session_replaced",
            Self::LocalError => "local_error",
            Self::TransportClosed => "transport_closed",
            Self::PairingComplete => "pairing_complete",
            Self::StreamTimeout => "stream_timeout",
            Self::DataPlaneError => "data_plane_error",
            Self::Error => "error",
        }
    }

    pub(crate) fn from_local_stop_reason(reason: &str) -> Option<Self> {
        match reason {
            "accessory_detached" => Some(Self::AccessoryDetached),
            "explicit_disconnect" => Some(Self::ExplicitDisconnect),
            "session_replaced" => Some(Self::SessionReplaced),
            "local_error" => Some(Self::LocalError),
            _ => None,
        }
    }

    pub(crate) fn as_local_direct_transport_stop_reason(
        self,
    ) -> crate::network::mobile_acceptor::DirectTransportStopReason {
        match self {
            Self::VaultLocked => {
                crate::network::mobile_acceptor::DirectTransportStopReason::VaultLocked
            }
            Self::AccessoryDetached => {
                crate::network::mobile_acceptor::DirectTransportStopReason::AccessoryDetached
            }
            Self::ExplicitDisconnect => {
                crate::network::mobile_acceptor::DirectTransportStopReason::ExplicitDisconnect
            }
            Self::SessionReplaced => {
                crate::network::mobile_acceptor::DirectTransportStopReason::SessionReplaced
            }
            Self::LocalError => {
                crate::network::mobile_acceptor::DirectTransportStopReason::LocalError
            }
            Self::Shutdown
            | Self::PeerClosed
            | Self::TransportClosed
            | Self::PairingComplete
            | Self::StreamTimeout
            | Self::DataPlaneError
            | Self::Error => crate::network::mobile_acceptor::DirectTransportStopReason::Shutdown,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum AndroidMobileUsbHostFailure {
    PairingComplete,
    TransportClosed,
    DataPlaneError(String),
    Error(String),
}

impl AndroidMobileUsbHostFailure {
    pub(crate) fn from_direct_accept_failure(
        failure: crate::network::mobile_acceptor::DirectTransportAcceptFailure,
    ) -> Self {
        match failure {
            crate::network::mobile_acceptor::DirectTransportAcceptFailure::TransportClosed {
                ..
            } => Self::TransportClosed,
            crate::network::mobile_acceptor::DirectTransportAcceptFailure::TransportTimeout {
                ..
            } => Self::TransportClosed,
            crate::network::mobile_acceptor::DirectTransportAcceptFailure::PairingComplete {
                ..
            } => Self::PairingComplete,
            crate::network::mobile_acceptor::DirectTransportAcceptFailure::DataPlaneError {
                message,
            } => Self::DataPlaneError(message),
            crate::network::mobile_acceptor::DirectTransportAcceptFailure::ProtocolError {
                message,
            }
            | crate::network::mobile_acceptor::DirectTransportAcceptFailure::Error { message } => {
                Self::Error(message)
            }
        }
    }

    pub(crate) fn stop_reason(&self) -> AndroidMobileUsbHostStopReason {
        match self {
            Self::PairingComplete => AndroidMobileUsbHostStopReason::PairingComplete,
            Self::TransportClosed => AndroidMobileUsbHostStopReason::TransportClosed,
            Self::DataPlaneError(_) => AndroidMobileUsbHostStopReason::DataPlaneError,
            Self::Error(_) => AndroidMobileUsbHostStopReason::Error,
        }
    }
}

impl std::fmt::Display for AndroidMobileUsbHostFailure {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::PairingComplete => write!(f, "pairing complete"),
            Self::TransportClosed => write!(f, "transport closed"),
            Self::DataPlaneError(error) | Self::Error(error) => write!(f, "{error}"),
        }
    }
}
