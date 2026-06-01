mod commands;
mod derivatives;
mod external;
mod gallery;
mod image_metadata;
mod preview;
mod rpc;
mod staging;
#[cfg(test)]
mod tests;

type CatalogDownloadError = (String, Option<String>);
type GallerySaveError = CatalogDownloadError;

pub(crate) use commands::catalog_download;
#[cfg(desktop)]
pub(crate) use commands::catalog_download_path;
pub(crate) use commands::catalog_image_metadata;
pub(crate) use commands::catalog_open_external;
pub(crate) use commands::catalog_preview_image;
pub(crate) use commands::catalog_save_image_to_gallery;
pub(crate) use commands::catalog_share_files;
pub(crate) use commands::catalog_thumbnail_image;
pub(crate) use commands::prepare_catalog_preview_file;
pub(crate) use commands::purge_catalog_preview_cache;
pub(crate) use commands::release_catalog_preview_file;
pub(crate) use preview::purge_catalog_preview_cache_for_app;
pub(crate) use preview::{
    handle_prepared_preview_protocol_request, PreparedPreviewRuntimeState, PREPARED_PREVIEW_SCHEME,
};
