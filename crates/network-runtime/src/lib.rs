//! Platform-neutral networking shared by native and Tauri clients.
//! Wire framing and Noise remain in chromvoid-protocol; Core authority remains in its runtime.

pub mod acceptor;
pub mod connection;
pub mod host_responder_task;
pub mod host_streams;
pub mod ios_control;
pub mod ios_host;
pub mod local_identity;
pub mod paired_peers;
pub mod paired_store_crypto;
pub mod pairing_transport;
pub mod remote_io;
pub mod rpc_transport_protocol;
pub mod rustls_crypto;
pub mod safety;
pub mod stream_lifecycle;
pub mod usb_mobile;
pub mod wss_transport;
