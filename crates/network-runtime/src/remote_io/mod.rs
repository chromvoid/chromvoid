//! Shared encrypted frame I/O and typed failure boundary; no app or Core session ownership.
mod failure;
mod frames;

pub use failure::{RemoteIoFailure, RemoteIoResult};
pub use frames::{
    recv_decrypted_frame, recv_decrypted_frame_typed, send_encrypted_frame,
    send_encrypted_frame_typed,
};
