//! Type definitions for the remote data-plane task.

use chromvoid_core::rpc::RpcInputStream;
use chromvoid_core::rpc::RpcReply;
use chromvoid_core::rpc::types::RpcRequest;
use chromvoid_protocol::{Frame, NoiseTransport, RemoteTransport, TransportType};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tokio::sync::oneshot;

use crate::adapter::{RemoteCancelGroup, RemoteRpcPriority};

/// Request sent from the adapter to the remote data-plane task.
pub struct RemoteIoRequest {
    pub request: RpcRequest,
    pub stream: Option<RpcInputStream>,
    pub reply_tx: oneshot::Sender<RpcReply>,
    pub priority: RemoteRpcPriority,
    pub cancel_group: Option<RemoteCancelGroup>,
}

/// Event sent from the remote data-plane task to the UI/adapter.
#[derive(Debug, Clone)]
pub enum RemoteIoEvent {
    Frame(Frame),
    StateChanged {
        old: String,
        new_state: String,
    },
    Disconnected {
        reason: String,
        failure: RemoteIoFailure,
    },
    Metrics {
        transport_type: TransportType,
    },
}

pub use chromvoid_network_runtime::remote_io::{RemoteIoFailure, RemoteIoResult};

#[derive(Debug, Clone, Default)]
pub struct RemotePeerFeatures {
    inner: Arc<Mutex<Vec<String>>>,
}

impl RemotePeerFeatures {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn from_shared(inner: Arc<Mutex<Vec<String>>>) -> Self {
        Self { inner }
    }

    pub fn shared(&self) -> Arc<Mutex<Vec<String>>> {
        self.inner.clone()
    }

    pub fn replace(&self, next: Vec<String>) {
        match self.inner.lock() {
            Ok(mut features) => *features = next,
            Err(_) => tracing::warn!("remote_peer_features: feature mutex poisoned"),
        }
    }

    pub fn contains(&self, feature: &str) -> bool {
        self.snapshot()
            .iter()
            .any(|candidate| candidate.as_str() == feature)
    }

    pub fn snapshot(&self) -> Vec<String> {
        match self.inner.lock() {
            Ok(features) => features.clone(),
            Err(_) => {
                tracing::warn!("remote_peer_features: feature mutex poisoned");
                Vec::new()
            }
        }
    }
}

/// Configuration for the remote data-plane task.
pub struct RemoteIoTaskConfig {
    pub transport: Box<dyn RemoteTransport>,
    pub noise_transport: NoiseTransport,
    pub peer_features: RemotePeerFeatures,
}

impl RemoteIoTaskConfig {
    pub fn new(transport: Box<dyn RemoteTransport>, noise_transport: NoiseTransport) -> Self {
        Self {
            transport,
            noise_transport,
            peer_features: RemotePeerFeatures::new(),
        }
    }

    pub fn with_peer_features(
        transport: Box<dyn RemoteTransport>,
        noise_transport: NoiseTransport,
        peer_features: RemotePeerFeatures,
    ) -> Self {
        Self {
            transport,
            noise_transport,
            peer_features,
        }
    }
}

#[derive(Debug, Clone, Copy)]
pub struct RemoteIoTaskTiming {
    pub heartbeat_interval: Duration,
    pub response_timeout: Duration,
    pub timeout_scan_interval: Duration,
}

impl Default for RemoteIoTaskTiming {
    fn default() -> Self {
        Self {
            heartbeat_interval: Duration::from_secs(30),
            response_timeout: Duration::from_secs(15),
            timeout_scan_interval: Duration::from_millis(100),
        }
    }
}
