//! SPEC-100 portable pepper scaffolding (file/module presence)
//!
//! These tests intentionally fail until the target architecture modules exist.

use std::path::Path;

#[test]
fn test_portable_pepper_modules_exist() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR"));

    assert!(
        root.join("src/crypto/storage_pepper.rs").exists(),
        "SPEC-100 requires crates/core/src/crypto/storage_pepper.rs"
    );
    assert!(
        root.join("src/crypto/derive_vault_key.rs").exists(),
        "SPEC-100 requires crates/core/src/crypto/derive_vault_key.rs"
    );

    // Keystore abstraction
    assert!(
        root.join("src/crypto/keystore/mod.rs").exists(),
        "SPEC-100 requires crates/core/src/crypto/keystore/mod.rs"
    );
    assert!(
        root.join("src/crypto/keystore/macos.rs").exists(),
        "SPEC-100 requires crates/core/src/crypto/keystore/macos.rs"
    );
    assert!(
        root.join("src/crypto/keystore/windows.rs").exists(),
        "SPEC-100 requires crates/core/src/crypto/keystore/windows.rs"
    );
    assert!(
        root.join("src/crypto/keystore/linux.rs").exists(),
        "SPEC-100 requires crates/core/src/crypto/keystore/linux.rs"
    );
    assert!(
        root.join("src/crypto/keystore/ios.rs").exists(),
        "SPEC-100 requires crates/core/src/crypto/keystore/ios.rs"
    );
    assert!(
        root.join("src/crypto/keystore/android.rs").exists(),
        "SPEC-100 requires crates/core/src/crypto/keystore/android.rs"
    );
}
