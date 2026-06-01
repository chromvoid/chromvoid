//! Local backup/restore RPC handlers (`restore:local:*`).

mod cancel;
mod commit;
mod material;
mod models;
mod session;
mod validate;
mod validation;

#[cfg(test)]
mod tests;

pub(in crate::rpc::router::restore) use cancel::handle_restore_local_cancel;
pub(in crate::rpc::router) use cancel::rollback_restore_local;
pub(in crate::rpc::router::restore) use commit::handle_restore_local_commit;
pub(in crate::rpc::router::restore) use session::{
    handle_restore_local_start, handle_restore_local_upload_pack,
};
pub(in crate::rpc::router::restore) use validate::{
    handle_restore_local_validate, handle_restore_local_validate_master_material,
    handle_restore_local_validate_payload,
};
