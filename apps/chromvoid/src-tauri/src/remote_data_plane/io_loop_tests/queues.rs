use super::support::*;
use super::*;

#[test]
fn request_queues_pop_media_between_high_and_normal() {
    let mut queues = RequestQueues::default();

    queues.push(queued_request("low", RemoteRpcPriority::Low));
    queues.push(queued_request("normal", RemoteRpcPriority::Normal));
    queues.push(queued_request("media", RemoteRpcPriority::Media));
    queues.push(queued_request("high", RemoteRpcPriority::High));

    assert_eq!(queues.pop_next(false).unwrap().request.command, "high");
    assert_eq!(queues.pop_next(false).unwrap().request.command, "media");
    assert_eq!(queues.pop_next(false).unwrap().request.command, "normal");
    assert_eq!(queues.pop_next(false).unwrap().request.command, "low");
}

#[test]
fn request_queues_skip_media_keeps_draining_other_priorities() {
    let mut queues = RequestQueues::default();

    queues.push(queued_request("media", RemoteRpcPriority::Media));
    queues.push(queued_request("high", RemoteRpcPriority::High));
    queues.push(queued_request("normal", RemoteRpcPriority::Normal));
    queues.push(queued_request("low", RemoteRpcPriority::Low));

    assert_eq!(queues.pop_next(true).unwrap().request.command, "high");
    assert_eq!(queues.pop_next(true).unwrap().request.command, "normal");
    assert_eq!(queues.pop_next(true).unwrap().request.command, "low");
    assert!(queues.pop_next(true).is_none(), "media queue is skipped");

    assert_eq!(
        queues.pop_next(false).unwrap().request.command,
        "media",
        "deferred media request is still queued"
    );
}

#[test]
fn media_range_in_flight_counts_pending_and_active_range_requests() {
    let mut pending_json = HashMap::new();
    let active_streams = HashMap::new();
    assert_eq!(
        media_range_requests_in_flight(&pending_json, &active_streams),
        0
    );

    let (normal_tx, _normal_rx) = oneshot::channel();
    pending_json.insert(
        1,
        PendingJson {
            reply_tx: normal_tx,
            deadline: tokio::time::Instant::now() + Duration::from_secs(1),
            started_at: tokio::time::Instant::now(),
            command: "vault:status".to_string(),
        },
    );
    assert_eq!(
        media_range_requests_in_flight(&pending_json, &active_streams),
        0,
        "non-range commands must not count"
    );

    let (media_tx, _media_rx) = oneshot::channel();
    pending_json.insert(
        2,
        PendingJson {
            reply_tx: media_tx,
            deadline: tokio::time::Instant::now() + Duration::from_secs(1),
            started_at: tokio::time::Instant::now(),
            command: MEDIA_RANGE_COMMAND.to_string(),
        },
    );
    let (second_media_tx, _second_media_rx) = oneshot::channel();
    pending_json.insert(
        3,
        PendingJson {
            reply_tx: second_media_tx,
            deadline: tokio::time::Instant::now() + Duration::from_secs(1),
            started_at: tokio::time::Instant::now(),
            command: MEDIA_RANGE_COMMAND.to_string(),
        },
    );

    assert_eq!(
        media_range_requests_in_flight(&pending_json, &active_streams),
        2
    );
    assert!(
        media_range_requests_in_flight(&pending_json, &active_streams)
            >= MAX_MEDIA_RANGE_REQUESTS_IN_FLIGHT
    );
}

#[test]
fn wallet_balance_uses_a_long_running_json_deadline() {
    let default_timeout = Duration::from_secs(15);

    assert_eq!(
        json_response_timeout(WALLET_BALANCE_COMMAND, default_timeout),
        WALLET_PROVIDER_RESPONSE_TIMEOUT
    );
    assert_eq!(
        json_response_timeout(WALLET_HISTORY_COMMAND, default_timeout),
        WALLET_PROVIDER_RESPONSE_TIMEOUT
    );
    assert_eq!(
        json_response_timeout("wallet:status", default_timeout),
        default_timeout
    );
    assert_eq!(
        json_response_timeout(WALLET_BALANCE_COMMAND, Duration::from_secs(90)),
        Duration::from_secs(90),
        "a caller-provided longer deadline must be preserved"
    );
}

#[test]
fn derivative_ensure_requests_stream_control_for_its_response() {
    assert!(request_needs_stream_control_hint(
        DERIVATIVE_ENSURE_COMMAND,
        false
    ));
}

#[test]
fn derivative_ensure_uses_a_long_running_response_meta_deadline() {
    assert_eq!(
        json_response_timeout(DERIVATIVE_ENSURE_COMMAND, Duration::from_secs(15)),
        DERIVATIVE_ENSURE_RESPONSE_META_TIMEOUT
    );
    assert_eq!(
        json_response_timeout(DERIVATIVE_ENSURE_COMMAND, Duration::from_secs(90)),
        Duration::from_secs(90),
        "a caller-provided longer deadline must be preserved"
    );
}

#[test]
fn timed_out_derivative_ensure_cancels_only_for_stream_control_peers() {
    let peer_features = crate::remote_data_plane::RemotePeerFeatures::new();
    assert!(!timed_out_request_needs_stream_cancel(
        DERIVATIVE_ENSURE_COMMAND,
        &peer_features,
    ));

    peer_features.replace(vec![CORE_FEATURE_REMOTE_STREAM_CONTROL_V1.to_string()]);
    assert!(timed_out_request_needs_stream_cancel(
        DERIVATIVE_ENSURE_COMMAND,
        &peer_features,
    ));
    assert!(!timed_out_request_needs_stream_cancel(
        "catalog:list",
        &peer_features,
    ));
}
