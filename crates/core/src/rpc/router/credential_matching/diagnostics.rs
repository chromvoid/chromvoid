//! Collection diagnostics for credential-provider entry walks.

#[derive(Default)]
pub(in crate::rpc::router) struct CredentialProviderCollectionDiagnostics {
    pub(in crate::rpc::router) pm_root_found: bool,
    pub(in crate::rpc::router) pm_root_child_count: usize,
    pub(in crate::rpc::router) visited_dir_count: usize,
    pub(in crate::rpc::router) meta_file_count: usize,
    pub(in crate::rpc::router) meta_missing_count: usize,
    pub(in crate::rpc::router) meta_not_file_count: usize,
    pub(in crate::rpc::router) meta_read_failed_count: usize,
    pub(in crate::rpc::router) meta_parse_failed_count: usize,
    pub(in crate::rpc::router) payment_card_count: usize,
    pub(in crate::rpc::router) built_entry_count: usize,
    sampled_skips: Vec<serde_json::Value>,
}

impl CredentialProviderCollectionDiagnostics {
    pub(in crate::rpc::router::credential_matching) fn record_skip(
        &mut self,
        path: String,
        reason: &'static str,
        details: Option<serde_json::Value>,
    ) {
        match reason {
            "meta_missing" => self.meta_missing_count += 1,
            "meta_not_file" => self.meta_not_file_count += 1,
            "meta_read_failed" => self.meta_read_failed_count += 1,
            "meta_parse_failed" => self.meta_parse_failed_count += 1,
            "payment_card" => self.payment_card_count += 1,
            _ => {}
        }

        if self.sampled_skips.len() < 20 {
            let mut payload = serde_json::json!({
                "path": path,
                "reason": reason,
            });
            if let Some(details) = details {
                payload["details"] = details;
            }
            self.sampled_skips.push(payload);
        }
    }

    pub(in crate::rpc::router) fn to_json(&self) -> serde_json::Value {
        serde_json::json!({
            "pm_root_found": self.pm_root_found,
            "pm_root_child_count": self.pm_root_child_count,
            "visited_dir_count": self.visited_dir_count,
            "meta_file_count": self.meta_file_count,
            "meta_missing_count": self.meta_missing_count,
            "meta_not_file_count": self.meta_not_file_count,
            "meta_read_failed_count": self.meta_read_failed_count,
            "meta_parse_failed_count": self.meta_parse_failed_count,
            "payment_card_count": self.payment_card_count,
            "built_entry_count": self.built_entry_count,
            "sampled_skips": self.sampled_skips,
        })
    }
}
