//! Catalog CRUD command handlers.

mod crud;
mod deltas;
mod derivative;
mod exchange;
mod file_links;
mod metadata;
mod mutate;
mod notes;
mod paged_list;
mod trash;

pub use crud::{handle_catalog_create_dir, handle_catalog_list, handle_catalog_rename};
pub(in crate::rpc) use derivative::{
    handle_catalog_derivative_compact, handle_catalog_derivative_stats,
};
pub use exchange::handle_catalog_exchange;
pub use file_links::{handle_catalog_file_links_complete, handle_catalog_file_links_resolve};
pub use metadata::handle_catalog_source_metadata;
pub use mutate::{handle_catalog_delete, handle_catalog_move};
pub(in crate::rpc) use mutate::{
    handle_catalog_delete_with_cleanup, handle_catalog_move_with_cleanup,
};
pub use notes::handle_catalog_notes_list;
pub use paged_list::{handle_catalog_folder_batch, handle_catalog_folder_list};
pub(in crate::rpc) use trash::{
    handle_catalog_trash, handle_catalog_trash_empty_with_cleanup, handle_catalog_trash_list,
    handle_catalog_trash_restore,
};
