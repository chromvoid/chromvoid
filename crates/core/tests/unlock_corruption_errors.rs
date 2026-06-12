//! Regression test for H3: a corrupt/undecryptable catalog must surface as an
//! error on unlock, NOT as a silently-empty vault (which would then be made
//! permanent by the next destructive save).

mod test_helpers;

use std::fs;
use std::path::Path;
use test_helpers::*;

/// Overwrite every chunk file under `chunks/` with garbage, leaving the master
/// material (salt/verify) intact so unlock still derives the correct key and the
/// root-index chunk name still resolves to an existing (but corrupt) file.
fn corrupt_all_chunks(base: &Path) {
    fn walk(dir: &Path) {
        for entry in fs::read_dir(dir).expect("read_dir") {
            let entry = entry.expect("dir entry");
            let path = entry.path();
            if path.is_dir() {
                walk(&path);
            } else {
                fs::write(&path, b"corrupt-not-valid-ciphertext").expect("overwrite chunk");
            }
        }
    }
    let chunks = base.join("chunks");
    if chunks.exists() {
        walk(&chunks);
    }
}

#[test]
fn corrupt_catalog_chunks_error_on_unlock_instead_of_empty_vault() {
    let (mut router, temp_dir, _keystore) = create_test_router_with_keystore();
    unlock_vault(&mut router, "correct-horse");

    // Create some real catalog content, then lock so it is flushed to disk.
    create_dir(&mut router, "secrets");
    create_dir_at(&mut router, "/secrets", "bank");
    lock_vault(&mut router);

    // Corrupt the encrypted catalog on disk (master material is left intact).
    corrupt_all_chunks(temp_dir.path());

    // Unlocking with the CORRECT password must now fail loudly rather than
    // returning an empty catalog. An empty catalog here would let the next save
    // delete the real (corrupt-but-present) data permanently.
    let response = unlock_vault(&mut router, "correct-horse");
    assert!(
        !response.is_ok(),
        "expected unlock to error on corrupt catalog, got success (empty-vault data-loss path)"
    );
}
