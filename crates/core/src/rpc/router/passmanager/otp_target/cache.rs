use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::sync::Mutex;

use crate::storage::Storage;
use crate::vault::VaultSession;

use super::error::OtpTargetError;
use super::resolver::resolve_from_entries;
use super::scanner::{collect_passmanager_meta_stamp, walk_collect};
use super::types::{
    CachedEntryMeta, PassmanagerMetaStamp, PassmanagerOtpTargetCache, PassmanagerOtpTargetRequest,
    ResolvedOtpTarget,
};

pub(in crate::rpc::router) fn resolve_with_cache(
    cache: &Mutex<PassmanagerOtpTargetCache>,
    session: &VaultSession,
    storage: &Storage,
    request: PassmanagerOtpTargetRequest<'_>,
    force_refresh: bool,
) -> Result<Option<ResolvedOtpTarget>, OtpTargetError> {
    let Some(pm_root) = session.catalog().find_by_path("/.passmanager") else {
        return Ok(None);
    };

    let vault_key = session.vault_key();
    let storage_ptr = storage as *const Storage as usize;
    let cache_key = vault_fingerprint(vault_key);
    let mut stamp = Vec::<PassmanagerMetaStamp>::new();
    collect_passmanager_meta_stamp(pm_root, &mut stamp);

    let entries = match cache.lock() {
        Ok(mut guard) => {
            if force_refresh
                || !(guard.ready
                    && guard.storage_ptr == storage_ptr
                    && guard.vault_fingerprint == cache_key
                    && guard.stamp == stamp)
            {
                let mut rebuilt = Vec::<CachedEntryMeta>::new();
                walk_collect(pm_root, vault_key, storage, &mut rebuilt)?;
                guard.storage_ptr = storage_ptr;
                guard.vault_fingerprint = cache_key;
                guard.stamp = stamp;
                guard.entries = rebuilt;
                guard.ready = true;
            }
            guard.entries.clone()
        }
        Err(_) => {
            let mut rebuilt = Vec::<CachedEntryMeta>::new();
            walk_collect(pm_root, vault_key, storage, &mut rebuilt)?;
            rebuilt
        }
    };

    Ok(resolve_from_entries(&entries, request))
}

fn vault_fingerprint(vault_key: &[u8; 32]) -> u64 {
    let mut hasher = DefaultHasher::new();
    vault_key.hash(&mut hasher);
    hasher.finish()
}
