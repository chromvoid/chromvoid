#![allow(dead_code)]

use std::collections::{HashMap, HashSet};
// Intentionally keep this module self-contained; FUSE ops pull in std::io::Read locally.
use std::sync::{Arc, Mutex, RwLock};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use crate::core_adapter::CoreAdapter;

/// FUSE reserves inode 1 for root.
const FUSE_ROOT_ID: u64 = 1;
const INO_OFFSET: u64 = 1;

/// TTL for cached attributes (short to keep consistency with catalog).
const ATTR_TTL: Duration = Duration::from_secs(1);

pub fn fuse_ino_from_catalog_node_id(node_id: u64) -> u64 {
    node_id.saturating_add(INO_OFFSET)
}

pub fn catalog_node_id_from_fuse_ino(ino: u64) -> Option<u64> {
    if ino <= FUSE_ROOT_ID {
        return None;
    }
    Some(ino - INO_OFFSET)
}

#[derive(Debug, Clone)]
pub struct InodeEntry {
    pub catalog_node_id: u64,
    pub name: String,
    pub parent_ino: u64,
    pub is_dir: bool,
    pub size: u64,
    pub modified: Option<SystemTime>,
}

#[derive(Debug, Default)]
pub struct InodeTable {
    entries: RwLock<HashMap<u64, InodeEntry>>,
}

impl InodeTable {
    pub fn get(&self, ino: u64) -> Option<InodeEntry> {
        match self.entries.read() {
            Ok(map) => map.get(&ino).cloned(),
            Err(_) => {
                tracing::warn!("FUSE inode table read lock poisoned");
                None
            }
        }
    }

    pub fn upsert(&self, entry: InodeEntry) {
        let ino = fuse_ino_from_catalog_node_id(entry.catalog_node_id);
        match self.entries.write() {
            Ok(mut map) => {
                map.insert(ino, entry);
            }
            Err(_) => {
                tracing::warn!("FUSE inode table write lock poisoned");
            }
        }
    }

    pub fn remove(&self, ino: u64) {
        match self.entries.write() {
            Ok(mut map) => {
                map.remove(&ino);
            }
            Err(_) => {
                tracing::warn!("FUSE inode table write lock poisoned");
            }
        }
    }

    /// Find a child by parent inode and name.
    pub fn find_child(&self, parent_ino: u64, name: &str) -> Option<InodeEntry> {
        match self.entries.read() {
            Ok(map) => map
                .values()
                .find(|e| e.parent_ino == parent_ino && e.name == name)
                .cloned(),
            Err(_) => {
                tracing::warn!("FUSE inode table read lock poisoned");
                None
            }
        }
    }

    /// List all children of `parent_ino` from the cache.
    pub fn children(&self, parent_ino: u64) -> Vec<InodeEntry> {
        match self.entries.read() {
            Ok(map) => map
                .values()
                .filter(|e| e.parent_ino == parent_ino)
                .cloned()
                .collect(),
            Err(_) => {
                tracing::warn!("FUSE inode table read lock poisoned");
                Vec::new()
            }
        }
    }

    /// Remove cached children for `parent_ino` that are not present in `keep_names`.
    ///
    /// This is used to avoid stale inode cache entries when the catalog is modified
    /// outside of FUSE (e.g. via WebView RPC while mounted).
    pub fn retain_children(&self, parent_ino: u64, keep_names: &HashSet<String>) {
        let mut map = match self.entries.write() {
            Ok(m) => m,
            Err(_) => {
                tracing::warn!("FUSE inode table write lock poisoned");
                return;
            }
        };

        let mut to_remove: Vec<u64> = Vec::new();
        for (ino, entry) in map.iter() {
            if entry.parent_ino == parent_ino && !keep_names.contains(&entry.name) {
                to_remove.push(*ino);
            }
        }
        for ino in to_remove {
            map.remove(&ino);
        }
    }
}

fn ms_to_system_time(ms: u64) -> SystemTime {
    UNIX_EPOCH
        .checked_add(Duration::from_millis(ms))
        .unwrap_or(SystemTime::now())
}

#[cfg(any(target_os = "linux", target_os = "macos"))]
mod imp;

#[cfg(any(target_os = "linux", target_os = "macos"))]
pub use imp::{start_fuse_server, start_fuse_server_with_app};

#[cfg(test)]
mod tests {
    use super::*;

    fn entry(node_id: u64, name: &str, parent_ino: u64, is_dir: bool) -> InodeEntry {
        InodeEntry {
            catalog_node_id: node_id,
            name: name.to_string(),
            parent_ino,
            is_dir,
            size: 0,
            modified: None,
        }
    }

    fn poison_inode_table_for_test(table: &InodeTable) {
        let _ = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            let _guard = table.entries.write().expect("inode table lock");
            panic!("poison inode table for test");
        }));
    }

    #[test]
    fn inode_mapping_offsets_catalog_ids() {
        assert_eq!(fuse_ino_from_catalog_node_id(1), 2);
        assert_eq!(fuse_ino_from_catalog_node_id(2), 3);
    }

    #[test]
    fn inode_mapping_rejects_root() {
        assert_eq!(catalog_node_id_from_fuse_ino(1), None);
        assert_eq!(catalog_node_id_from_fuse_ino(0), None);
    }

    #[test]
    fn inode_mapping_roundtrip() {
        for node_id in [1_u64, 2, 42, 1_000_000] {
            let ino = fuse_ino_from_catalog_node_id(node_id);
            assert_eq!(catalog_node_id_from_fuse_ino(ino), Some(node_id));
        }
    }

    #[test]
    fn inode_table_upsert_and_get() {
        let table = InodeTable::default();
        let mut entry = entry(7, "a.txt", FUSE_ROOT_ID, false);
        entry.size = 123;
        let ino = fuse_ino_from_catalog_node_id(entry.catalog_node_id);
        table.upsert(entry);
        let got = table.get(ino).expect("entry");
        assert_eq!(got.catalog_node_id, 7);
        assert_eq!(got.name, "a.txt");
        assert_eq!(got.size, 123);
    }

    #[test]
    fn inode_table_find_child() {
        let table = InodeTable::default();
        table.upsert(entry(5, "docs", FUSE_ROOT_ID, true));
        let mut readme = entry(10, "readme.md", FUSE_ROOT_ID, false);
        readme.size = 256;
        table.upsert(readme);

        let found = table
            .find_child(FUSE_ROOT_ID, "docs")
            .expect("should find docs");
        assert_eq!(found.catalog_node_id, 5);
        assert!(found.is_dir);

        let found2 = table
            .find_child(FUSE_ROOT_ID, "readme.md")
            .expect("should find readme");
        assert_eq!(found2.catalog_node_id, 10);

        assert!(table.find_child(FUSE_ROOT_ID, "nonexistent").is_none());
    }

    #[test]
    fn inode_table_children_returns_cached_children() {
        let table = InodeTable::default();
        table.upsert(entry(5, "docs", FUSE_ROOT_ID, true));
        table.upsert(entry(10, "readme.md", FUSE_ROOT_ID, false));

        let mut names = table
            .children(FUSE_ROOT_ID)
            .into_iter()
            .map(|entry| entry.name)
            .collect::<Vec<_>>();
        names.sort();

        assert_eq!(names, vec!["docs", "readme.md"]);
    }

    #[test]
    fn inode_table_poisoned_read_fallbacks_remain_empty() {
        let table = InodeTable::default();
        table.upsert(entry(5, "docs", FUSE_ROOT_ID, true));
        poison_inode_table_for_test(&table);

        assert!(table.get(fuse_ino_from_catalog_node_id(5)).is_none());
        assert!(table.find_child(FUSE_ROOT_ID, "docs").is_none());
        assert!(table.children(FUSE_ROOT_ID).is_empty());
    }

    #[test]
    fn inode_table_poisoned_write_fallbacks_do_not_panic() {
        let table = InodeTable::default();
        poison_inode_table_for_test(&table);

        table.upsert(entry(5, "docs", FUSE_ROOT_ID, true));
        table.remove(fuse_ino_from_catalog_node_id(5));
        table.retain_children(FUSE_ROOT_ID, &HashSet::new());
    }

    #[test]
    fn test_atomic_save_pattern_params() {
        use std::ffi::OsStr;

        let parent: u64 = 1;
        let temp_name = OsStr::new(".document.txt.tmp");
        let target_name = OsStr::new("document.txt");
        let _flags: u32 = 0;

        assert!(temp_name.to_str().is_some());
        assert!(target_name.to_str().is_some());
        assert_ne!(temp_name, target_name);

        let is_noop = parent == parent && temp_name == target_name;
        assert!(!is_noop);
    }

    #[test]
    fn test_rename_flag_swap_bit() {
        #[cfg(target_os = "macos")]
        {
            const FLAG_SWAP: u32 = libc::RENAME_SWAP as u32;
            let flags: u32 = FLAG_SWAP;
            assert!((flags & FLAG_SWAP) != 0);
        }

        #[cfg(target_os = "linux")]
        {
            const FLAG_SWAP: u32 = libc::RENAME_EXCHANGE as u32;
            let flags: u32 = FLAG_SWAP;
            assert!((flags & FLAG_SWAP) != 0);
        }
    }

    #[test]
    fn test_rename_flag_excl_bit() {
        #[cfg(target_os = "macos")]
        {
            const FLAG_EXCL: u32 = libc::RENAME_EXCL as u32;
            let flags: u32 = FLAG_EXCL;
            assert!((flags & FLAG_EXCL) != 0);
        }

        #[cfg(target_os = "linux")]
        {
            const FLAG_EXCL: u32 = libc::RENAME_NOREPLACE as u32;
            let flags: u32 = FLAG_EXCL;
            assert!((flags & FLAG_EXCL) != 0);
        }
    }

    #[test]
    fn test_common_atomic_save_filenames() {
        use std::ffi::OsStr;

        let patterns = [
            (".file.txt.tmp", "file.txt"),
            ("file.txt.swp", "file.txt"),
            ("file.txt~", "file.txt"),
            (".~lock.file.txt#", "file.txt"),
        ];

        for (temp, target) in patterns {
            let temp_os = OsStr::new(temp);
            let target_os = OsStr::new(target);
            assert!(temp_os.to_str().is_some());
            assert!(target_os.to_str().is_some());
            assert_ne!(temp_os, target_os);
        }
    }
}
