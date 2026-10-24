use super::*;
use chromvoid_network_runtime::host_streams::*;
use chromvoid_network_runtime::remote_io::{RemoteIoFailure, recv_decrypted_frame_typed};
use chromvoid_network_runtime::rpc_transport_protocol::{
    RemoteStreamControl, TransportPolicy, parse_stream_control_frame,
};
use chromvoid_protocol::{FrameType, TransportType};
use std::collections::{HashMap, VecDeque};

use crate::session::peer_wire_fixture::connection;

#[tokio::test]
async fn native_readers_roundtrip_full_and_range_streams_over_shared_encrypted_wire() {
    let root = TempDir::new().unwrap();
    let expected: Vec<u8> = (0..150_013).map(|n| (n % 251) as u8).collect();
    let (runtime, peer, node) = source(&root, &expected).await;
    let metadata = runtime
        .execute(
            2,
            1,
            RpcRequest::new("catalog:source:metadata", json!({"node_id":node})),
        )
        .await
        .unwrap();
    let revision = metadata.result().unwrap()["source_revision"]
        .as_u64()
        .unwrap();
    let (mut host, mut host_noise, mut client, mut client_noise) = connection().await;
    let mut streams = HashMap::new();
    let mut order = VecDeque::new();
    let policy = TransportPolicy::for_transport(TransportType::WssRelay);
    for id in [1, 2] {
        let req = if id == 1 {
            download(node)
        } else {
            RpcRequest::new(
                "catalog:downloadRange",
                json!({"node_id":node,"offset":4093,"length":81_997,"expected_source_revision":revision}),
            )
        };
        let command = req.command.clone();
        let work = peer.admit_download(id, req).unwrap();
        let publication = work.publication().unwrap();
        let mut published = publication.transport(&mut host);
        let (meta, reader) = match runtime.execute_admitted_download(work).await.unwrap() {
            PeerStreamReply::Stream(output) => {
                (frame_stream_meta_response(id, &output.meta), output.reader)
            }
            PeerStreamReply::RangeStream(output) => (
                frame_range_stream_meta_response(id, &output.meta),
                output.reader,
            ),
            PeerStreamReply::Json(response) => panic!("stream expected: {response:?}"),
        };
        start_host_outgoing_stream(
            &mut published,
            &mut host_noise,
            id,
            "synthetic-peer",
            &command,
            true,
            meta,
            reader,
            &mut streams,
            &mut order,
        )
        .await
        .unwrap();
        let meta = recv_decrypted_frame_typed(&mut client, &mut client_noise)
            .await
            .unwrap();
        assert_eq!(meta.frame_type, FrameType::RpcResponse);
        assert_eq!(meta.message_id, id);
        assert!(meta.has_continuation());
        let metadata: serde_json::Value = serde_json::from_slice(&meta.payload).unwrap();
        assert_eq!(metadata["name"], "stream.dat");
        if id == 1 {
            assert_eq!(metadata["size"], expected.len());
        } else {
            assert_eq!(metadata["range_offset"], 4093);
            assert_eq!(metadata["range_length"], 81_997);
        }
        let mut bytes = Vec::new();
        loop {
            assert!(
                send_next_host_outgoing_stream_chunk(
                    &mut published,
                    &mut host_noise,
                    policy,
                    &mut streams,
                    &mut order
                )
                .await
                .unwrap()
            );
            let frame = recv_decrypted_frame_typed(&mut client, &mut client_noise)
                .await
                .unwrap();
            assert_eq!(frame.frame_type, FrameType::RpcResponse);
            assert_eq!(frame.message_id, id);
            assert!(frame.payload.len() <= policy.stream_chunk_size);
            if !frame.has_continuation() {
                assert!(frame.payload.is_empty());
                break;
            }
            bytes.extend(frame.payload);
        }
        assert_eq!(
            bytes,
            if id == 1 {
                expected.as_slice()
            } else {
                &expected[4093..86_090]
            }
        );
        assert!(streams.is_empty());
        assert!(order.is_empty());
    }
}

#[tokio::test]
async fn native_revoke_stops_shared_stream_output_for_modern_and_legacy_peers() {
    for negotiated in [true, false] {
        let root = TempDir::new().unwrap();
        let (runtime, peer, node) = source(&root, &[17; 150_013]).await;
        let stream = full(&runtime, &peer, 1, node).await;
        let (mut host, mut host_noise, mut client, mut client_noise) = connection().await;
        let mut streams = HashMap::new();
        let mut order = VecDeque::new();
        let policy = TransportPolicy::for_transport(TransportType::WssRelay);
        start_host_outgoing_stream(
            &mut host,
            &mut host_noise,
            1,
            "synthetic-peer",
            "catalog:download",
            negotiated,
            frame_stream_meta_response(1, &stream.meta),
            stream.reader,
            &mut streams,
            &mut order,
        )
        .await
        .unwrap();
        let _meta = recv_decrypted_frame_typed(&mut client, &mut client_noise)
            .await
            .unwrap();
        send_next_host_outgoing_stream_chunk(
            &mut host,
            &mut host_noise,
            policy,
            &mut streams,
            &mut order,
        )
        .await
        .unwrap();
        let first = recv_decrypted_frame_typed(&mut client, &mut client_noise)
            .await
            .unwrap();
        assert!(!first.payload.is_empty());
        peer.cancel(1).unwrap();
        let result = send_next_host_outgoing_stream_chunk(
            &mut host,
            &mut host_noise,
            policy,
            &mut streams,
            &mut order,
        )
        .await;
        if negotiated {
            assert!(result.unwrap());
            let failure = recv_decrypted_frame_typed(&mut client, &mut client_noise)
                .await
                .unwrap();
            assert!(matches!(
                parse_stream_control_frame(&failure),
                Some(RemoteStreamControl::ReadFailed { .. })
            ));
            assert!(streams.is_empty());
            assert!(order.is_empty());
        } else {
            assert!(matches!(
                result,
                Err(RemoteIoFailure::StreamReadFailed { .. })
            ));
            assert!(
                client.rx.try_recv().is_err(),
                "revoked bytes must not reach legacy peer"
            );
        }
    }
}

#[path = "peer_publication_tests.rs"]
mod publication;
