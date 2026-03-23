//! ADR-010 / SPEC-100: vault key derivation v2 scaffold.
//!
//! This is a non-functional contract test to ensure the v2 derivation plumbing
//! (stretched_salt + storage_pepper) is introduced in code. It is expected to
//! fail until the actual implementation exists.

use std::fs;
use std::path::Path;

#[test]
fn test_v2_kdf_plumbing_is_present_in_source() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR"));

    let argon2_rs = root.join("src/crypto/argon2.rs");
    let derive_rs = root.join("src/crypto/derive_vault_key.rs");
    let crypto_mod_rs = root.join("src/crypto/mod.rs");

    let mut combined = String::new();
    if let Ok(s) = fs::read_to_string(&argon2_rs) {
        combined.push_str(&s);
    }
    if let Ok(s) = fs::read_to_string(&derive_rs) {
        combined.push_str(&s);
    }
    if let Ok(s) = fs::read_to_string(&crypto_mod_rs) {
        combined.push_str(&s);
    }

    // SPEC-100 expects a v2 derivation path. We look for stable identifiers rather than
    // comments to avoid passing on placeholders.
    let has_v2_fn =
        combined.contains("derive_vault_key_v2") || combined.contains("derive_vault_key_v2(");
    let has_stretched_salt = combined.contains("stretched_salt");
    let mentions_pepper = combined.contains("storage_pepper");

    assert!(
        has_v2_fn && has_stretched_salt && mentions_pepper,
        "SPEC-100 KDF v2 plumbing missing: expected derive_vault_key_v2 + stretched_salt + storage_pepper references"
    );
}
