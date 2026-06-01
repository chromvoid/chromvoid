//! Typed single-blob storage helpers for router domain files.

mod backups;
mod common;
mod erase_tx;
mod error;
mod markers;
mod read;
mod recovery;
mod write_tx;

#[cfg(test)]
#[allow(unused_imports)]
pub(super) use common::BlobWriteOutcome;
pub(in crate::rpc) use erase_tx::erase_single_blob_atomic;
#[allow(unused_imports)]
pub(in crate::rpc) use error::BlobIoError;
pub(super) use read::read_single_blob;
pub(super) use recovery::{
    recover_single_blob_erase_transaction, recover_single_blob_write_transaction,
};
#[cfg(test)]
pub(super) use write_tx::write_single_blob_atomic;
