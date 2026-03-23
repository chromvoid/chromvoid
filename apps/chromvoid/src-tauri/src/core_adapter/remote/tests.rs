#[cfg(test)]
mod tests {
    use crate::core_adapter::remote::RemoteCoreAdapter;
    use crate::core_adapter::types::{ConnectionState, CoreAdapter, CoreMode, RemoteHost};
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
}
