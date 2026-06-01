//! Vault-backed passkey credential source and WebAuthn helpers (ADR-034).

mod assertion;
mod crypto;
mod encoding;
mod query;
mod registration;
mod request;
mod summary;
mod types;
mod validation;
mod webauthn;

pub use assertion::create_assertion;
pub use encoding::{decode_b64url, encode_b64url};
pub use query::query_candidates;
pub use registration::create_registration;
pub use summary::source_to_summary;
pub use types::{
    now_epoch_ms, PasskeyAssertion, PasskeyCredentialSource, PasskeyError, PasskeyRegistration,
    ES256_ALGORITHM, P256_CURVE, PASSKEY_SCHEMA_V1, STORAGE_KIND_VAULT,
};
