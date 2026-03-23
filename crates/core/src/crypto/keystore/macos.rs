//! macOS keystore backend.
//!
//! Implementation uses the OS Keychain via the `keyring` crate.

pub type MacOsKeystore = super::KeyringKeystore;
