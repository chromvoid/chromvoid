use std::net::SocketAddr;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use bytes::Bytes;
use chromvoid_core::rpc::types::{RpcRequest, RpcResponse};
use dav_server::fs::FsError;
use http_body_util::{BodyExt, Full};
use hyper::client::conn::http1;
use hyper::{Request, StatusCode};
use hyper_util::rt::TokioIo;
use serde_json::json;
use tempfile::tempdir;
use tokio::net::TcpStream;
use tokio::sync::oneshot;

use crate::core_adapter::{CoreAdapter, LocalCoreAdapter};

use super::filesystem::CatalogDavFs;
use super::server::{start_webdav_server, WebDavServerHandle};

#[tokio::test]
async fn webdav_handle_drop_signals_shutdown_channel() {
    let (shutdown_tx, shutdown_rx) = oneshot::channel::<()>();
    let handle = WebDavServerHandle {
        addr: "127.0.0.1:0".parse().expect("addr"),
        shutdown_tx: Some(shutdown_tx),
        task: Some(tokio::spawn(async {})),
    };

    drop(handle);

    let signaled = tokio::time::timeout(Duration::from_millis(200), shutdown_rx).await;
    assert!(signaled.is_ok(), "drop should signal shutdown");
    assert!(matches!(signaled.expect("timeout"), Ok(())));
}

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

#[tokio::test]
async fn webdav_bind_is_loopback_and_file_roundtrip() {
    let app = tauri::test::mock_app();
    let handle = app.handle().clone();

    let dir = tempdir().expect("tempdir");
    let storage_root = dir.path().join("storage");
    let mut adapter = LocalCoreAdapter::new(storage_root).expect("LocalCoreAdapter::new");
    adapter.set_master_key(Some("test-master-key".to_string()));

    // Unlock the vault so catalog ops are allowed.
    let unlock = RpcRequest::new("vault:unlock".to_string(), json!({"password": "test"}));
    match adapter.handle(&unlock) {
        RpcResponse::Success { .. } => {}
        other => panic!("vault:unlock failed in test setup: {:?}", other),
    }

    // Sanity check that core accepts createDir under root.
    let req = RpcRequest::new(
        "catalog:createDir".to_string(),
        json!({"name": "sanity", "parent_path": null}),
    );
    match adapter.handle(&req) {
        RpcResponse::Success { .. } => {}
        other => panic!("catalog:createDir failed in test setup: {:?}", other),
    }

    let adapter: Arc<Mutex<Box<dyn CoreAdapter>>> = Arc::new(Mutex::new(Box::new(adapter)));
    let srv = start_webdav_server(handle, adapter)
        .await
        .expect("start webdav");

    assert!(srv.addr.ip().is_loopback());

    // MKCOL /docs
    let (st, _body) = http_request(srv.addr, "MKCOL", "/docs", vec![], vec![]).await;
    assert!(
        st == StatusCode::CREATED || st == StatusCode::METHOD_NOT_ALLOWED,
        "MKCOL status={st}"
    );

    // PUT /docs/hello.txt
    let data = b"hello webdav".to_vec();
    let (st, _body) = http_request(srv.addr, "PUT", "/docs/hello.txt", vec![], data.clone()).await;
    assert!(
        st == StatusCode::CREATED || st == StatusCode::NO_CONTENT,
        "PUT status={st}"
    );

    // GET /docs/hello.txt
    let (st, body) = http_request(srv.addr, "GET", "/docs/hello.txt", vec![], vec![]).await;
    assert_eq!(st, StatusCode::OK);
    assert_eq!(body.as_ref(), data.as_slice());

    // PROPFIND /docs Depth: 1
    let (st, _body) = http_request(
        srv.addr,
        "PROPFIND",
        "/docs",
        vec![("depth", "1".to_string())],
        vec![],
    )
    .await;
    assert_eq!(st.as_u16(), 207, "PROPFIND status={st}");

    // DELETE /docs/hello.txt
    let (st, _body) = http_request(srv.addr, "DELETE", "/docs/hello.txt", vec![], vec![]).await;
    assert!(
        st == StatusCode::NO_CONTENT || st == StatusCode::OK,
        "DELETE status={st}"
    );

    srv.join().await;
}

#[test]
fn rpc_code_access_denied_maps_to_forbidden() {
    let err = CatalogDavFs::<tauri::Wry>::rpc_code_to_fs_error(Some("ACCESS_DENIED"));
    assert!(matches!(err, FsError::Forbidden));
}

#[test]
fn rpc_code_node_not_found_maps_to_not_found() {
    let err = CatalogDavFs::<tauri::Wry>::rpc_code_to_fs_error(Some("NODE_NOT_FOUND"));
    assert!(matches!(err, FsError::NotFound));
}

#[test]
fn rpc_code_unknown_maps_to_not_found() {
    let err = CatalogDavFs::<tauri::Wry>::rpc_code_to_fs_error(Some("SOMETHING_ELSE"));
    assert!(matches!(err, FsError::NotFound));
    let err = CatalogDavFs::<tauri::Wry>::rpc_code_to_fs_error(None);
    assert!(matches!(err, FsError::NotFound));
}
