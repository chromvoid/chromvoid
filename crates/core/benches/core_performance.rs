use std::io::Read;
use std::sync::Arc;

use chromvoid_core::crypto::keystore::InMemoryKeystore;
use chromvoid_core::rpc::types::{RpcRequest, RpcResponse};
use chromvoid_core::rpc::{RpcInputStream, RpcReply, RpcRouter};
use chromvoid_core::storage::Storage;
use criterion::{black_box, criterion_group, criterion_main, Criterion};
use tempfile::TempDir;

fn create_router() -> (RpcRouter, TempDir) {
    let temp_dir = TempDir::new().expect("create temp dir");
    let storage = Storage::new(temp_dir.path()).expect("create storage");
    let mut router = RpcRouter::new(storage).with_keystore(Arc::new(InMemoryKeystore::new()));
    assert_ok(&router.handle(&RpcRequest::new(
        "vault:unlock",
        serde_json::json!({"password": "bench"}),
    )));
    (router, temp_dir)
}

fn assert_ok(response: &RpcResponse) {
    assert!(
        response.is_ok(),
        "expected RPC success, got {:?}",
        response.error_message()
    );
}

fn node_id(response: &RpcResponse) -> u64 {
    response
        .result()
        .and_then(|result| result.get("node_id"))
        .and_then(|value| value.as_u64())
        .expect("node_id")
}

fn entry_id(response: &RpcResponse) -> String {
    response
        .result()
        .and_then(|result| result.get("entry_id"))
        .and_then(|value| value.as_str())
        .expect("entry_id")
        .to_string()
}

fn deterministic_bytes(size: usize) -> Vec<u8> {
    (0..size)
        .map(|index| (index as u8).wrapping_mul(31).wrapping_add(17))
        .collect()
}

fn upload_file(router: &mut RpcRouter, name: &str, bytes: Vec<u8>, chunk_size: u32) -> u64 {
    let reply = router.handle_with_stream(
        &RpcRequest::new(
            "catalog:upload",
            serde_json::json!({
                "parent_path": "/",
                "name": name,
                "total_size": bytes.len(),
                "size": bytes.len(),
                "offset": 0,
                "mime_type": "application/octet-stream",
                "chunk_size": chunk_size,
            }),
        ),
        Some(RpcInputStream::from_bytes(bytes)),
    );
    match reply {
        RpcReply::Json(response) => {
            assert_ok(&response);
            node_id(&response)
        }
        RpcReply::Stream(_) | RpcReply::RangeStream(_) => {
            panic!("catalog:upload must return JSON")
        }
    }
}

fn source_revision(router: &mut RpcRouter, node_id: u64) -> u64 {
    let response = router.handle(&RpcRequest::new(
        "catalog:source:metadata",
        serde_json::json!({"node_id": node_id}),
    ));
    assert_ok(&response);
    response
        .result()
        .and_then(|result| result.get("source_revision"))
        .and_then(|value| value.as_u64())
        .expect("source_revision")
}

fn read_range(router: &mut RpcRouter, node_id: u64, source_revision: u64) -> usize {
    let reply = router.handle_with_stream(
        &RpcRequest::new(
            "catalog:downloadRange",
            serde_json::json!({
                "node_id": node_id,
                "offset": 1024,
                "length": 2048,
                "expected_source_revision": source_revision,
            }),
        ),
        None,
    );
    match reply {
        RpcReply::RangeStream(output) => {
            let mut reader = output.reader;
            let mut bytes = Vec::new();
            reader.read_to_end(&mut bytes).expect("read range");
            bytes.len()
        }
        RpcReply::Json(response) => panic!("downloadRange returned JSON: {response:?}"),
        RpcReply::Stream(_) => panic!("downloadRange returned full stream"),
    }
}

fn write_derivative(router: &mut RpcRouter, node_id: u64, source_revision: u64, bytes: Vec<u8>) {
    let reply = router.handle_with_stream(
        &RpcRequest::new(
            "catalog:derivative:write",
            serde_json::json!({
                "node_id": node_id,
                "source_version": source_revision,
                "tier": "preview",
                "version": 1,
                "size": bytes.len(),
                "name": "bench-preview.bin",
                "mime_type": "application/octet-stream",
                "file_extension": "bin",
                "chunk_size": 4096,
            }),
        ),
        Some(RpcInputStream::from_bytes(bytes)),
    );
    match reply {
        RpcReply::Json(response) => assert_ok(&response),
        RpcReply::Stream(_) | RpcReply::RangeStream(_) => {
            panic!("catalog:derivative:write must return JSON")
        }
    }
}

fn read_derivative(router: &mut RpcRouter, node_id: u64, source_revision: u64) -> usize {
    let reply = router.handle_with_stream(
        &RpcRequest::new(
            "catalog:derivative:read",
            serde_json::json!({
                "node_id": node_id,
                "source_version": source_revision,
                "tier": "preview",
                "version": 1,
            }),
        ),
        None,
    );
    match reply {
        RpcReply::Stream(output) => {
            let mut reader = output.reader;
            let mut bytes = Vec::new();
            reader.read_to_end(&mut bytes).expect("read derivative");
            bytes.len()
        }
        RpcReply::Json(response) => panic!("derivative read returned JSON: {response:?}"),
        RpcReply::RangeStream(_) => panic!("derivative read returned range stream"),
    }
}

fn create_passmanager_entries(router: &mut RpcRouter, count: usize) {
    assert_ok(&router.handle(&RpcRequest::new(
        "passmanager:group:ensure",
        serde_json::json!({"path": "/bench"}),
    )));

    for index in 0..count {
        let response = router.handle(&RpcRequest::new(
            "passmanager:entry:save",
            serde_json::json!({
                "id": format!("bench-entry-{index}"),
                "title": format!("Bench Entry {index}"),
                "group_path": "/bench",
                "username": format!("user{index}@example.com"),
                "urls": [format!("https://service{index}.example.com/login")],
            }),
        ));
        assert_ok(&response);
        black_box(entry_id(&response));
    }
}

fn search_credentials(router: &mut RpcRouter) -> usize {
    let response = router.handle(&RpcRequest::new(
        "credential_provider:search",
        serde_json::json!({
            "query": "service",
            "context": {
                "kind": "web",
                "origin": "https://service25.example.com/login",
                "domain": "service25.example.com"
            }
        }),
    ));
    assert_ok(&response);
    response
        .result()
        .and_then(|result| result.get("candidates"))
        .and_then(|value| value.as_array())
        .map(Vec::len)
        .expect("candidates")
}

fn bench_download_range_cache_hit(c: &mut Criterion) {
    let (mut router, _temp_dir) = create_router();
    let node_id = upload_file(
        &mut router,
        "range-cache.bin",
        deterministic_bytes(256 * 1024),
        64 * 1024,
    );
    let revision = source_revision(&mut router, node_id);
    black_box(read_range(&mut router, node_id, revision));

    c.bench_function("download_range_cache_hit", |b| {
        b.iter(|| black_box(read_range(&mut router, node_id, revision)));
    });
}

fn bench_derivative_read_touch(c: &mut Criterion) {
    let (mut router, _temp_dir) = create_router();
    let node_id = upload_file(
        &mut router,
        "derivative-source.bin",
        deterministic_bytes(32 * 1024),
        16 * 1024,
    );
    let revision = source_revision(&mut router, node_id);
    write_derivative(
        &mut router,
        node_id,
        revision,
        deterministic_bytes(128 * 1024),
    );

    c.bench_function("derivative_read_touch", |b| {
        b.iter(|| black_box(read_derivative(&mut router, node_id, revision)));
    });
}

fn bench_credential_provider_search(c: &mut Criterion) {
    let (mut router, _temp_dir) = create_router();
    create_passmanager_entries(&mut router, 64);

    c.bench_function("credential_provider_search", |b| {
        b.iter(|| black_box(search_credentials(&mut router)));
    });
}

criterion_group!(
    benches,
    bench_download_range_cache_hit,
    bench_derivative_read_touch,
    bench_credential_provider_search
);
criterion_main!(benches);
