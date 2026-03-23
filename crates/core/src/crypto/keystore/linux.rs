//! Linux keystore backend.
//!
//! Implementation uses the Secret Service API (libsecret/gnome-keyring) via the `keyring` crate.

pub type LinuxKeystore = super::KeyringKeystore;
