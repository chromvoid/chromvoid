//! Integration tests for WebDAV volume backend.
//!
//! These tests start the real in-process WebDAV server and exercise it via HTTP,
//! verifying both HTTP-level behavior and persistence through core RPC.

mod common;

use bytes::Bytes;
use chromvoid_lib::start_webdav_server;
use common::{
    catalog_download, catalog_find_child, catalog_list, deterministic_bytes, sha256_hex, TestVault,
};
use http_body_util::{BodyExt as _, Full, StreamBody};
use hyper::client::conn::http1;
use hyper::{Request, StatusCode};
use hyper_util::rt::TokioIo;
use std::convert::Infallible;
use std::net::SocketAddr;
use tokio::net::TcpStream;

async fn http_request(
    addr: SocketAddr,
    method: &str,
    path: &str,
    headers: Vec<(&'static str, String)>,
    body: Vec<u8>,
) -> (StatusCode, Bytes) {
    let stream = TcpStream::connect(addr)
        .await
        .expect("tcp connect to webdav");
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

async fn http_request_streaming(
    addr: SocketAddr,
    method: &str,
    path: &str,
    headers: Vec<(&'static str, String)>,
    chunks: Vec<Vec<u8>>,
) -> (StatusCode, Bytes) {
    use futures_util::stream;
    use hyper::body::Frame;

    let stream = TcpStream::connect(addr)
        .await
        .expect("tcp connect to webdav");
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

    let body_stream = stream::iter(
        chunks
            .into_iter()
            .map(|chunk| Ok::<Frame<Bytes>, Infallible>(Frame::data(Bytes::from(chunk)))),
    );

    let req = req
        .body(StreamBody::new(body_stream))
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

#[tokio::test]
async fn webdav_put_get_overwrite_and_range() {
    let app = tauri::test::mock_app();
    let handle = app.handle().clone();

    let vault = TestVault::new_unlocked();
    let srv = start_webdav_server(handle, vault.adapter.clone())
        .await
        .expect("start webdav");

    // MKCOL /docs
    let (st, _body) = http_request(srv.addr, "MKCOL", "/docs", vec![], vec![]).await;
    assert!(
        st == StatusCode::CREATED || st == StatusCode::METHOD_NOT_ALLOWED,
        "MKCOL status={st}"
    );

    // PUT /docs/hello.bin
    let data_v1 = deterministic_bytes(1, 256 * 1024);
    let (st, _body) = http_request(
        srv.addr,
        "PUT",
        "/docs/hello.bin",
        vec![("content-type", "application/octet-stream".to_string())],
        data_v1.clone(),
    )
    .await;
    assert!(
        st == StatusCode::CREATED || st == StatusCode::NO_CONTENT,
        "PUT v1 status={st}"
    );

    // GET /docs/hello.bin
    let (st, body) = http_request(srv.addr, "GET", "/docs/hello.bin", vec![], vec![]).await;
    assert_eq!(st, StatusCode::OK);
    assert_eq!(body.as_ref(), data_v1.as_slice());

    // Overwrite via PUT
    let data_v2 = deterministic_bytes(2, 64 * 1024);
    let (st, _body) = http_request(
        srv.addr,
        "PUT",
        "/docs/hello.bin",
        vec![("content-type", "application/octet-stream".to_string())],
        data_v2.clone(),
    )
    .await;
    assert!(
        st == StatusCode::NO_CONTENT || st == StatusCode::CREATED,
        "PUT v2 status={st}"
    );

    let (st, body) = http_request(srv.addr, "GET", "/docs/hello.bin", vec![], vec![]).await;
    assert_eq!(st, StatusCode::OK);
    assert_eq!(body.as_ref(), data_v2.as_slice());

    // Range read: bytes=10-99 (90 bytes)
    let (st, body) = http_request(
        srv.addr,
        "GET",
        "/docs/hello.bin",
        vec![("range", "bytes=10-99".to_string())],
        vec![],
    )
    .await;
    assert_eq!(st, StatusCode::PARTIAL_CONTENT, "range status={st}");
    assert_eq!(body.len(), 90);
    assert_eq!(body.as_ref(), &data_v2[10..100]);

    // Verify persistence through core catalog (list only).
    let docs_list = catalog_list(&vault.adapter, Some("/docs"));
    assert!(docs_list.items.iter().any(|it| it.name == "hello.bin"));

    srv.join().await;
}

#[tokio::test]
async fn webdav_protected_path_returns_403() {
    let app = tauri::test::mock_app();
    let handle = app.handle().clone();

    let vault = TestVault::new_unlocked();
    let srv = start_webdav_server(handle, vault.adapter.clone())
        .await
        .expect("start webdav");

    let (st, _body) = http_request(
        srv.addr,
        "PROPFIND",
        "/.passmanager",
        vec![("depth", "1".to_string())],
        vec![],
    )
    .await;
    assert_eq!(
        st,
        StatusCode::FORBIDDEN,
        "PROPFIND /.passmanager must return 403, got {st}"
    );

    let (st, _body) =
        http_request(srv.addr, "GET", "/.passmanager/some-entry", vec![], vec![]).await;
    assert_eq!(
        st,
        StatusCode::FORBIDDEN,
        "GET /.passmanager/some-entry must return 403, got {st}"
    );

    let (st, _body) = http_request(srv.addr, "MKCOL", "/.passmanager/sub", vec![], vec![]).await;
    assert_eq!(
        st,
        StatusCode::FORBIDDEN,
        "MKCOL /.passmanager/sub must return 403, got {st}"
    );

    let (st, _body) = http_request(
        srv.addr,
        "PUT",
        "/.passmanager/file.txt",
        vec![],
        b"data".to_vec(),
    )
    .await;
    assert_eq!(
        st,
        StatusCode::FORBIDDEN,
        "PUT /.passmanager/file.txt must return 403, got {st}"
    );

    let (st, _body) =
        http_request(srv.addr, "DELETE", "/.passmanager/file.txt", vec![], vec![]).await;
    assert_eq!(
        st,
        StatusCode::FORBIDDEN,
        "DELETE /.passmanager/file.txt must return 403, got {st}"
    );

    let (st, _body) = http_request(
        srv.addr,
        "PROPFIND",
        "/.wallet",
        vec![("depth", "1".to_string())],
        vec![],
    )
    .await;
    assert_eq!(
        st,
        StatusCode::FORBIDDEN,
        "PROPFIND /.wallet must return 403, got {st}"
    );

    let (st, _body) = http_request(srv.addr, "MKCOL", "/normal-dir", vec![], vec![]).await;
    assert!(
        st == StatusCode::CREATED || st == StatusCode::METHOD_NOT_ALLOWED,
        "MKCOL /normal-dir should succeed, got {st}"
    );
    let (st, _body) = http_request(
        srv.addr,
        "PROPFIND",
        "/normal-dir",
        vec![("depth", "1".to_string())],
        vec![],
    )
    .await;
    assert_eq!(
        st.as_u16(),
        207,
        "PROPFIND /normal-dir should return 207, got {st}"
    );

    srv.join().await;
}

#[tokio::test]
async fn webdav_delete_and_directory_move() {
    let app = tauri::test::mock_app();
    let handle = app.handle().clone();

    let vault = TestVault::new_unlocked();
    let srv = start_webdav_server(handle, vault.adapter.clone())
        .await
        .expect("start webdav");

    let (st, _body) = http_request(srv.addr, "MKCOL", "/docs", vec![], vec![]).await;
    assert!(st == StatusCode::CREATED || st == StatusCode::METHOD_NOT_ALLOWED);

    // Create nested dirs.
    let (st, _body) = http_request(srv.addr, "MKCOL", "/docs/sub", vec![], vec![]).await;
    assert!(st == StatusCode::CREATED || st == StatusCode::METHOD_NOT_ALLOWED);

    // Zero-byte file.
    let (st, _body) = http_request(srv.addr, "PUT", "/docs/sub/empty.txt", vec![], vec![]).await;
    assert!(st == StatusCode::CREATED || st == StatusCode::NO_CONTENT);
    let (st, body) = http_request(srv.addr, "GET", "/docs/sub/empty.txt", vec![], vec![]).await;
    assert_eq!(st, StatusCode::OK);
    assert!(body.is_empty());

    // Delete file.
    let (st, _body) = http_request(srv.addr, "DELETE", "/docs/sub/empty.txt", vec![], vec![]).await;
    assert!(st == StatusCode::NO_CONTENT || st == StatusCode::OK);
    let (st, _body) = http_request(srv.addr, "GET", "/docs/sub/empty.txt", vec![], vec![]).await;
    assert!(
        st == StatusCode::NOT_FOUND || st == StatusCode::GONE,
        "GET after delete status={st}"
    );

    // Delete now-empty directory.
    let (st, _body) = http_request(srv.addr, "DELETE", "/docs/sub", vec![], vec![]).await;
    assert!(
        st == StatusCode::NO_CONTENT || st == StatusCode::OK,
        "DELETE /docs/sub status={st}"
    );

    // Directory MOVE (/docs/a -> /docs/b).
    let (st, _body) = http_request(srv.addr, "MKCOL", "/docs/a", vec![], vec![]).await;
    assert!(st == StatusCode::CREATED || st == StatusCode::METHOD_NOT_ALLOWED);

    let dst_url = format!("http://{}{}", srv.addr, "/docs/b");
    let (st, _body) = http_request(
        srv.addr,
        "MOVE",
        "/docs/a",
        vec![("destination", dst_url), ("overwrite", "F".to_string())],
        vec![],
    )
    .await;
    assert!(
        st == StatusCode::CREATED || st == StatusCode::NO_CONTENT || st == StatusCode::OK,
        "MOVE dir status={st}"
    );

    // Verify directory exists via PROPFIND.
    let (st, _body) = http_request(
        srv.addr,
        "PROPFIND",
        "/docs/b",
        vec![("depth", "1".to_string())],
        vec![],
    )
    .await;
    assert_eq!(st.as_u16(), 207, "PROPFIND status={st}");

    let (st, _body) = http_request(srv.addr, "DELETE", "/docs/b", vec![], vec![]).await;
    assert!(
        st == StatusCode::NO_CONTENT || st == StatusCode::OK,
        "DELETE /docs/b status={st}"
    );

    // Verify catalog root still lists /docs and does not list /docs/b.
    let docs_list = catalog_list(&vault.adapter, Some("/docs"));
    assert!(!docs_list.items.iter().any(|it| it.name == "b"));

    srv.join().await;
}

#[tokio::test]
async fn webdav_regression_matrix_full_roundtrip() {
    let app = tauri::test::mock_app();
    let handle = app.handle().clone();

    let vault = TestVault::new_unlocked();
    let srv = start_webdav_server(handle.clone(), vault.adapter.clone())
        .await
        .expect("start webdav");

    // Base directories.
    let (st, _body) = http_request(srv.addr, "MKCOL", "/docs", vec![], vec![]).await;
    assert!(st == StatusCode::CREATED || st == StatusCode::METHOD_NOT_ALLOWED);
    let (st, _body) = http_request(srv.addr, "MKCOL", "/docs/reg", vec![], vec![]).await;
    assert!(st == StatusCode::CREATED || st == StatusCode::METHOD_NOT_ALLOWED);

    struct Case {
        name: &'static str,
        seed: u64,
        size: usize,
        chunk: usize,
    }

    let cases = [
        Case {
            name: "empty",
            seed: 1,
            size: 0,
            chunk: 1024,
        },
        Case {
            name: "tiny",
            seed: 2,
            size: 1,
            chunk: 1,
        },
        Case {
            name: "small4k",
            seed: 3,
            size: 4 * 1024,
            chunk: 512,
        },
        Case {
            name: "medium64k",
            seed: 4,
            size: 64 * 1024,
            chunk: 4096,
        },
        Case {
            name: "big9m",
            seed: 5,
            size: (9 * 1024 * 1024) + 123,
            chunk: 64 * 1024,
        },
    ];

    // Keep final state for persistence verification across server/core restart.
    let mut persisted: Vec<(String, Vec<u8>)> = Vec::new();

    for case in &cases {
        let filename = format!("{}.bin", case.name);
        let path = format!("/docs/reg/{filename}");

        // v1: streaming PUT (chunked transfer) to exercise multi-write flows.
        let data_v1 = deterministic_bytes(case.seed, case.size);
        let chunks_v1: Vec<Vec<u8>> = data_v1
            .chunks(case.chunk.max(1))
            .map(|c| c.to_vec())
            .collect();
        let (st, _body) = http_request_streaming(
            srv.addr,
            "PUT",
            &path,
            vec![("content-type", "application/octet-stream".to_string())],
            chunks_v1,
        )
        .await;
        assert!(
            st == StatusCode::CREATED || st == StatusCode::NO_CONTENT,
            "PUT v1 {} status={st}",
            case.name
        );

        let (st, body) = http_request(srv.addr, "GET", &path, vec![], vec![]).await;
        assert_eq!(st, StatusCode::OK, "GET v1 {} status={st}", case.name);
        assert_eq!(
            sha256_hex(body.as_ref()),
            sha256_hex(&data_v1),
            "GET v1 content mismatch ({})",
            case.name
        );

        // Range reads on boundaries.
        if !data_v1.is_empty() {
            let (st, body) = http_request(
                srv.addr,
                "GET",
                &path,
                vec![("range", "bytes=0-0".to_string())],
                vec![],
            )
            .await;
            assert_eq!(
                st,
                StatusCode::PARTIAL_CONTENT,
                "range first byte status={st}"
            );
            assert_eq!(body.as_ref(), &data_v1[0..1]);
        }
        if data_v1.len() >= 128 {
            let start: usize = 13;
            let end: usize = start + 63;
            let (st, body) = http_request(
                srv.addr,
                "GET",
                &path,
                vec![("range", format!("bytes={start}-{end}"))],
                vec![],
            )
            .await;
            assert_eq!(st, StatusCode::PARTIAL_CONTENT, "range mid status={st}");
            assert_eq!(body.as_ref(), &data_v1[start..(end + 1)]);
        }

        // Verify persistence through core download.
        let node_id = catalog_find_child(&vault.adapter, Some("/docs/reg"), &filename)
            .unwrap_or_else(|| panic!("expected node_id for {}", filename));
        let downloaded = catalog_download(&vault.adapter, node_id);
        assert_eq!(
            sha256_hex(&downloaded),
            sha256_hex(&data_v1),
            "core download mismatch v1 ({})",
            case.name
        );

        // v2: overwrite with smaller file (truncate semantics).
        let size_v2 = if case.size >= 2 { case.size / 2 } else { 0 };
        let data_v2 = deterministic_bytes(case.seed + 1000, size_v2);
        let (st, _body) = http_request(
            srv.addr,
            "PUT",
            &path,
            vec![("content-type", "application/octet-stream".to_string())],
            data_v2.clone(),
        )
        .await;
        assert!(
            st == StatusCode::NO_CONTENT || st == StatusCode::CREATED,
            "PUT v2 {} status={st}",
            case.name
        );

        let (st, body) = http_request(srv.addr, "GET", &path, vec![], vec![]).await;
        assert_eq!(st, StatusCode::OK, "GET v2 {} status={st}", case.name);
        assert_eq!(sha256_hex(body.as_ref()), sha256_hex(&data_v2));
        let node_id = catalog_find_child(&vault.adapter, Some("/docs/reg"), &filename)
            .unwrap_or_else(|| panic!("expected node_id for {}", filename));
        let downloaded = catalog_download(&vault.adapter, node_id);
        assert_eq!(sha256_hex(&downloaded), sha256_hex(&data_v2));

        // v3: overwrite with larger file (growth semantics).
        let mut data_final = deterministic_bytes(case.seed + 2000, case.size.saturating_add(123));
        let chunks_v3: Vec<Vec<u8>> = data_final
            .chunks(case.chunk.max(1))
            .map(|c| c.to_vec())
            .collect();
        let (st, _body) = http_request_streaming(
            srv.addr,
            "PUT",
            &path,
            vec![("content-type", "application/octet-stream".to_string())],
            chunks_v3,
        )
        .await;
        assert!(
            st == StatusCode::NO_CONTENT || st == StatusCode::CREATED,
            "PUT v3 {} status={st}",
            case.name
        );
        let (st, body) = http_request(srv.addr, "GET", &path, vec![], vec![]).await;
        assert_eq!(st, StatusCode::OK, "GET v3 {} status={st}", case.name);
        assert_eq!(sha256_hex(body.as_ref()), sha256_hex(&data_final));
        let node_id = catalog_find_child(&vault.adapter, Some("/docs/reg"), &filename)
            .unwrap_or_else(|| panic!("expected node_id for {}", filename));
        let downloaded = catalog_download(&vault.adapter, node_id);
        assert_eq!(sha256_hex(&downloaded), sha256_hex(&data_final));

        // Atomic-save style replace (temp + MOVE overwrite) on a mid-sized file.
        if case.name == "medium64k" {
            let tmp_path = format!("/docs/reg/.tmp-{}", case.name);
            let data_v4 = deterministic_bytes(case.seed + 3000, (32 * 1024) + 7);
            let chunks_v4: Vec<Vec<u8>> = data_v4.chunks(4096).map(|c| c.to_vec()).collect();

            let (st, _body) = http_request_streaming(
                srv.addr,
                "PUT",
                &tmp_path,
                vec![("content-type", "application/octet-stream".to_string())],
                chunks_v4,
            )
            .await;
            assert!(
                st == StatusCode::CREATED || st == StatusCode::NO_CONTENT,
                "PUT tmp status={st}"
            );

            let dst_url = format!("http://{}{}", srv.addr, path);
            let (st, _body) = http_request(
                srv.addr,
                "MOVE",
                &tmp_path,
                vec![("destination", dst_url), ("overwrite", "T".to_string())],
                vec![],
            )
            .await;
            assert!(
                st == StatusCode::CREATED || st == StatusCode::NO_CONTENT || st == StatusCode::OK,
                "MOVE atomic replace status={st}"
            );

            let (st, body) = http_request(srv.addr, "GET", &path, vec![], vec![]).await;
            assert_eq!(st, StatusCode::OK);
            assert_eq!(sha256_hex(body.as_ref()), sha256_hex(&data_v4));

            let node_id = catalog_find_child(&vault.adapter, Some("/docs/reg"), &filename)
                .unwrap_or_else(|| panic!("expected node_id for {}", filename));
            let downloaded = catalog_download(&vault.adapter, node_id);
            assert_eq!(sha256_hex(&downloaded), sha256_hex(&data_v4));

            data_final = data_v4;
        }

        // Rename and move back (covers MOVE rename semantics).
        if case.name == "small4k" {
            let renamed_path = format!("/docs/reg/{}-renamed.bin", case.name);
            let dst_url = format!("http://{}{}", srv.addr, renamed_path);
            let (st, _body) = http_request(
                srv.addr,
                "MOVE",
                &path,
                vec![("destination", dst_url), ("overwrite", "F".to_string())],
                vec![],
            )
            .await;
            assert!(
                st == StatusCode::CREATED || st == StatusCode::NO_CONTENT || st == StatusCode::OK,
                "MOVE rename status={st}"
            );

            let (st, _body) = http_request(srv.addr, "GET", &path, vec![], vec![]).await;
            assert!(st == StatusCode::NOT_FOUND || st == StatusCode::GONE);

            let (st, body) = http_request(srv.addr, "GET", &renamed_path, vec![], vec![]).await;
            assert_eq!(st, StatusCode::OK);
            assert_eq!(sha256_hex(body.as_ref()), sha256_hex(&data_final));

            let dst_url = format!("http://{}{}", srv.addr, path);
            let (st, _body) = http_request(
                srv.addr,
                "MOVE",
                &renamed_path,
                vec![("destination", dst_url), ("overwrite", "T".to_string())],
                vec![],
            )
            .await;
            assert!(
                st == StatusCode::CREATED || st == StatusCode::NO_CONTENT || st == StatusCode::OK,
                "MOVE move-back status={st}"
            );

            let (st, body) = http_request(srv.addr, "GET", &path, vec![], vec![]).await;
            assert_eq!(st, StatusCode::OK);
            assert_eq!(sha256_hex(body.as_ref()), sha256_hex(&data_final));
        }

        persisted.push((filename, data_final));
    }

    // Persist + restart core + restart server, then download and compare to originals.
    vault.save();
    srv.join().await;

    vault.restart_core_unlocked();

    let srv = start_webdav_server(handle, vault.adapter.clone())
        .await
        .expect("restart webdav after core restart");

    for (filename, expected) in &persisted {
        let path = format!("/docs/reg/{filename}");
        let (st, body) = http_request(srv.addr, "GET", &path, vec![], vec![]).await;
        assert_eq!(st, StatusCode::OK, "GET after restart status={st}");
        assert_eq!(sha256_hex(body.as_ref()), sha256_hex(expected));

        let node_id = catalog_find_child(&vault.adapter, Some("/docs/reg"), filename)
            .unwrap_or_else(|| panic!("expected node_id for {}", filename));
        let downloaded = catalog_download(&vault.adapter, node_id);
        assert_eq!(sha256_hex(&downloaded), sha256_hex(expected));
    }

    // Cleanup: delete persisted files, ensure they disappear.
    for (filename, _) in &persisted {
        let path = format!("/docs/reg/{filename}");
        let (st, _body) = http_request(srv.addr, "DELETE", &path, vec![], vec![]).await;
        assert!(
            st == StatusCode::NO_CONTENT || st == StatusCode::OK,
            "DELETE status={st}"
        );
        let (st, _body) = http_request(srv.addr, "GET", &path, vec![], vec![]).await;
        assert!(st == StatusCode::NOT_FOUND || st == StatusCode::GONE);

        let after = catalog_list(&vault.adapter, Some("/docs/reg"));
        assert!(
            !after.items.iter().any(|it| it.name == *filename),
            "catalog still lists deleted file {}",
            filename
        );
    }

    srv.join().await;
}
