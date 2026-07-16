mod commands;
pub mod format;
#[cfg(desktop)]
mod http_server;
mod protocol;
mod protocol_runtime;
mod session;

pub use crate::media_source::{MAX_MEDIA_RANGE_BYTES, MEDIA_STREAM_IDLE_TTL_MS};
pub(crate) use commands::{
    prepare_media_source, prepare_media_stream, release_media_source, release_media_stream,
};
#[cfg(desktop)]
pub(crate) use http_server::{spawn_media_http_stream_server, MediaHttpStreamRuntimeState};
pub use protocol::handle_protocol_request;
pub(crate) use protocol_runtime::MediaProtocolRuntimeState;
pub use session::{PreparedMediaStreamSource, PreparedVideoSource, SCHEME};
