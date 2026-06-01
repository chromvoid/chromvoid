#[cfg(test)]
mod tests {
    use crate::core_adapter::remote::RemoteCoreAdapter;
    use crate::core_adapter::types::{
        ConnectionState, CoreAdapter, CoreMode, RemoteHost, RemoteRpcPriority,
    };
    use chromvoid_core::rpc::types::{RpcRequest, RpcResponse};
    use chromvoid_core::rpc::RpcReply;
    use tokio::sync::mpsc;

    #[test]
    fn from_network_creates_adapter() {
        let (tx, _rx) = mpsc::channel::<crate::network::io_task::IoRequest>(1);
        let host = RemoteHost::TauriRemoteWss {
            peer_id: "test-peer".to_string(),
        };
        let adapter = RemoteCoreAdapter::from_network(host, tx);
        assert!(matches!(adapter.mode(), CoreMode::Remote { .. }));
        assert_eq!(adapter.connection_state(), ConnectionState::Ready);
        assert!(!adapter.is_unlocked());
    }

    #[test]
    fn from_network_disconnected_when_rx_dropped() {
        let (tx, rx) = mpsc::channel::<crate::network::io_task::IoRequest>(1);
        let host = RemoteHost::TauriRemoteWss {
            peer_id: "test-peer".to_string(),
        };
        let adapter = RemoteCoreAdapter::from_network(host, tx);
        drop(rx);
        assert_eq!(adapter.connection_state(), ConnectionState::Disconnected);
    }

    #[test]
    fn new_usb_still_works() {
        let (tx, _rx) = mpsc::channel::<crate::usb::io_task::IoRequest>(1);
        let host = RemoteHost::OrangePiUsb {
            device_id: "dev-1".to_string(),
        };
        let adapter = RemoteCoreAdapter::new_usb(host, tx);
        assert!(matches!(adapter.mode(), CoreMode::Remote { .. }));
        assert_eq!(adapter.connection_state(), ConnectionState::Ready);
    }

    #[test]
    fn sync_integration_replace_sender_reconnects() {
        let (tx1, _rx1) = mpsc::channel::<crate::network::io_task::IoRequest>(1);
        let host = RemoteHost::TauriRemoteWss {
            peer_id: "test-peer".to_string(),
        };
        let mut adapter = RemoteCoreAdapter::from_network(host, tx1);
        assert!(adapter.is_transport_active());

        // Replace with new sender (simulating reconnect)
        let (tx2, _rx2) = mpsc::channel::<crate::network::io_task::IoRequest>(1);
        adapter.replace_network_sender(tx2);
        assert!(adapter.is_transport_active());
        assert_eq!(adapter.connection_state(), ConnectionState::Ready);
    }

    #[test]
    fn sync_integration_transport_active_reflects_channel() {
        let (tx, rx) = mpsc::channel::<crate::network::io_task::IoRequest>(1);
        let host = RemoteHost::TauriRemoteWss {
            peer_id: "test-peer".to_string(),
        };
        let adapter = RemoteCoreAdapter::from_network(host, tx);
        assert!(adapter.is_transport_active());
        drop(rx);
        assert!(!adapter.is_transport_active());
    }

    #[test]
    fn probe_capabilities_defaults_to_empty_for_old_hosts() {
        let (tx, mut rx) = mpsc::channel::<crate::network::io_task::IoRequest>(1);
        let host = RemoteHost::TauriRemoteWss {
            peer_id: "test-peer".to_string(),
        };
        let mut adapter = RemoteCoreAdapter::from_network(host, tx);

        let worker = std::thread::spawn(move || {
            let request = rx.blocking_recv().expect("capability request");
            assert_eq!(request.request.command, "core:capabilities");
            let _ = request.reply_tx.send(RpcReply::Json(RpcResponse::Error {
                ok: false,
                error: "unknown command: core:capabilities".to_string(),
                code: Some("UNKNOWN_COMMAND".to_string()),
            }));
        });

        adapter.probe_capabilities();
        worker.join().expect("worker join");

        assert!(adapter.remote_core_features().is_empty());
    }

    #[test]
    fn vault_lock_is_sent_with_high_remote_priority() {
        let (tx, mut rx) = mpsc::channel::<crate::network::io_task::IoRequest>(1);
        let host = RemoteHost::TauriRemoteWss {
            peer_id: "test-peer".to_string(),
        };
        let mut adapter = RemoteCoreAdapter::from_network(host, tx);

        let worker = std::thread::spawn(move || {
            let request = rx.blocking_recv().expect("lock request");
            assert_eq!(request.request.command, "vault:lock");
            assert_eq!(request.priority, RemoteRpcPriority::High);
            let _ = request
                .reply_tx
                .send(RpcReply::Json(RpcResponse::success(serde_json::json!({}))));
        });

        let response = adapter.handle(&RpcRequest::new("vault:lock", serde_json::json!({})));
        worker.join().expect("worker join");

        assert!(response.is_ok());
    }
}
