use super::records::WalletMetaV1;

pub fn account_summary_from_meta(meta: &WalletMetaV1) -> crate::rpc::types::WalletSummary {
    crate::rpc::types::WalletSummary {
        wallet_id: meta.wallet_id.clone(),
        kind: meta.kind.clone(),
        label: meta.label.clone(),
        wallet_mode: (meta.kind == "hd").then(|| meta.wallet_mode.clone()),
        mnemonic_standard: meta.mnemonic_standard.clone(),
        supported_networks: meta.supported_networks.clone(),
        bitcoin_discovery_pending: meta.needs_bitcoin_discovery().then_some(true),
        created_at: meta.created_at,
        updated_at: meta.updated_at,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::rpc::types::WalletNetwork;

    fn bitcoin_hd_wallet(discovery_pending: Option<bool>) -> WalletMetaV1 {
        WalletMetaV1 {
            wallet_id: "wallet-1".to_string(),
            kind: "hd".to_string(),
            label: "Wallet".to_string(),
            wallet_mode: "multichain".to_string(),
            mnemonic_standard: "bip39".to_string(),
            supported_networks: vec![WalletNetwork::from("bitcoin")],
            bitcoin_discovery_pending: discovery_pending,
            secret_ref: "secret-1".to_string(),
            created_at: 1,
            updated_at: 1,
        }
    }

    #[test]
    fn legacy_hd_bitcoin_wallet_requires_one_discovery_pass() {
        let summary = account_summary_from_meta(&bitcoin_hd_wallet(None));

        assert_eq!(summary.bitcoin_discovery_pending, Some(true));
    }

    #[test]
    fn completed_hd_bitcoin_wallet_omits_discovery_marker() {
        let summary = account_summary_from_meta(&bitcoin_hd_wallet(Some(false)));

        assert_eq!(summary.bitcoin_discovery_pending, None);
    }
}
