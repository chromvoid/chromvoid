//! Recursive walk of `/.passmanager` to build credential-provider entries.

use std::collections::HashMap;

use crate::rpc::router::credential_provider::error::CredentialProviderCommandError;
use crate::vault::VaultSession;

use super::super::credential_types::{CredentialProviderEntry, PassmanagerCredentialMeta};
use super::super::state::RpcRouter;
use super::diagnostics::CredentialProviderCollectionDiagnostics;

enum CredentialProviderEntryProbe {
    Entry(CredentialProviderEntry),
    Skip {
        reason: &'static str,
        details: Option<serde_json::Value>,
    },
}

impl RpcRouter {
    fn credential_provider_probe_entry_from_node(
        &self,
        session: &VaultSession,
        dir_node: &crate::catalog::CatalogNode,
    ) -> CredentialProviderEntryProbe {
        let Some(meta_node) = dir_node.find_child("meta.json") else {
            return CredentialProviderEntryProbe::Skip {
                reason: "meta_missing",
                details: None,
            };
        };
        if !meta_node.is_file() {
            return CredentialProviderEntryProbe::Skip {
                reason: "meta_not_file",
                details: None,
            };
        }

        let meta_bytes = self
            .read_file_plain(session.vault_key(), meta_node.node_id)
            .ok()
            .ok_or(CredentialProviderEntryProbe::Skip {
                reason: "meta_read_failed",
                details: None,
            });
        let Ok(meta_bytes) = meta_bytes else {
            return CredentialProviderEntryProbe::Skip {
                reason: "meta_read_failed",
                details: None,
            };
        };
        let fallback_entry_id = format!("entry-{}", dir_node.node_id);
        let fallback_label = dir_node.name.clone();
        let meta = match PassmanagerCredentialMeta::decode(
            &meta_bytes,
            &fallback_entry_id,
            &fallback_label,
        ) {
            Ok(meta) => meta,
            Err(error) => {
                return CredentialProviderEntryProbe::Skip {
                    reason: "meta_parse_failed",
                    details: Some(error.diagnostics()),
                };
            }
        };

        if meta.is_payment_card {
            return CredentialProviderEntryProbe::Skip {
                reason: "payment_card",
                details: None,
            };
        }

        let domain = meta
            .url_rules
            .iter()
            .filter_map(|r| Self::credential_provider_parse_rule_url(&r.value))
            .filter_map(|u| {
                u.host_str()
                    .map(Self::credential_provider_normalize_hostname)
            })
            .find(|d| !d.is_empty());

        let password_node_id = dir_node
            .find_child(".password")
            .filter(|n| n.is_file())
            .map(|n| n.node_id);
        let credential_id = meta.entry_id.clone();

        CredentialProviderEntryProbe::Entry(CredentialProviderEntry {
            credential_id,
            entry_id: meta.entry_id,
            label: meta.label,
            username: meta.username,
            domain,
            app_id: meta.app_id,
            entry_node_id: dir_node.node_id,
            password_node_id,
            otp_options: meta.otp_options,
            url_rules: meta.url_rules,
        })
    }

    pub(in crate::rpc::router) fn credential_provider_entry_from_node(
        &self,
        session: &VaultSession,
        dir_node: &crate::catalog::CatalogNode,
    ) -> Option<CredentialProviderEntry> {
        match self.credential_provider_probe_entry_from_node(session, dir_node) {
            CredentialProviderEntryProbe::Entry(entry) => Some(entry),
            CredentialProviderEntryProbe::Skip { .. } => None,
        }
    }

    fn credential_provider_collect_entries_recursive(
        &self,
        session: &VaultSession,
        node: &crate::catalog::CatalogNode,
        out: &mut Vec<CredentialProviderEntry>,
        mut diagnostics: Option<&mut CredentialProviderCollectionDiagnostics>,
    ) {
        for child in node.children() {
            if !child.is_dir() {
                continue;
            }
            let child_path = session
                .catalog()
                .get_path(child.node_id)
                .unwrap_or_else(|| format!("#{}", child.node_id));

            if let Some(diagnostics) = diagnostics.as_deref_mut() {
                diagnostics.visited_dir_count += 1;
                match self.credential_provider_probe_entry_from_node(session, child) {
                    CredentialProviderEntryProbe::Entry(entry) => {
                        diagnostics.meta_file_count += 1;
                        diagnostics.built_entry_count += 1;
                        out.push(entry);
                    }
                    CredentialProviderEntryProbe::Skip { reason, details } => {
                        if matches!(
                            reason,
                            "meta_read_failed" | "meta_parse_failed" | "payment_card"
                        ) {
                            diagnostics.meta_file_count += 1;
                        }
                        diagnostics.record_skip(child_path, reason, details);
                    }
                }
                self.credential_provider_collect_entries_recursive(
                    session,
                    child,
                    out,
                    Some(diagnostics),
                );
            } else {
                if let Some(entry) = self.credential_provider_entry_from_node(session, child) {
                    out.push(entry);
                }
                self.credential_provider_collect_entries_recursive(session, child, out, None);
            }
        }
    }

    fn credential_provider_disambiguate_duplicate_ids(
        &self,
        entries: &mut [CredentialProviderEntry],
    ) {
        let mut counts = HashMap::<String, usize>::new();
        for entry in entries.iter() {
            *counts.entry(entry.credential_id.clone()).or_insert(0) += 1;
        }

        for entry in entries.iter_mut() {
            if counts.get(&entry.credential_id).copied().unwrap_or(0) > 1 {
                entry.credential_id = format!("{}@{}", entry.credential_id, entry.entry_node_id);
            }
        }
    }

    pub(in crate::rpc::router) fn credential_provider_collect_entries(
        &self,
    ) -> Result<Vec<CredentialProviderEntry>, CredentialProviderCommandError> {
        let Some(session) = self.session.as_ref() else {
            return Err(CredentialProviderCommandError::vault_required());
        };

        let Some(pm_root) = session.catalog().find_by_path("/.passmanager") else {
            return Ok(Vec::new());
        };

        let mut out: Vec<CredentialProviderEntry> = Vec::new();
        self.credential_provider_collect_entries_recursive(session, pm_root, &mut out, None);
        self.credential_provider_disambiguate_duplicate_ids(&mut out);
        Ok(out)
    }

    pub(in crate::rpc::router) fn credential_provider_collect_entries_with_diagnostics(
        &self,
    ) -> Result<
        (
            Vec<CredentialProviderEntry>,
            CredentialProviderCollectionDiagnostics,
        ),
        CredentialProviderCommandError,
    > {
        let Some(session) = self.session.as_ref() else {
            return Err(CredentialProviderCommandError::vault_required());
        };

        let mut diagnostics = CredentialProviderCollectionDiagnostics::default();
        let Some(pm_root) = session.catalog().find_by_path("/.passmanager") else {
            return Ok((Vec::new(), diagnostics));
        };

        diagnostics.pm_root_found = true;
        diagnostics.pm_root_child_count = pm_root.children().len();

        let mut out: Vec<CredentialProviderEntry> = Vec::new();
        self.credential_provider_collect_entries_recursive(
            session,
            pm_root,
            &mut out,
            Some(&mut diagnostics),
        );
        self.credential_provider_disambiguate_duplicate_ids(&mut out);
        diagnostics.built_entry_count = out.len();
        Ok((out, diagnostics))
    }
}
