use std::time::SystemTime;

use dav_server::fs::{DavDirEntry, DavMetaData, FsFuture, FsResult};

#[derive(Debug, Clone)]
pub(crate) struct CatalogMeta {
    pub(crate) len: u64,
    pub(crate) is_dir: bool,
    pub(crate) modified: SystemTime,
}

impl DavMetaData for CatalogMeta {
    fn len(&self) -> u64 {
        self.len
    }

    fn modified(&self) -> FsResult<SystemTime> {
        Ok(self.modified)
    }

    fn is_dir(&self) -> bool {
        self.is_dir
    }

    #[cfg(feature = "caldav")]
    fn is_calendar(&self, _path: &DavPath) -> bool {
        false
    }

    #[cfg(feature = "carddav")]
    fn is_addressbook(&self, _path: &DavPath) -> bool {
        false
    }
}

#[derive(Debug)]
pub(crate) struct CatalogDirEntry {
    pub(crate) name: Vec<u8>,
    pub(crate) meta: CatalogMeta,
}

impl DavDirEntry for CatalogDirEntry {
    fn name(&self) -> Vec<u8> {
        self.name.clone()
    }

    fn metadata(&'_ self) -> FsFuture<'_, Box<dyn DavMetaData>> {
        let meta = self.meta.clone();
        Box::pin(async move { Ok(Box::new(meta) as Box<dyn DavMetaData>) })
    }
}
