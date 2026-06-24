mod chunks;
mod compaction;
mod load;
mod repair;
mod root_index;
mod save;
mod transaction;
mod types;

pub(crate) use chunks::CatalogChunkSetService;
pub(in crate::vault) use compaction::CatalogCompactionService;
pub(in crate::vault) use load::CatalogLoadService;
pub use repair::{
    CatalogRepairDiagnosis, CatalogRepairIssue, CatalogRepairOutcomeSummary, CatalogRepairStatus,
};
pub(in crate::vault) use repair::{CatalogRepairPolicy, CatalogRepairService};
pub(in crate::vault) use save::CatalogSaveService;
