use std::{env, fs, path::Path};

fn hash_sources(path: &Path, hash: &mut blake3::Hasher) {
    if path.is_dir() {
        let mut entries: Vec<_> = fs::read_dir(path)
            .expect("source directory")
            .map(|entry| entry.expect("source entry").path())
            .collect();
        entries.sort();
        for entry in entries {
            hash_sources(&entry, hash);
        }
    } else if path.extension().is_some_and(|ext| ext == "rs") {
        println!("cargo:rerun-if-changed={}", path.display());
        hash.update(&fs::read(path).expect("source bytes"));
    }
}

fn main() {
    let mut hash = blake3::Hasher::new();
    hash_sources(Path::new("src"), &mut hash);
    hash_sources(Path::new("../client-runtime/src"), &mut hash);
    hash_sources(Path::new("../network-runtime/src"), &mut hash);
    hash_sources(Path::new("../media-runtime/src"), &mut hash);
    for path in [
        "../core/src/rpc/router/catalog_derivative_write",
        "../core/src/rpc/router/derivative_store",
        "../core/src/rpc/router/catalog_streams/file_streams/download",
        "../core/src/rpc/router/blob_range_reader.rs",
        "../core/src/rpc/commands/catalog/metadata.rs",
    ] {
        hash_sources(Path::new(path), &mut hash);
    }
    hash_sources(Path::new("../protocol/src"), &mut hash);
    hash_sources(Path::new("../core/src/rpc/types"), &mut hash);
    hash_sources(Path::new("../core/src/markdown"), &mut hash);
    hash_sources(Path::new("../core/src/payment_card"), &mut hash);
    hash_sources(
        Path::new("../core/src/rpc/router/catalog_media_inspect"),
        &mut hash,
    );
    hash_sources(Path::new("../core/src/media_inspector"), &mut hash);
    for path in [
        "Cargo.toml",
        "../client-runtime/Cargo.toml",
        "../network-runtime/Cargo.toml",
        "../media-runtime/Cargo.toml",
        "../protocol/Cargo.toml",
        "uniffi.toml",
        "../../Cargo.lock",
        "../../rust-toolchain.toml",
        "../../apps/IOS-air/scripts/generate-contracts.sh",
        "../../apps/IOS-air/tools/package.json",
        "../../apps/IOS-air/tools/bun.lock",
        "../../apps/Android-air/scripts/generate-contracts.sh",
        "../../apps/Android-air/tools/package.json",
        "../../apps/Android-air/tools/bun.lock",
    ] {
        println!("cargo:rerun-if-changed={path}");
        hash.update(&fs::read(path).expect("build input"));
    }
    println!(
        "cargo:rustc-env=AIR_BUILD_FINGERPRINT={}",
        hash.finalize().to_hex()
    );
    println!("cargo:rerun-if-env-changed=CARGO_FEATURE_FIXTURE");
    if env::var_os("CARGO_FEATURE_FIXTURE").is_some()
        && env::var("PROFILE").as_deref() == Ok("release")
    {
        panic!("The synthetic fixture is forbidden in release builds");
    }
}
