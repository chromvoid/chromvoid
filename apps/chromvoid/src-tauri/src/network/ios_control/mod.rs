//! Relay control-plane client for iOS pairing/presence/wake flows.

mod client;
mod models;

#[cfg(test)]
mod tests;

pub use client::*;
pub use models::*;
