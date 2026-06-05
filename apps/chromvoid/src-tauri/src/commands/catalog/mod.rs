mod download;
mod file_ops;
pub(crate) mod image_import_provenance;
mod secret;
pub(crate) mod source_metadata;
mod upload;

pub(crate) use download::catalog_download;
#[cfg(desktop)]
pub(crate) use download::catalog_download_path;
pub(crate) use download::catalog_image_metadata;
pub(crate) use download::catalog_open_external;
pub(crate) use download::catalog_preview_image;
pub(crate) use download::catalog_save_image_to_gallery;
pub(crate) use download::catalog_share_files;
pub(crate) use download::catalog_thumbnail_image;
pub(crate) use download::prepare_catalog_preview_file;
pub(crate) use download::purge_catalog_preview_cache;
pub(crate) use download::purge_catalog_preview_cache_for_app;
pub(crate) use download::release_catalog_preview_file;
pub(crate) use download::{
    handle_prepared_preview_protocol_request, PreparedPreviewRuntimeState, PREPARED_PREVIEW_SCHEME,
};
#[cfg(desktop)]
pub(crate) use file_ops::file_stat;
pub(crate) use file_ops::write_text_file;
pub(crate) use secret::{catalog_secret_read, catalog_secret_write_chunk};
#[cfg(desktop)]
pub(crate) use upload::catalog_upload_path;
#[cfg(target_os = "android")]
pub(crate) use upload::catalog_upload_request_data;
#[cfg(mobile)]
pub(crate) use upload::{
    catalog_cancel_android_shared_files, catalog_cancel_native_upload, catalog_cancel_shared_files,
    catalog_list_shared_files, catalog_upload_android_shared_files, catalog_upload_native_files,
    catalog_upload_shared_files,
};
pub(crate) use upload::{catalog_file_replace, catalog_upload_chunk};
