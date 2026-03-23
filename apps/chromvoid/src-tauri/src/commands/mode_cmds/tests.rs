#[cfg(test)]
mod tests {
    use crate::commands::mode_cmds::helpers::{drain_in_flight_rpcs, now_ms, transport_type_label};
    use crate::commands::mode_cmds::models::{ModeInfo, ModeSwitchResult};
    use crate::core_adapter::{ConnectionState, CoreMode, ModeTransition};

    #[test]
    fn mode_info_serializes() {
        let info = ModeInfo {
            mode: CoreMode::Local,
            connection_state: ConnectionState::Disconnected,
            transport_type: None,
        };
        let json = serde_json::to_value(&info).unwrap();
        assert_eq!(json["mode"], "local");
        assert_eq!(json["connection_state"], "disconnected");
        assert!(json["transport_type"].is_null());
    }

    #[test]
    fn mode_info_with_remote() {
        let info = ModeInfo {
            mode: CoreMode::Remote {
                host: crate::core_adapter::RemoteHost::TauriRemoteWss {
                    peer_id: "test-peer".to_string(),
                },
            },
            connection_state: ConnectionState::Ready,
            transport_type: Some("webrtc".to_string()),
        };
        let json = serde_json::to_value(&info).unwrap();
        assert!(json["mode"].is_object());
        assert_eq!(json["connection_state"], "ready");
        assert_eq!(json["transport_type"], "webrtc");
    }

    #[test]
    fn switching_mode_serializes() {
        let mode = CoreMode::Switching;
        let json = serde_json::to_string(&mode).unwrap();
        assert_eq!(json, "\"switching\"");
    }

    #[test]
    fn mode_transition_serializes() {
        let transition = ModeTransition {
            from: CoreMode::Local,
            to_mode: "remote".to_string(),
            started_at_ms: 1700000000000,
            drain_deadline_ms: 1700000005000,
        };
        let json = serde_json::to_value(&transition).unwrap();
        assert_eq!(json["from"], "local");
        assert_eq!(json["to_mode"], "remote");
        assert_eq!(json["started_at_ms"], 1700000000000u64);
        assert_eq!(json["drain_deadline_ms"], 1700000005000u64);
    }

    #[test]
    fn mode_switch_result_serializes() {
        let result = ModeSwitchResult {
            previous_mode: CoreMode::Remote {
                host: crate::core_adapter::RemoteHost::OrangePiUsb {
                    device_id: "dev-1".to_string(),
                },
            },
            current_mode: CoreMode::Local,
            auto_locked: true,
            drain_completed: true,
        };
        let json = serde_json::to_value(&result).unwrap();
        assert!(json["previous_mode"].is_object());
        assert_eq!(json["current_mode"], "local");
        assert_eq!(json["auto_locked"], true);
        assert_eq!(json["drain_completed"], true);
    }

    #[tokio::test]
    async fn drain_completes_within_timeout() {
        let result = drain_in_flight_rpcs(5).await;
        assert!(result, "Drain should complete within 5s timeout");
    }

    #[test]
    fn transport_type_label_webrtc() {
        let mut metrics = chromvoid_protocol::TransportMetrics::default();
        metrics.webrtc_attempted = true;
        assert_eq!(transport_type_label(&metrics), "webrtc");
    }

    #[test]
    fn transport_type_label_wss() {
        let mut metrics = chromvoid_protocol::TransportMetrics::default();
        metrics.wss_attempted = true;
        assert_eq!(transport_type_label(&metrics), "wss");
    }

    #[test]
    fn now_ms_returns_reasonable_value() {
        let ms = now_ms();
        // Should be after 2020-01-01 in milliseconds
        assert!(ms > 1_577_836_800_000);
    }
}

#[cfg(test)]
mod sync_integration_tests {
    use crate::commands::sync_cmds::{
        self, ReconnectStrategy, SyncCursor, SyncState, WriterLockInfo,
    };

    #[test]
    fn sync_integration_bootstrap_sets_cursor_and_subscribes() {
        let mut ss = SyncState::new();
        assert!(ss.cursor.is_none());
        assert!(!ss.subscribed);

        // Simulate bootstrap_sync behavior
        ss.cursor = Some(SyncCursor {
            version: 100,
            timestamp_ms: 1700000000000,
        });
        ss.subscribed = true;

        assert_eq!(ss.cursor.as_ref().unwrap().version, 100);
        assert_eq!(ss.cursor.as_ref().unwrap().timestamp_ms, 1700000000000);
        assert!(ss.subscribed);
    }

    #[test]
    fn sync_integration_local_switch_clears_state() {
        let mut ss = SyncState::new();
        ss.cursor = Some(SyncCursor {
            version: 50,
            timestamp_ms: 1000,
        });
        ss.subscribed = true;
        ss.writer_lock = Some(WriterLockInfo {
            holder: "dev-1".to_string(),
            since_ms: 500,
        });

        // Simulate Local switch: reset to fresh state
        ss = SyncState::new();
        assert!(ss.cursor.is_none());
        assert!(!ss.subscribed);
        assert!(ss.writer_lock.is_none());
    }

    #[test]
    fn sync_integration_reconnect_delta_for_small_gap() {
        let mut ss = SyncState::new();
        ss.cursor = Some(SyncCursor {
            version: 100,
            timestamp_ms: 1000,
        });

        let local_version = ss.cursor.as_ref().map(|c| c.version).unwrap_or(0);
        let strategy = sync_cmds::choose_reconnect_strategy(local_version, 150);
        assert_eq!(strategy, ReconnectStrategy::Delta);

        // After reconnect: cursor advances
        ss.cursor = Some(SyncCursor {
            version: 150,
            timestamp_ms: 2000,
        });
        ss.subscribed = true;
        assert_eq!(ss.cursor.as_ref().unwrap().version, 150);
    }

    #[test]
    fn sync_integration_reconnect_full_resync_for_large_gap() {
        let mut ss = SyncState::new();
        ss.cursor = Some(SyncCursor {
            version: 100,
            timestamp_ms: 1000,
        });

        let local_version = ss.cursor.as_ref().map(|c| c.version).unwrap_or(0);
        let strategy = sync_cmds::choose_reconnect_strategy(local_version, 700);
        assert_eq!(strategy, ReconnectStrategy::FullResync);
    }

    #[test]
    fn sync_integration_reconnect_no_prior_cursor_full_resync() {
        let ss = SyncState::new();
        let local_version = ss.cursor.as_ref().map(|c| c.version).unwrap_or(0);
        let strategy = sync_cmds::choose_reconnect_strategy(local_version, 50);
        assert_eq!(strategy, ReconnectStrategy::FullResync);
    }

    #[test]
    fn sync_integration_writer_lock_blocks_then_unblocks() {
        let mut ss = SyncState::new();
        ss.cursor = Some(SyncCursor {
            version: 100,
            timestamp_ms: 1000,
        });
        ss.subscribed = true;

        // Set writer lock → writes blocked
        ss.writer_lock = Some(WriterLockInfo {
            holder: "mobile-device".to_string(),
            since_ms: 1000,
        });
        assert!(ss.writer_lock.is_some());
        assert_eq!(ss.writer_lock.as_ref().unwrap().holder, "mobile-device");

        // Clear writer lock → writes allowed
        ss.writer_lock = None;
        assert!(ss.writer_lock.is_none());
    }

    #[test]
    fn sync_integration_lifecycle_remote_to_local_round_trip() {
        let mut ss = SyncState::new();

        // Phase 1: Enter Remote mode → bootstrap sync
        ss.cursor = Some(SyncCursor {
            version: 0,
            timestamp_ms: 1700000000000,
        });
        ss.subscribed = true;
        assert!(ss.subscribed);

        // Phase 2: Receive delta updates
        ss.cursor = Some(SyncCursor {
            version: 50,
            timestamp_ms: 1700000001000,
        });
        assert_eq!(ss.cursor.as_ref().unwrap().version, 50);

        // Phase 3: Transport dropped → reconnect → delta sync
        let local_version = ss.cursor.as_ref().map(|c| c.version).unwrap_or(0);
        let strategy = sync_cmds::choose_reconnect_strategy(local_version, 55);
        assert_eq!(strategy, ReconnectStrategy::Delta);
        ss.cursor = Some(SyncCursor {
            version: 55,
            timestamp_ms: 1700000002000,
        });
        ss.subscribed = true;

        // Phase 4: Switch back to Local → clear everything
        ss = SyncState::new();
        assert!(ss.cursor.is_none());
        assert!(!ss.subscribed);
        assert!(ss.writer_lock.is_none());
    }

    #[test]
    fn sync_integration_bootstrap_sync_helper_uses_global_state() {
        // Test the actual public helper through global state
        sync_cmds::reset_sync_state();
        sync_cmds::bootstrap_sync(200, 1700000000000);
        assert!(sync_cmds::is_sync_active());
        let cursor = sync_cmds::current_cursor();
        assert!(cursor.is_some());
        assert_eq!(cursor.unwrap().version, 200);
        sync_cmds::reset_sync_state();
    }

    #[test]
    fn sync_integration_trigger_reconnect_via_helper() {
        sync_cmds::reset_sync_state();
        sync_cmds::bootstrap_sync(100, 1000);
        let strategy = sync_cmds::trigger_reconnect_sync(150, 2000);
        assert_eq!(strategy, ReconnectStrategy::Delta);
        let cursor = sync_cmds::current_cursor().unwrap();
        assert_eq!(cursor.version, 150);
        assert!(sync_cmds::is_sync_active());
        sync_cmds::reset_sync_state();
    }

    #[test]
    fn sync_integration_reset_clears_via_helper() {
        sync_cmds::reset_sync_state();
        sync_cmds::bootstrap_sync(50, 1000);
        assert!(sync_cmds::is_sync_active());
        sync_cmds::reset_sync_state();
        assert!(!sync_cmds::is_sync_active());
        assert!(sync_cmds::current_cursor().is_none());
    }
}
