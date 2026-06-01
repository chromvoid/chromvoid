//! Catalog CRUD command handlers.

mod crud;
mod derivative;
mod metadata;
mod mutate;
mod notes;
mod paged_list;

pub use crud::{handle_catalog_create_dir, handle_catalog_list, handle_catalog_rename};
pub use derivative::{handle_catalog_derivative_compact, handle_catalog_derivative_stats};
pub use metadata::handle_catalog_source_metadata;
pub(in crate::rpc) use mutate::handle_catalog_delete_with_cleanup;
pub use mutate::{handle_catalog_delete, handle_catalog_move};
pub use notes::handle_catalog_notes_list;
pub use paged_list::{handle_catalog_folder_batch, handle_catalog_folder_list};
