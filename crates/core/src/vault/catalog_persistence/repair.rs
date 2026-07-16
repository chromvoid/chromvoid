use serde::{Deserialize, Serialize};

#[cfg(feature = "ts-bindings")]
use ts_rs::TS;

use crate::catalog::{
    apply_delta, CatalogDeltaReplayFailure, DeltaApplyOutcome, DeltaEntry, LoadStrategy, RootIndex,
    Shard, ShardMeta, MAX_DELTAS,
};
use crate::crypto::{decrypt, delta_chunk_name, encrypt, root_index_chunk_name};
use crate::crypto::{sha256_hex, shard_snapshot_chunk_name};
use crate::error::{Error, Result};
use crate::storage::Storage;
use crate::types::KEY_SIZE;

use super::root_index::read_root_index;
use super::transaction::CatalogCommitService;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum CatalogRepairPolicy {
    LosslessOnly,
    AllowLossyConfirmed,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
#[serde(rename_all = "snake_case")]
pub enum CatalogRepairStatus {
    Clean,
    LosslessRequired,
    LosslessRepaired,
    LossyRequired,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
pub struct CatalogRepairIssue {
    pub shard_id: String,
    #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
    pub snapshot_seq: u64,
    #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
    pub base_version: u64,
    #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
    pub last_delta_seq: u64,
    #[cfg_attr(feature = "ts-bindings", ts(type = "number"))]
    pub safe_through_seq: u64,
    pub failure: CatalogDeltaReplayFailure,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
pub struct CatalogRepairDiagnosis {
    pub repair_id: Option<String>,
    pub status: CatalogRepairStatus,
    pub issues: Vec<CatalogRepairIssue>,
    pub lossy_requires_confirm: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
pub struct CatalogRepairOutcomeSummary {
    pub repair_id: String,
    pub status: CatalogRepairStatus,
    pub issues: Vec<CatalogRepairIssue>,
    pub lossy_applied: bool,
}

pub(in crate::vault) struct CatalogRepairService<'a> {
    storage: &'a Storage,
    vault_key: &'a [u8; KEY_SIZE],
}

impl<'a> CatalogRepairService<'a> {
    pub(in crate::vault) fn new(storage: &'a Storage, vault_key: &'a [u8; KEY_SIZE]) -> Self {
        Self { storage, vault_key }
    }

    pub(in crate::vault) fn diagnose(&self) -> Result<CatalogRepairDiagnosis> {
        CatalogCommitService::new(self.storage, self.vault_key).recover_incomplete_commit()?;

        let root_name = root_index_chunk_name(self.vault_key, 0);
        let Some(root_index) = read_root_index(self.storage, self.vault_key, &root_name)? else {
            return Ok(CatalogRepairDiagnosis::clean());
        };

        let mut shard_ids: Vec<&str> = root_index.shards.keys().map(String::as_str).collect();
        shard_ids.sort_unstable();

        let mut lossless_required = Vec::new();

        for shard_id in shard_ids {
            let Some(meta) = root_index.shards.get(shard_id) else {
                continue;
            };
            if let Some(issue) = self.diagnose_shard(meta)? {
                let repair_id = repair_id_for_issue(&issue);
                return Ok(CatalogRepairDiagnosis {
                    repair_id: Some(repair_id),
                    status: CatalogRepairStatus::LossyRequired,
                    issues: vec![issue],
                    lossy_requires_confirm: true,
                });
            }
            if delta_chain_needs_lossless_repair(meta) {
                lossless_required.push(shard_id.to_string());
            }
        }

        if !lossless_required.is_empty() {
            let repair_id = repair_id_for_lossless(&root_index, &lossless_required);
            return Ok(CatalogRepairDiagnosis {
                repair_id: Some(repair_id),
                status: CatalogRepairStatus::LosslessRequired,
                issues: Vec::new(),
                lossy_requires_confirm: false,
            });
        }

        Ok(CatalogRepairDiagnosis::clean())
    }

    pub(in crate::vault) fn diagnose_for_unlock_preflight(&self) -> Result<CatalogRepairDiagnosis> {
        CatalogCommitService::new(self.storage, self.vault_key).recover_incomplete_commit()?;

        let root_name = root_index_chunk_name(self.vault_key, 0);
        let Some(root_index) = read_root_index(self.storage, self.vault_key, &root_name)? else {
            return Ok(CatalogRepairDiagnosis::clean());
        };

        let mut shard_ids: Vec<&str> = root_index.shards.keys().map(String::as_str).collect();
        shard_ids.sort_unstable();

        let mut lossless_required = Vec::new();
        for shard_id in &shard_ids {
            let Some(meta) = root_index.shards.get(*shard_id) else {
                continue;
            };
            if delta_chain_needs_lossless_repair(meta) {
                lossless_required.push((*shard_id).to_string());
            }
        }

        if !lossless_required.is_empty() {
            return Ok(CatalogRepairDiagnosis {
                repair_id: Some(repair_id_for_lossless(&root_index, &lossless_required)),
                status: CatalogRepairStatus::LosslessRequired,
                issues: Vec::new(),
                lossy_requires_confirm: false,
            });
        }

        for shard_id in shard_ids {
            let Some(meta) = root_index.shards.get(shard_id) else {
                continue;
            };
            if meta.strategy != LoadStrategy::Eager {
                continue;
            }
            if let Some(issue) = self.diagnose_shard(meta)? {
                return Ok(CatalogRepairDiagnosis {
                    repair_id: Some(repair_id_for_issue(&issue)),
                    status: CatalogRepairStatus::LossyRequired,
                    issues: vec![issue],
                    lossy_requires_confirm: true,
                });
            }
        }

        Ok(CatalogRepairDiagnosis::clean())
    }

    #[cfg(test)]
    pub(in crate::vault) fn repair_lossless(&self) -> Result<Option<CatalogRepairOutcomeSummary>> {
        CatalogCommitService::new(self.storage, self.vault_key).recover_incomplete_commit()?;

        let root_name = root_index_chunk_name(self.vault_key, 0);
        let Some(root_index) = read_root_index(self.storage, self.vault_key, &root_name)? else {
            return Ok(None);
        };

        let mut repaired_root_index = root_index.clone();
        let mut new_chunks = Vec::new();
        let mut affected = Vec::new();
        let mut shard_ids: Vec<&str> = root_index.shards.keys().map(String::as_str).collect();
        shard_ids.sort_unstable();

        for shard_id in shard_ids {
            let Some(meta) = root_index.shards.get(shard_id) else {
                continue;
            };
            let Some((updated_meta, snapshot_name)) =
                self.prepare_lossless_snapshot_if_needed(meta, false)?
            else {
                continue;
            };
            repaired_root_index
                .shards
                .insert(updated_meta.shard_id.clone(), updated_meta);
            new_chunks.push(snapshot_name);
            affected.push(shard_id.to_string());
        }

        if affected.is_empty() {
            return Ok(None);
        }

        repaired_root_index.root_version = repaired_root_index.root_version.saturating_add(1);
        let repair_id = repair_id_for_lossless(&root_index, &affected);
        // Lossless repair compacts idempotent deltas into a fresh snapshot. Old
        // chunks are intentionally preserved; routine GC can remove them later.
        CatalogCommitService::new(self.storage, self.vault_key).commit_root_index_update(
            &repaired_root_index,
            new_chunks,
            Vec::new(),
            format!("catalog-repair-{}", sha256_hex(repair_id.as_bytes())),
        )?;

        Ok(Some(CatalogRepairOutcomeSummary {
            repair_id,
            status: CatalogRepairStatus::LosslessRepaired,
            issues: Vec::new(),
            lossy_applied: false,
        }))
    }

    pub(in crate::vault) fn apply(
        &self,
        repair_id: &str,
        policy: CatalogRepairPolicy,
    ) -> Result<CatalogRepairOutcomeSummary> {
        CatalogCommitService::new(self.storage, self.vault_key).recover_incomplete_commit()?;

        let root_name = root_index_chunk_name(self.vault_key, 0);
        let Some(root_index) = read_root_index(self.storage, self.vault_key, &root_name)? else {
            return Err(Error::CatalogRepairStale);
        };

        let diagnosis = self.diagnose()?;
        let Some(current_repair_id) = diagnosis.repair_id.clone() else {
            return Err(Error::CatalogRepairStale);
        };
        if current_repair_id != repair_id {
            return Err(Error::CatalogRepairStale);
        }

        if diagnosis.status == CatalogRepairStatus::LosslessRequired {
            return self.apply_lossless_required(&root_index, repair_id);
        }

        match policy {
            CatalogRepairPolicy::LosslessOnly => {
                return Err(Error::CatalogRepairUnsafe(
                    "lossy catalog repair requires explicit confirmation".to_string(),
                ))
            }
            CatalogRepairPolicy::AllowLossyConfirmed => {}
        }

        let Some(issue) = diagnosis.issues.first() else {
            return Err(Error::CatalogRepairStale);
        };

        let (mut repaired_root_index, snapshot_name) =
            self.prepare_lossy_snapshot(&root_index, issue)?;
        repaired_root_index.root_version = repaired_root_index.root_version.saturating_add(1);

        // Lossy repair must not delete old chunks: they remain available for
        // later explicit recovery/GC decisions. Passing an empty old_chunks set
        // preserves durable commit semantics without chunk removal.
        CatalogCommitService::new(self.storage, self.vault_key).commit_root_index_update(
            &repaired_root_index,
            vec![snapshot_name],
            Vec::new(),
            format!("catalog-repair-{}", sha256_hex(repair_id.as_bytes())),
        )?;

        Ok(CatalogRepairOutcomeSummary {
            repair_id: repair_id.to_string(),
            status: CatalogRepairStatus::LossyRequired,
            issues: diagnosis.issues,
            lossy_applied: true,
        })
    }

    fn apply_lossless_required(
        &self,
        root_index: &RootIndex,
        repair_id: &str,
    ) -> Result<CatalogRepairOutcomeSummary> {
        let mut affected: Vec<String> = root_index
            .shards
            .values()
            .filter(|meta| delta_chain_needs_lossless_repair(meta))
            .map(|meta| meta.shard_id.clone())
            .collect();
        affected.sort_unstable();

        if affected.is_empty() || repair_id_for_lossless(root_index, &affected) != repair_id {
            return Err(Error::CatalogRepairStale);
        }

        let mut repaired_root_index = root_index.clone();
        let mut new_chunks = Vec::new();
        for shard_id in &affected {
            let Some(meta) = root_index.shards.get(shard_id) else {
                return Err(Error::CatalogRepairStale);
            };
            let Some((updated_meta, snapshot_name)) =
                self.prepare_lossless_snapshot_if_needed(meta, true)?
            else {
                return Err(Error::CatalogRepairStale);
            };
            repaired_root_index
                .shards
                .insert(updated_meta.shard_id.clone(), updated_meta);
            new_chunks.push(snapshot_name);
        }

        repaired_root_index.root_version = repaired_root_index.root_version.saturating_add(1);
        CatalogCommitService::new(self.storage, self.vault_key).commit_root_index_update(
            &repaired_root_index,
            new_chunks,
            Vec::new(),
            format!("catalog-repair-{}", sha256_hex(repair_id.as_bytes())),
        )?;

        Ok(CatalogRepairOutcomeSummary {
            repair_id: repair_id.to_string(),
            status: CatalogRepairStatus::LosslessRepaired,
            issues: Vec::new(),
            lossy_applied: false,
        })
    }

    fn diagnose_shard(&self, meta: &ShardMeta) -> Result<Option<CatalogRepairIssue>> {
        if !meta.has_deltas {
            return Ok(None);
        }

        let mut shard = self.read_snapshot(meta)?;
        let mut safe_through_seq = meta.base_version;
        let from = meta.base_version.saturating_add(1);
        let to = meta.last_delta_seq;
        if from > to {
            return Ok(None);
        }

        for seq in from..=to {
            let delta = self.read_delta(&meta.shard_id, seq)?;
            match apply_delta(&mut shard.root, &delta) {
                Ok(_) => safe_through_seq = seq,
                Err(failure) => {
                    return Ok(Some(CatalogRepairIssue {
                        shard_id: meta.shard_id.clone(),
                        snapshot_seq: meta.snapshot_seq,
                        base_version: meta.base_version,
                        last_delta_seq: meta.last_delta_seq,
                        safe_through_seq,
                        failure,
                    }));
                }
            }
        }

        Ok(None)
    }

    fn prepare_lossy_snapshot(
        &self,
        root_index: &RootIndex,
        issue: &CatalogRepairIssue,
    ) -> Result<(RootIndex, String)> {
        let Some(meta) = root_index.shards.get(&issue.shard_id) else {
            return Err(Error::CatalogRepairStale);
        };
        if !issue_matches_meta(issue, meta) {
            return Err(Error::CatalogRepairStale);
        }

        let mut shard = self.read_snapshot(meta)?;
        let from = meta.base_version.saturating_add(1);
        if from <= issue.safe_through_seq {
            for seq in from..=issue.safe_through_seq {
                let delta = self.read_delta(&meta.shard_id, seq)?;
                apply_delta(&mut shard.root, &delta).map_err(Error::CatalogDeltaReplayFailed)?;
            }
        }

        let mut next_root_index = root_index.clone();
        let Some(next_meta) = next_root_index.shards.get_mut(&issue.shard_id) else {
            return Err(Error::CatalogRepairStale);
        };
        if !issue_matches_meta(issue, next_meta) {
            return Err(Error::CatalogRepairStale);
        }

        next_meta.version = issue.safe_through_seq;
        next_meta.base_version = issue.safe_through_seq;
        next_meta.has_deltas = false;
        next_meta.delta_count = 0;
        next_meta.last_delta_seq = issue.safe_through_seq;
        next_meta.snapshot_seq = meta.snapshot_seq.saturating_add(1);
        next_meta.update_stats(shard.node_count(), shard.size());
        next_meta.update_root_summary(&shard.root);

        shard.version = issue.safe_through_seq;
        shard.base_version = issue.safe_through_seq;

        let snapshot_name =
            shard_snapshot_chunk_name(self.vault_key, &issue.shard_id, next_meta.snapshot_seq);
        let plain = serde_json::to_vec(&shard)?;
        let enc = encrypt(&plain, self.vault_key, snapshot_name.as_bytes())?;
        self.storage.write_chunk_atomic(&snapshot_name, &enc)?;

        Ok((next_root_index, snapshot_name))
    }

    fn prepare_lossless_snapshot_if_needed(
        &self,
        meta: &ShardMeta,
        force_if_replayable: bool,
    ) -> Result<Option<(ShardMeta, String)>> {
        if !meta.has_deltas {
            return Ok(None);
        }

        let mut shard = self.read_snapshot(meta)?;
        let from = meta.base_version.saturating_add(1);
        let to = meta.last_delta_seq;
        if from > to {
            return Ok(None);
        }

        let mut should_compact = force_if_replayable;
        for seq in from..=to {
            let delta = self.read_delta(&meta.shard_id, seq)?;
            match apply_delta(&mut shard.root, &delta) {
                Ok(DeltaApplyOutcome::Applied) => {}
                Ok(DeltaApplyOutcome::AlreadyApplied) => should_compact = true,
                Err(failure) => return Err(Error::CatalogDeltaReplayFailed(failure)),
            }
        }

        if !should_compact {
            return Ok(None);
        }

        let mut updated_meta = meta.clone();
        updated_meta.version = meta.last_delta_seq;
        updated_meta.base_version = meta.last_delta_seq;
        updated_meta.has_deltas = false;
        updated_meta.delta_count = 0;
        updated_meta.last_delta_seq = meta.last_delta_seq;
        updated_meta.snapshot_seq = meta.snapshot_seq.saturating_add(1);
        updated_meta.update_stats(shard.node_count(), shard.size());
        updated_meta.update_root_summary(&shard.root);

        shard.version = meta.last_delta_seq;
        shard.base_version = meta.last_delta_seq;

        let snapshot_name =
            shard_snapshot_chunk_name(self.vault_key, &meta.shard_id, updated_meta.snapshot_seq);
        let plain = serde_json::to_vec(&shard)?;
        let enc = encrypt(&plain, self.vault_key, snapshot_name.as_bytes())?;
        self.storage.write_chunk_atomic(&snapshot_name, &enc)?;

        Ok(Some((updated_meta, snapshot_name)))
    }

    fn read_snapshot(&self, meta: &ShardMeta) -> Result<Shard> {
        let name = shard_snapshot_chunk_name(self.vault_key, &meta.shard_id, meta.snapshot_seq);
        let encrypted = self.storage.read_chunk(&name)?;
        let plaintext = decrypt(&encrypted, self.vault_key, name.as_bytes())?;
        Ok(serde_json::from_slice(&plaintext)?)
    }

    fn read_delta(&self, shard_id: &str, seq: u64) -> Result<DeltaEntry> {
        let name = delta_chunk_name(self.vault_key, shard_id, seq);
        let encrypted = self.storage.read_chunk(&name)?;
        let plaintext = decrypt(&encrypted, self.vault_key, name.as_bytes())?;
        Ok(serde_json::from_slice(&plaintext)?)
    }
}

impl CatalogRepairDiagnosis {
    fn clean() -> Self {
        Self {
            repair_id: None,
            status: CatalogRepairStatus::Clean,
            issues: Vec::new(),
            lossy_requires_confirm: false,
        }
    }
}

fn repair_id_for_issue(issue: &CatalogRepairIssue) -> String {
    format!(
        "catalog-repair-v1:{}:{}:{}:{}:{}",
        issue.shard_id,
        issue.snapshot_seq,
        issue.base_version,
        issue.last_delta_seq,
        issue.failure.seq
    )
}

fn repair_id_for_lossless(root_index: &RootIndex, affected: &[String]) -> String {
    format!(
        "catalog-repair-v1:lossless:{}:{}",
        root_index.root_version,
        sha256_hex(affected.join("|").as_bytes())
    )
}

fn delta_chain_needs_lossless_repair(meta: &ShardMeta) -> bool {
    meta.has_deltas
        && (pending_delta_window(meta) >= MAX_DELTAS as u64 || meta.delta_count >= MAX_DELTAS)
}

fn pending_delta_window(meta: &ShardMeta) -> u64 {
    if !meta.has_deltas || meta.last_delta_seq < meta.base_version {
        return 0;
    }

    meta.last_delta_seq.saturating_sub(meta.base_version)
}

fn issue_matches_meta(issue: &CatalogRepairIssue, meta: &ShardMeta) -> bool {
    issue.shard_id == meta.shard_id
        && issue.snapshot_seq == meta.snapshot_seq
        && issue.base_version == meta.base_version
        && issue.last_delta_seq == meta.last_delta_seq
}
