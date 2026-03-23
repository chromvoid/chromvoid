#![cfg(any(target_os = "linux", target_os = "macos"))]

//! Cross-backend regression test.
//!
//! Goal: catch inconsistencies and data corruption by exercising the same vault
//! through both backends:
//! - write via WebDAV → read via FUSE
//! - write via FUSE  → read via WebDAV

mod common;

use bytes::Bytes;
use chromvoid_lib::{start_fuse_server, start_webdav_server};
use common::{deterministic_bytes, sha256_hex, TestVault};
use http_body_util::{BodyExt as _, Full, StreamBody};
use hyper::client::conn::http1;
use hyper::{Request, StatusCode};
use hyper_util::rt::TokioIo;
use std::convert::Infallible;
use std::net::SocketAddr;
use std::time::Duration;
use tempfile::tempdir;
use tokio::net::TcpStream;

macro_rules! start_fuse_or_skip {
    ($test_name:expr, $mountpoint:expr, $staging_dir:expr, $adapter:expr, $context:expr) => {{
        match start_fuse_server($mountpoint, $staging_dir, $adapter).await {
            Ok(fuse) => fuse,
            Err(err) => {
                if common::skip_fuse_mount_error($test_name, &err) {
                    return;
                }
                panic!("{}: {}", $context, err);
            }
        }
    }};
}

async fn http_request(
    addr: SocketAddr,
    method: &str,
    path: &str,
    headers: Vec<(&'static str, String)>,
    body: Vec<u8>,
) -> (StatusCode, Bytes) {
    let stream = TcpStream::connect(addr).await.expect("tcp connect");
    let io = TokioIo::new(stream);
    let (mut sender, conn) = http1::handshake(io).await.expect("http1 handshake");
    tokio::spawn(async move {
        let _ = conn.await;
    });

    let uri = format!("http://{}{}", addr, path);
    let mut req = Request::builder().method(method).uri(uri);
    req = req.header("host", addr.to_string());
    for (k, v) in headers {
        req = req.header(k, v);
    }
    let req = req
        .body(Full::new(Bytes::from(body)))
        .expect("build request");

    let res = sender.send_request(req).await.expect("send request");
    let status = res.status();
    let body = res
        .into_body()
        .collect()
        .await
        .expect("read response body")
        .to_bytes();
    (status, body)
}

async fn http_put_streaming(addr: SocketAddr, path: &str, chunks: Vec<Vec<u8>>) -> StatusCode {
    use futures_util::stream;
    use hyper::body::Frame;

    let stream = TcpStream::connect(addr).await.expect("tcp connect");
    let io = TokioIo::new(stream);
    let (mut sender, conn) = http1::handshake(io).await.expect("http1 handshake");
    tokio::spawn(async move {
        let _ = conn.await;
    });

    let uri = format!("http://{}{}", addr, path);
    let mut req = Request::builder().method("PUT").uri(uri);
    req = req.header("host", addr.to_string());
    req = req.header("content-type", "application/octet-stream");

    let body_stream = stream::iter(
        chunks
            .into_iter()
            .map(|chunk| Ok::<Frame<Bytes>, Infallible>(Frame::data(Bytes::from(chunk)))),
    );
    let req = req
        .body(StreamBody::new(body_stream))
        .expect("build streaming PUT request");

    sender
        .send_request(req)
        .await
        .expect("send request")
        .status()
}

#[tokio::test]
async fn webdav_fuse_cross_backend_roundtrip() {
    if !common::require_fuse_driver("webdav_fuse_cross_backend_roundtrip") {
        return;
    }
    let _guard = common::acquire_fuse_test_guard("webdav_fuse_cross_backend_roundtrip");

    let app = tauri::test::mock_app();
    let handle = app.handle().clone();

    let vault = TestVault::new_unlocked();

    // --- Phase 1: write via WebDAV → read via FUSE ---
    let webdav = start_webdav_server(handle.clone(), vault.adapter.clone())
        .await
        .expect("start webdav");

    // Ensure /docs exists.
    let (st, _body) = http_request(webdav.addr, "MKCOL", "/docs", vec![], vec![]).await;
    assert!(st == StatusCode::CREATED || st == StatusCode::METHOD_NOT_ALLOWED);

    let w1 = deterministic_bytes(0xC001_0001, 2 * 1024 * 1024 + 7);
    let w1_hash = sha256_hex(&w1);
    let st = http_put_streaming(
        webdav.addr,
        "/docs/from-webdav.bin",
        w1.chunks(64 * 1024).map(|c| c.to_vec()).collect(),
    )
    .await;
    assert!(
        st == StatusCode::CREATED || st == StatusCode::NO_CONTENT,
        "PUT status={st}"
    );

    webdav.join().await;

    // Simulate core restart between backends.
    vault.restart_core_unlocked();

    let dir = tempdir().expect("tempdir");
    let mountpoint = dir.path().join("mnt");
    let staging_dir = dir.path().join("staging");

    let fuse = start_fuse_or_skip!(
        "webdav_fuse_cross_backend_roundtrip",
        mountpoint.clone(),
        staging_dir,
        vault.adapter.clone(),
        "start fuse"
    );
    tokio::time::sleep(Duration::from_millis(250)).await;

    let got = std::fs::read(mountpoint.join("docs/from-webdav.bin")).expect("read via fuse");
    assert_eq!(
        sha256_hex(&got),
        w1_hash,
        "FUSE read mismatch for WebDAV-written file"
    );

    // --- Phase 2: write via FUSE → read via WebDAV ---
    let w2 = deterministic_bytes(0xC002_0002, (8 * 1024 * 1024) + 123);
    let w2_hash = sha256_hex(&w2);
    std::fs::write(mountpoint.join("docs/from-fuse.bin"), &w2).expect("write via fuse");
    // Ensure data is flushed to core (FUSE maps fsync -> flush).
    let f = std::fs::OpenOptions::new()
        .read(true)
        .open(mountpoint.join("docs/from-fuse.bin"))
        .expect("open for sync");
    f.sync_all().expect("sync_all");

    tokio::time::timeout(Duration::from_secs(5), fuse.join())
        .await
        .expect("unmount timeout");

    // Simulate core restart before reading through the other backend.
    vault.restart_core_unlocked();

    let webdav = start_webdav_server(handle, vault.adapter.clone())
        .await
        .expect("start webdav #2");
    let (st, body) = http_request(webdav.addr, "GET", "/docs/from-fuse.bin", vec![], vec![]).await;
    assert_eq!(st, StatusCode::OK);
    assert_eq!(
        sha256_hex(body.as_ref()),
        w2_hash,
        "WebDAV read mismatch for FUSE-written file"
    );
    webdav.join().await;
}
