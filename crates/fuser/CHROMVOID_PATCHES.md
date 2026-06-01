# ChromVoid Fuser Patches

This vendored crate is based on:

- upstream: `https://github.com/cberner/fuser`
- commit: `2bdfbc53a116b9b4af5c91d20ab6a4f9b9004645`
- version: `0.17.0`

ChromVoid keeps this fork until the macFUSE rename protocol fix from
`cberner/fuser#453` is merged and released upstream.

Local deviations:

- `Cargo.toml` is adapted to live inside the ChromVoid root workspace, so the
  upstream nested `[workspace]` metadata is intentionally removed.
- macOS builds do not enable compile-time `macfuse-4-compat`; the request parser
  detects macFUSE 4.x and 5.x `FUSE_RENAME` formats at runtime.
- macOS init flags request `FUSE_RENAME_SWAP` and `FUSE_RENAME_EXCL`.
- The low-level `FUSE_RENAME` parser preserves rename flags for ChromVoid
  atomic save and exclusive rename flows.

The patch artifact for the macFUSE rename fix is stored at:

- `docs/fuser-macfuse-rename-pr-453.patch`
