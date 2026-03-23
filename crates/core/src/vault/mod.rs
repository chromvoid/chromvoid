//! Vault management with Plausible Deniability
//!
//! This module implements:
//! - Vault unlock/lock operations
//! - Plausible Deniability (any password opens "some" vault)
//! - Session management

mod loading;
mod session;

pub use session::{Vault, VaultSession};
