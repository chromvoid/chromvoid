//! Performance integration test for `catalog:upload`.
//!
//! This test self-skips by default because it is slow and machine-dependent.
//!
//! Run locally:
//!   `CHROMVOID_RUN_PERF_TESTS=1 CHROMVOID_TEST_FAST_KDF=1 cargo test -p chromvoid-core --test upload_performance -- --nocapture`
//!
//! Optional knobs:
//! - `CHROMVOID_PERF_UPLOAD_SIZE_MB` (default: 100)
//! - `CHROMVOID_PERF_UPLOAD_NODE_CHUNK_MB` (default: 4)  -> stored/encrypted chunk size in vault
//! - `CHROMVOID_PERF_UPLOAD_READ_CHUNK_MB` (default: 8)  -> how we feed data into `catalog:upload`
//! - `CHROMVOID_PERF_MIN_MBPS` (optional) -> if set, asserts total throughput >= this value

mod test_helpers;

use chromvoid_core::rpc::types::RpcRequest;
use chromvoid_core::rpc::{RpcInputStream, RpcReply};
use std::cmp::min;
use std::fs::File;
use std::io::{Read, Write};
use std::path::Path;
use std::time::{Duration, Instant};
use test_helpers::*;

const MB: u64 = 1024 * 1024;

fn env_u64(name: &str, default: u64) -> u64 {
    std::env::var(name)
        .ok()
        .and_then(|v| v.trim().parse::<u64>().ok())
        .unwrap_or(default)
}

fn format_duration_ms(d: Duration) -> u128 {
    d.as_millis()
}

fn write_deterministic_file(path: &Path, size_bytes: u64) {
    let f = File::create(path).expect("create input file");
    let mut w = std::io::BufWriter::new(f);

    // 1 MiB repeating pattern (fast, deterministic, no RNG dependence).
    let mut block = vec![0u8; MB as usize];
    for (i, b) in block.iter_mut().enumerate() {
        *b = (i as u8).wrapping_mul(31).wrapping_add(17);
    }

    let mut remaining = size_bytes;
    while remaining > 0 {
        let n = min(remaining, block.len() as u64) as usize;
        w.write_all(&block[..n]).expect("write input block");
        remaining = remaining.saturating_sub(n as u64);
    }

    w.flush().expect("flush input file");
}

#[test]
fn perf_upload_100mb() {
    if std::env::var("CHROMVOID_RUN_PERF_TESTS").ok().as_deref() != Some("1") {
        eprintln!("SKIP perf_upload_100mb: set CHROMVOID_RUN_PERF_TESTS=1 to run");
        return;
    }
    let size_mb = env_u64("CHROMVOID_PERF_UPLOAD_SIZE_MB", 100);
    let node_chunk_mb = env_u64("CHROMVOID_PERF_UPLOAD_NODE_CHUNK_MB", 4);
    let read_chunk_mb = env_u64("CHROMVOID_PERF_UPLOAD_READ_CHUNK_MB", 8);

    let total_bytes = size_mb.saturating_mul(MB);
    let node_chunk_size = (node_chunk_mb.saturating_mul(MB)) as u32;
    let read_chunk_size = read_chunk_mb.saturating_mul(MB) as usize;

    assert!(total_bytes > 0, "size must be > 0");
    assert!(node_chunk_size > 0, "node chunk size must be > 0");
    assert!(read_chunk_size > 0, "read chunk size must be > 0");

    let (mut router, temp_dir) = create_test_router();
    assert_rpc_ok(&unlock_vault(&mut router, "test"));

    // Prepare input file on disk (mirrors Tauri path-upload behavior).
    let input_path = temp_dir.path().join("perf-upload-input.bin");
    let gen_started = Instant::now();
    write_deterministic_file(&input_path, total_bytes);
    let gen_dt = gen_started.elapsed();

    // Create file node with desired vault chunk size.
    let prepare = router.handle(&RpcRequest::new(
        "catalog:prepareUpload",
        serde_json::json!({
            "name": "perf.bin",
            "size": total_bytes,
            "chunk_size": node_chunk_size,
        }),
    ));
    assert_rpc_ok(&prepare);
    let node_id = get_node_id(&prepare);

    let mut f = File::open(&input_path).expect("open input file");
    let mut buf = vec![0u8; read_chunk_size];

    let upload_started = Instant::now();
    let mut offset: u64 = 0;
    let mut calls: u64 = 0;
    while offset < total_bytes {
        let n = f.read(&mut buf).expect("read input file");
        if n == 0 {
            break;
        }

        let req = RpcRequest::new(
            "catalog:upload",
            serde_json::json!({
                "node_id": node_id,
                "size": n as u64,
                "offset": offset,
            }),
        );

        let bytes = buf[..n].to_vec();
        match router.handle_with_stream(&req, Some(RpcInputStream::from_bytes(bytes))) {
            RpcReply::Json(r) => assert_rpc_ok(&r),
            RpcReply::Stream(_) => panic!("catalog:upload must return JSON response"),
        }

        offset = offset.saturating_add(n as u64);
        calls = calls.saturating_add(1);
    }
    assert_eq!(
        offset, total_bytes,
        "upload loop ended early: sent {} bytes, expected {}",
        offset, total_bytes
    );

    let upload_dt = upload_started.elapsed();
    let save_started = Instant::now();
    router.save().expect("router.save() must succeed");
    let save_dt = save_started.elapsed();
    let total_dt = upload_dt + save_dt;

    let mb = total_bytes as f64 / (MB as f64);
    let mbps_upload = mb / upload_dt.as_secs_f64();
    let mbps_total = mb / total_dt.as_secs_f64();

    eprintln!(
        "[perf][upload] size={}MB node_chunk={}MB read_chunk={}MB calls={} gen_ms={} upload_ms={} save_ms={} total_ms={} upload_mbps={:.2} total_mbps={:.2}",
        size_mb,
        node_chunk_mb,
        read_chunk_mb,
        calls,
        format_duration_ms(gen_dt),
        format_duration_ms(upload_dt),
        format_duration_ms(save_dt),
        format_duration_ms(total_dt),
        mbps_upload,
        mbps_total,
    );

    if let Ok(v) = std::env::var("CHROMVOID_PERF_MIN_MBPS") {
        if let Ok(min_mbps) = v.trim().parse::<f64>() {
            assert!(
                mbps_total >= min_mbps,
                "throughput regression: total_mbps={:.2} < min_mbps={:.2}",
                mbps_total,
                min_mbps
            );
        }
    }
}
