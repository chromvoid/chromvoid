use std::path::PathBuf;

use super::fuse::FuseSessionHandle;
use crate::volume_webdav::WebDavServerHandle;

#[derive(Debug)]
pub enum VolumeBackendHandle {
    WebDav(WebDavServerHandle),
    Fuse(FuseSessionHandle),
}

impl VolumeBackendHandle {
    pub fn backend(&self) -> &'static str {
        match self {
            Self::WebDav(_) => "webdav",
            Self::Fuse(_) => "fuse",
        }
    }

    pub fn mountpoint(&self) -> String {
        match self {
            Self::WebDav(h) => h.url(),
            Self::Fuse(h) => h.mountpoint().to_string_lossy().to_string(),
        }
    }

    pub fn webdav_port(&self) -> Option<u16> {
        match self {
            Self::WebDav(h) => Some(h.addr.port()),
            Self::Fuse(_) => None,
        }
    }

    pub fn fuse_staging_dir(&self) -> Option<PathBuf> {
        match self {
            Self::Fuse(h) => Some(h.staging_dir().clone()),
            Self::WebDav(_) => None,
        }
    }

    pub fn shutdown(&mut self) {
        match self {
            Self::WebDav(h) => h.shutdown(),
            Self::Fuse(h) => h.shutdown(),
        }
    }

    pub async fn join(self) {
        match self {
            Self::WebDav(h) => h.join().await,
            Self::Fuse(h) => h.join().await,
        }
    }
}
