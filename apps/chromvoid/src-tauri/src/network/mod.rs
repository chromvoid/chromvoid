pub mod connection;
pub mod io_task;
pub mod ios_control;
pub mod ios_lifecycle;
pub mod ios_pairing;
pub mod ios_peers;
pub mod ios_push;
pub mod local_identity;
pub mod mobile_acceptor;
pub mod paired_peers;
pub mod pairing;
pub mod safety;
pub mod server_profiles;
pub mod signaling;
pub mod wss_transport;

#[cfg(desktop)]
pub mod fallback;
#[cfg(desktop)]
pub mod quic_masque_transport;
#[cfg(desktop)]
pub mod tcp_stealth_transport;
#[cfg(desktop)]
pub mod webrtc_transport;

pub use connection::NetworkConnectionManager;
#[cfg(desktop)]
pub use fallback::{
    connect_with_fallback, connect_with_fallback_with_options, default_ice_servers,
    FallbackConnectOptions, FallbackResult, LastKnownGoodTransportCache, NetworkContext,
};
pub use io_task::{spawn_network_io_task, IoEvent, IoRequest, IoTaskConfig};
pub use ios_control::{
    create_pairing_session, fetch_host_presence, fetch_pairing_session, http_base_from_relay_url,
    publish_host_presence, send_wake, HostPresence, PairingOffer, PairingSessionSnapshot,
};
pub use ios_peers::{PairedIosPeer, PairedIosPeerStore};
pub use ios_push::{LocalIosPushRegistration, LocalIosPushRegistrationStore};
pub use local_identity::{LocalDeviceIdentity, LocalDeviceIdentityStore};
pub use paired_peers::{PairedPeer, PairedPeerStore};
pub use safety::{
    detect_cleartext_dns_leak, detect_direct_egress_leak, DnsRouting, EgressEvent, EgressFilter,
    EgressProtocol, SafetyStatus,
};
pub use server_profiles::{
    BootstrapProfile, ImportedProfile, ProfileMode, RotationAction, RotationResult,
    ServerProfileStore,
};
