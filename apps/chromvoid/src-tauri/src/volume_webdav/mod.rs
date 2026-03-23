mod file;
mod filesystem;
mod metadata;
mod server;

#[cfg(test)]
mod tests;

const UPLOAD_PART_BYTES: u64 = 8 * 1024 * 1024;

pub use server::{start_webdav_server, WebDavServerHandle};
