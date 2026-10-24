//! Shared host handshake; platform approval remains in the acceptor caller.
pub(super) use chromvoid_network_runtime::acceptor::handshake::{
    perform_handshake, recv_initial_handshake_message, HandshakeOutcome,
};
#[cfg(test)]
pub(super) use chromvoid_network_runtime::acceptor::handshake::{
    recv_handshake_message_with_timeout_for, NOISE_HANDSHAKE_MESSAGE_TIMEOUT,
};
