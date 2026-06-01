use std::io::Read;
use std::sync::{Arc, Mutex};

use chromvoid_core::rpc::types::{RpcRequest, RpcResponse};
use chromvoid_core::rpc::RpcReply;

use crate::core_adapter::CoreAdapter;

use super::session::{LocalMediaSourceSession, MAX_MEDIA_RANGE_BYTES};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum LocalMediaRangeError {
    SourceLoadFailed,
    StreamLocked,
    StreamNotFound,
    StreamStale,
    RangeInvalid,
    RangeReadFailed,
}

pub(crate) fn read_local_media_range(
    adapter: &Arc<Mutex<Box<dyn CoreAdapter>>>,
    session: &LocalMediaSourceSession,
    offset: u64,
    length: u64,
) -> Result<Vec<u8>, LocalMediaRangeError> {
    let capped_length = length.min(MAX_MEDIA_RANGE_BYTES);
    let reply = {
        let mut adapter = adapter
            .lock()
            .map_err(|_| LocalMediaRangeError::SourceLoadFailed)?;
        let request = RpcRequest::new(
            "catalog:downloadRange".to_string(),
            serde_json::json!({
                "node_id": session.node_id,
                "offset": offset,
                "length": capped_length,
                "expected_source_revision": session.source_revision,
            }),
        );
        adapter.handle_with_stream(&request, None)
    };

    match reply {
        RpcReply::RangeStream(out) => {
            let mut reader = out.reader;
            let mut bytes = Vec::with_capacity(capped_length as usize);
            reader
                .read_to_end(&mut bytes)
                .map_err(|_| LocalMediaRangeError::RangeReadFailed)?;
            Ok(bytes)
        }
        RpcReply::Json(RpcResponse::Error { code, .. }) => {
            Err(map_core_error_code(code.as_deref()))
        }
        RpcReply::Json(RpcResponse::Success { .. }) | RpcReply::Stream(_) => {
            Err(LocalMediaRangeError::SourceLoadFailed)
        }
    }
}

fn map_core_error_code(code: Option<&str>) -> LocalMediaRangeError {
    match code {
        Some("ERR_MEDIA_STREAM_STALE") => LocalMediaRangeError::StreamStale,
        Some("ERR_MEDIA_RANGE_INVALID") => LocalMediaRangeError::RangeInvalid,
        Some("VAULT_REQUIRED") | Some("VAULT_NOT_UNLOCKED") | Some("ACCESS_DENIED") => {
            LocalMediaRangeError::StreamLocked
        }
        Some("NODE_NOT_FOUND") => LocalMediaRangeError::StreamNotFound,
        _ => LocalMediaRangeError::RangeReadFailed,
    }
}

#[cfg(test)]
mod tests {
    use std::io::Cursor;
    use std::sync::{Arc, Mutex};

    use chromvoid_core::rpc::{RpcInputStream, RpcRangeOutputStream, RpcRangeStreamMeta, RpcReply};
    use serde_json::Value;

    use crate::core_adapter::{ConnectionState, CoreMode};

    use super::*;
    use crate::media_source::{LocalMediaKind, LocalMediaSourceManager};

    struct TestAdapter {
        reply: TestReply,
        last_request: Arc<Mutex<Option<RpcRequest>>>,
    }

    enum TestReply {
        Range(Vec<u8>),
        Error(&'static str),
    }

    impl CoreAdapter for TestAdapter {
        fn mode(&self) -> CoreMode {
            CoreMode::Local
        }

        fn connection_state(&self) -> ConnectionState {
            ConnectionState::Disconnected
        }

        fn is_unlocked(&self) -> bool {
            true
        }

        fn handle(&mut self, _req: &RpcRequest) -> RpcResponse {
            RpcResponse::error("unexpected json call", Some("TEST"))
        }

        fn handle_with_stream(
            &mut self,
            req: &RpcRequest,
            _stream: Option<RpcInputStream>,
        ) -> RpcReply {
            *self.last_request.lock().expect("last request lock") = Some(req.clone());
            match &self.reply {
                TestReply::Range(bytes) => RpcReply::RangeStream(RpcRangeOutputStream {
                    meta: RpcRangeStreamMeta {
                        name: "movie.mp4".to_string(),
                        mime_type: "video/mp4".to_string(),
                        file_size: bytes.len() as u64,
                        chunk_size: bytes.len() as u32,
                        range_offset: 0,
                        range_length: bytes.len() as u64,
                        source_revision: 7,
                    },
                    reader: Box::new(Cursor::new(bytes.clone())),
                }),
                TestReply::Error(code) => RpcReply::Json(RpcResponse::error("failed", Some(*code))),
            }
        }

        fn save(&mut self) -> Result<(), String> {
            Ok(())
        }

        fn take_events(&mut self) -> Vec<Value> {
            Vec::new()
        }

        fn set_master_key(&mut self, _key: Option<String>) {}
    }

    fn adapter(
        reply: TestReply,
    ) -> (
        Arc<Mutex<Box<dyn CoreAdapter>>>,
        Arc<Mutex<Option<RpcRequest>>>,
    ) {
        let last_request = Arc::new(Mutex::new(None));
        (
            Arc::new(Mutex::new(Box::new(TestAdapter {
                reply,
                last_request: last_request.clone(),
            }) as Box<dyn CoreAdapter>)),
            last_request,
        )
    }

    fn session() -> LocalMediaSourceSession {
        LocalMediaSourceManager::new()
            .register(
                9,
                LocalMediaKind::Video,
                "video/mp4".to_string(),
                10 * 1024 * 1024,
                7,
            )
            .expect("register media source")
    }

    #[test]
    fn caps_requested_range_length() {
        let (adapter, last_request) = adapter(TestReply::Range(vec![1, 2, 3]));
        let session = session();

        let bytes =
            read_local_media_range(&adapter, &session, 5, MAX_MEDIA_RANGE_BYTES + 1).unwrap();

        assert_eq!(bytes, vec![1, 2, 3]);
        let request = last_request
            .lock()
            .expect("last request lock")
            .clone()
            .expect("request");
        assert_eq!(request.command, "catalog:downloadRange");
        assert_eq!(request.data["node_id"], 9);
        assert_eq!(request.data["offset"], 5);
        assert_eq!(request.data["length"], MAX_MEDIA_RANGE_BYTES);
        assert_eq!(request.data["expected_source_revision"], 7);
    }

    #[test]
    fn maps_stale_revision_errors() {
        let (adapter, _) = adapter(TestReply::Error("ERR_MEDIA_STREAM_STALE"));
        let session = session();

        let error = read_local_media_range(&adapter, &session, 0, 1).unwrap_err();

        assert_eq!(error, LocalMediaRangeError::StreamStale);
    }
}
