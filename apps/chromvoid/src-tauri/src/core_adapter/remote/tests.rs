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
    fn from_remote_sender_creates_adapter() {
        let (tx, _rx) = mpsc::channel::<crate::remote_data_plane::RemoteIoRequest>(1);
        let host = RemoteHost::TauriRemoteWss {
            peer_id: "test-peer".to_string(),
        };
        let adapter = RemoteCoreAdapter::from_remote_sender(host, tx);
        assert!(matches!(adapter.mode(), CoreMode::Remote { .. }));
        assert_eq!(adapter.connection_state(), ConnectionState::Ready);
        assert!(!adapter.is_unlocked());
    }

    #[test]
    fn from_remote_sender_disconnected_when_rx_dropped() {
        let (tx, rx) = mpsc::channel::<crate::remote_data_plane::RemoteIoRequest>(1);
        let host = RemoteHost::TauriRemoteWss {
            peer_id: "test-peer".to_string(),
        };
        let adapter = RemoteCoreAdapter::from_remote_sender(host, tx);
        drop(rx);
        assert_eq!(adapter.connection_state(), ConnectionState::Disconnected);
    }

    #[test]
    fn sync_integration_replace_sender_reconnects() {
        let (tx1, _rx1) = mpsc::channel::<crate::remote_data_plane::RemoteIoRequest>(1);
        let host = RemoteHost::TauriRemoteWss {
            peer_id: "test-peer".to_string(),
        };
        let mut adapter = RemoteCoreAdapter::from_remote_sender(host, tx1);
        assert!(adapter.is_transport_active());

        // Replace with new sender (simulating reconnect)
        let (tx2, _rx2) = mpsc::channel::<crate::remote_data_plane::RemoteIoRequest>(1);
        adapter.replace_remote_sender(tx2);
        assert!(adapter.is_transport_active());
        assert_eq!(adapter.connection_state(), ConnectionState::Ready);
    }

    #[test]
    fn sync_integration_transport_active_reflects_channel() {
        let (tx, rx) = mpsc::channel::<crate::remote_data_plane::RemoteIoRequest>(1);
        let host = RemoteHost::TauriRemoteWss {
            peer_id: "test-peer".to_string(),
        };
        let adapter = RemoteCoreAdapter::from_remote_sender(host, tx);
        assert!(adapter.is_transport_active());
        drop(rx);
        assert!(!adapter.is_transport_active());
    }

    #[test]
    fn probe_capabilities_defaults_to_empty_for_old_hosts() {
        let (tx, mut rx) = mpsc::channel::<crate::remote_data_plane::RemoteIoRequest>(1);
        let host = RemoteHost::TauriRemoteWss {
            peer_id: "test-peer".to_string(),
        };
        let mut adapter = RemoteCoreAdapter::from_remote_sender(host, tx);

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
        let (tx, mut rx) = mpsc::channel::<crate::remote_data_plane::RemoteIoRequest>(1);
        let host = RemoteHost::TauriRemoteWss {
            peer_id: "test-peer".to_string(),
        };
        let mut adapter = RemoteCoreAdapter::from_remote_sender(host, tx);

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

    #[test]
    fn vault_lock_error_keeps_remote_adapter_unlocked() {
        let (tx, mut rx) = mpsc::channel::<crate::remote_data_plane::RemoteIoRequest>(4);
        let host = RemoteHost::TauriRemoteWss {
            peer_id: "test-peer".to_string(),
        };
        let mut adapter = RemoteCoreAdapter::from_remote_sender(host, tx);

        let worker = std::thread::spawn(move || {
            let unlock = rx.blocking_recv().expect("unlock request");
            assert_eq!(unlock.request.command, "vault:unlock");
            let _ = unlock
                .reply_tx
                .send(RpcReply::Json(RpcResponse::success(serde_json::json!({}))));

            let capabilities = rx.blocking_recv().expect("capabilities request");
            assert_eq!(capabilities.request.command, "core:capabilities");
            let _ = capabilities
                .reply_tx
                .send(RpcReply::Json(RpcResponse::success(
                    serde_json::json!({"features": []}),
                )));

            let lock = rx.blocking_recv().expect("lock request");
            assert_eq!(lock.request.command, "vault:lock");
            let _ = lock.reply_tx.send(RpcReply::Json(RpcResponse::Error {
                ok: false,
                error: "remote lock failed".to_string(),
                code: Some("INTERNAL".to_string()),
            }));
        });

        let unlock_response = adapter.handle(&RpcRequest::new(
            "vault:unlock",
            serde_json::json!({"password": "test"}),
        ));
        assert!(unlock_response.is_ok());
        assert!(adapter.is_unlocked());

        let lock_response = adapter.handle(&RpcRequest::new("vault:lock", serde_json::json!({})));
        worker.join().expect("worker join");

        assert!(!lock_response.is_ok());
        assert!(adapter.is_unlocked());
    }
}
