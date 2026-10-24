//! The wire a desktop and an Android phone speak over a USB accessory (AOA) link: length-prefixed
//! records carrying Noise messages, and the pairing exchange that trusts a desktop the phone has
//! not seen. Both ends use this module, so the two cannot drift apart.

pub mod pairing;
pub mod record;

#[cfg(test)]
mod tests;
