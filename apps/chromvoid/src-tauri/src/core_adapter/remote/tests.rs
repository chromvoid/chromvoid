#[cfg(test)]
mod tests {
    use crate::core_adapter::remote::RemoteCoreAdapter;
    use crate::core_adapter::types::{
        ConnectionState, CoreAdapter, CoreMode, DeferredReply, RemoteHost, RemoteRpcPriority,
    };
    use chromvoid_core::rpc::types::{RpcRequest, RpcResponse};
    use chromvoid_core::rpc::RpcReply;
    use chromvoid_protocol::{TransportMetrics, TransportType};
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
    fn from_remote_sender_can_store_transport_metrics() {
        let (tx, _rx) = mpsc::channel::<crate::remote_data_plane::RemoteIoRequest>(1);
        let host = RemoteHost::MobileUsb {
            host_id: "host-1".to_string(),
            label: Some("Pixel".to_string()),
            platform: "android".to_string(),
        };
        let adapter = RemoteCoreAdapter::from_remote_sender_with_metrics(
            host,
            tx,
            Some(TransportMetrics {
                transport_type: Some(TransportType::UsbMobile),
                ..TransportMetrics::default()
            }),
        );

        assert_eq!(
            adapter
                .transport_metrics()
                .and_then(|metrics| metrics.transport_type),
            Some(TransportType::UsbMobile)
        );
    }

    #[test]
    fn from_remote_sender_can_store_transport_session_generation() {
        let (tx, _rx) = mpsc::channel::<crate::remote_data_plane::RemoteIoRequest>(1);
        let host = RemoteHost::MobileUsb {
            host_id: "host-1".to_string(),
            label: Some("Pixel".to_string()),
            platform: "android".to_string(),
        };
        let adapter = RemoteCoreAdapter::from_remote_sender_with_metrics_and_generation(
            host,
            tx,
            None,
            Some(42),
        );

        assert_eq!(adapter.transport_session_generation(), Some(42));
    }

    #[test]
    fn mobile_usb_remote_requires_session_approval_until_confirmed() {
        let (tx, _rx) = mpsc::channel::<crate::remote_data_plane::RemoteIoRequest>(1);
        let host = RemoteHost::MobileUsb {
            host_id: "host-1".to_string(),
            label: Some("Pixel".to_string()),
            platform: "android".to_string(),
        };
        let mut adapter = RemoteCoreAdapter::from_remote_sender(host, tx);

        assert!(adapter.mobile_usb_session_requires_approval());

        adapter.mark_mobile_usb_session_approved();

        assert!(!adapter.mobile_usb_session_requires_approval());
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
    fn media_range_download_is_sent_with_media_remote_priority() {
        let (tx, mut rx) = mpsc::channel::<crate::remote_data_plane::RemoteIoRequest>(1);
        let host = RemoteHost::TauriRemoteWss {
            peer_id: "test-peer".to_string(),
        };
        let mut adapter = RemoteCoreAdapter::from_remote_sender(host, tx);

        let worker = std::thread::spawn(move || {
            let request = rx.blocking_recv().expect("range request");
            assert_eq!(request.request.command, "catalog:downloadRange");
            assert_eq!(request.priority, RemoteRpcPriority::Media);
            let _ = request
                .reply_tx
                .send(RpcReply::Json(RpcResponse::success(serde_json::json!({}))));
        });

        let reply = adapter.handle_with_stream(
            &RpcRequest::new(
                "catalog:downloadRange",
                serde_json::json!({
                    "node_id": 1,
                    "offset": 0,
                    "length": 1,
                    "expected_source_revision": 1,
                }),
            ),
            None,
        );
        worker.join().expect("worker join");

        assert!(matches!(reply, RpcReply::Json(response) if response.is_ok()));
    }

    #[test]
    fn begin_with_stream_lets_second_rpc_proceed_while_media_reply_pending() {
        let (tx, mut rx) = mpsc::channel::<crate::remote_data_plane::RemoteIoRequest>(4);
        let host = RemoteHost::TauriRemoteWss {
            peer_id: "test-peer".to_string(),
        };
        let mut adapter = RemoteCoreAdapter::from_remote_sender(host, tx);

        // Phase 1: enqueue the media read. This must return without any reply
        // having been produced.
        let deferred = adapter.begin_with_stream(
            &RpcRequest::new(
                "catalog:downloadRange",
                serde_json::json!({
                    "node_id": 1,
                    "offset": 0,
                    "length": 1,
                    "expected_source_revision": 1,
                }),
            ),
            None,
        );
        assert!(matches!(deferred, DeferredReply::Pending(_)));

        // The media request is already in the io queue, its reply withheld.
        let media_request = rx.blocking_recv().expect("media io request");
        assert_eq!(media_request.request.command, "catalog:downloadRange");
        assert_eq!(media_request.priority, RemoteRpcPriority::Media);

        // Phase 2: a second RPC on the same adapter completes while the media
        // reply is still outstanding, then the media reply is delivered.
        let worker = std::thread::spawn(move || {
            let second = rx.blocking_recv().expect("second io request");
            assert_eq!(second.request.command, "catalog:list");
            let _ = second
                .reply_tx
                .send(RpcReply::Json(RpcResponse::success(serde_json::json!({}))));

            let _ = media_request
                .reply_tx
                .send(RpcReply::Json(RpcResponse::success(serde_json::json!({}))));
        });

        let second_response =
            adapter.handle(&RpcRequest::new("catalog:list", serde_json::json!({})));
        assert!(second_response.is_ok());

        let media_reply = deferred.wait();
        worker.join().expect("worker join");

        assert!(matches!(media_reply, RpcReply::Json(response) if response.is_ok()));
    }

    #[test]
    fn begin_with_stream_keeps_vault_commands_synchronous() {
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
        });

        let deferred = adapter.begin_with_stream(
            &RpcRequest::new("vault:unlock", serde_json::json!({"password": "test"})),
            None,
        );
        worker.join().expect("worker join");

        assert!(matches!(deferred, DeferredReply::Immediate(_)));
        assert!(
            adapter.is_unlocked(),
            "state transition must be applied on the synchronous path"
        );
    }

    #[test]
    fn deferred_reply_wait_maps_closed_channel_to_disconnected() {
        let (reply_tx, reply_rx) = tokio::sync::oneshot::channel::<RpcReply>();
        drop(reply_tx);

        let reply = DeferredReply::Pending(reply_rx).wait();

        match reply {
            RpcReply::Json(RpcResponse::Error { code, .. }) => {
                assert_eq!(code.as_deref(), Some("DISCONNECTED"));
            }
            _ => panic!("expected DISCONNECTED error reply"),
        }
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

    #[test]
    fn vault_status_updates_remote_adapter_unlock_state() {
        let (tx, mut rx) = mpsc::channel::<crate::remote_data_plane::RemoteIoRequest>(2);
        let host = RemoteHost::TauriRemoteWss {
            peer_id: "test-peer".to_string(),
        };
        let mut adapter = RemoteCoreAdapter::from_remote_sender(host, tx);

        let worker = std::thread::spawn(move || {
            let unlocked = rx.blocking_recv().expect("unlocked status request");
            assert_eq!(unlocked.request.command, "vault:status");
            let _ = unlocked.reply_tx.send(RpcReply::Json(RpcResponse::success(
                serde_json::json!({"is_unlocked": true, "session_started_at": 1}),
            )));

            let locked = rx.blocking_recv().expect("locked status request");
            assert_eq!(locked.request.command, "vault:status");
            let _ = locked.reply_tx.send(RpcReply::Json(RpcResponse::success(
                serde_json::json!({"is_unlocked": false, "session_started_at": null}),
            )));
        });

        let unlocked_response =
            adapter.handle(&RpcRequest::new("vault:status", serde_json::json!({})));
        assert!(unlocked_response.is_ok());
        assert!(adapter.is_unlocked());

        let locked_response =
            adapter.handle(&RpcRequest::new("vault:status", serde_json::json!({})));
        worker.join().expect("worker join");

        assert!(locked_response.is_ok());
        assert!(!adapter.is_unlocked());
    }
}
