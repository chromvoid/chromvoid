# ChromVoid KeePass reader

Source: [`keepass` 0.13.25](https://crates.io/crates/keepass/0.13.25),
[upstream repository](https://github.com/sseemayer/keepass-rs).
Published `.crate` SHA-256: `f8161ba5159f649a4899e46aa084130263a7af722116ead3faec24e5ee92a7b9`.
Upstream MIT license is retained in `LICENSE`; `Cargo.toml.orig` is unmodified.
This directory contains the published library sources, manifests, README and license.
ChromVoid enables only the local `bounded-import` feature; upstream optional features remain off.

`chromvoid.patch` is the exact diff against that published archive. Apply it with
`patch -p1 < chromvoid.patch` from a freshly extracted archive. Regenerate the patch
when changing a source file, including the normalized Cargo manifest.

## Local changes

- `bounded-import` limits encrypted input to 50 MiB (native transfer remains 16 MiB), expanded payload/XML to 32 MiB,
  and aggregate imported binary attachment data to 32 MiB. Each compressed binary
  is also bounded before conversion. These are input/allocation bounds, not a total
  process RSS guarantee; concurrent intermediate buffers can coexist.
- Before deserialization, standard XML event parsing checks depth (64), nodes
  (500,000) and rejects DTDs. Existing XML parsing remains responsible for the format.
- Before key derivation, AES rounds are capped at 10 million. Argon2 is capped at
  128 MiB memory, 32 iterations, 16 lanes and 1 GiB memory × iterations. These bounds
  reject expensive source files; they are not wall-clock deadlines or cancellation
  inside a running cryptographic primitive.
- Correct the published AES dependency range from `<0.9.3` to `>=0.9.0, <0.9.3`.
  Upstream uses cipher 0.5 traits; selecting the workspace's existing AES 0.8 version
  fails compilation. AES 0.9.2 satisfies the existing API. Algorithms are unchanged.
- Preserve KDBX3 XML binary IDs when constructing attachment references. Upstream
  allocates IDs before populating the database and collapses distinct attachments
  onto ID zero. With bounded import enabled, duplicate binary IDs reject the file.
- Preserve missing custom icon references under bounded import so Core can report
  omitted icons rather than silently replacing them with a built-in icon.

Core owns conversion to ChromVoid credentials, source identity, warnings and atomic
storage transactions. This dependency does not expose a second product import API.
Source passwords are transient; no claim is made that every allocation in upstream
or platform frameworks is zeroized.

## Verification

`crates/core/tests/passmanager_domain_rpc/keepass_import_flows.rs` uses independently
generated synthetic KDBX3/4 files. It verifies exact secrets, distinct attachment IDs,
groups/OTP/icons, repeated import, wrong passwords/corruption without mutation and
rejection of excessive AES/Argon2 parameters, expanded gzip and XML depth.
Additional fixtures verify an explicitly empty password and valid Argon2id derivation
using OpenSSL 3 through the independent KDBX writer.
Fixture writer and provenance are in the adjacent `fixtures/generate-keepass.ts`.
