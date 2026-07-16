use std::net::IpAddr;

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use url::Url;

use super::{hex_string, WalletChainError, WalletRuntimeConfig};

pub const TON_CONNECT_CAPABILITY: &str = "ton_connect_v1";
pub const TON_JETTON_CAPABILITY: &str = "ton_jettons_v1";
pub const TON_LEGACY_RESTORE_CAPABILITY: &str = "ton_legacy_restore_v1";
pub const TON_CONTRACT_RAW_CACHE_CAPABILITY: &str = "ton_contract_raw_cache_v1";
const TON_CONNECT_TIMESTAMP_TOLERANCE_SECONDS: u64 = 300;
const MAX_RAW_BOC_BYTES: usize = 128 * 1024;
const DEFAULT_SUBWALLET_ID: u32 = 698_983_191;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TonConnectMethodClass {
    Supported,
    Deferred,
    Rejected,
    Unknown,
}

pub fn classify_ton_connect_method(method: &str) -> TonConnectMethodClass {
    match method {
        "connect" | "disconnect" | "sendTransaction" | "signData" => {
            TonConnectMethodClass::Supported
        }
        "embeddedRequest" => TonConnectMethodClass::Deferred,
        "signMessage" | "signCell" | "signBinary" => TonConnectMethodClass::Rejected,
        _ => TonConnectMethodClass::Unknown,
    }
}

pub fn validate_ton_connect_manifest_url(
    manifest_url: &str,
    expected_origin: &str,
) -> Result<Url, WalletChainError> {
    let url = Url::parse(manifest_url).map_err(|error| {
        WalletChainError::invalid_input(format!("invalid manifest URL: {error}"))
    })?;
    if url.scheme() != "https"
        || !url.username().is_empty()
        || url.password().is_some()
        || url.fragment().is_some()
    {
        return Err(WalletChainError::invalid_input(
            "TON Connect manifest requires clean HTTPS URL",
        ));
    }
    let host = url
        .host_str()
        .ok_or_else(|| WalletChainError::invalid_input("TON Connect manifest host is required"))?;
    if host.eq_ignore_ascii_case("localhost")
        || host.ends_with(".localhost")
        || host.parse::<IpAddr>().is_ok_and(is_non_public_ip)
    {
        return Err(WalletChainError::invalid_input(
            "TON Connect manifest host is not public",
        ));
    }
    let expected = Url::parse(expected_origin).map_err(|error| {
        WalletChainError::invalid_input(format!("invalid dapp origin: {error}"))
    })?;
    if expected.scheme() != "https"
        || expected.host_str().map(str::to_ascii_lowercase) != Some(host.to_ascii_lowercase())
    {
        return Err(WalletChainError::invalid_input(
            "TON Connect manifest origin mismatch",
        ));
    }
    Ok(url)
}

pub fn validate_ton_connect_resolved_addresses(
    addresses: &[IpAddr],
) -> Result<(), WalletChainError> {
    if addresses.is_empty() || addresses.iter().copied().any(is_non_public_ip) {
        return Err(WalletChainError::invalid_input(
            "TON Connect manifest DNS resolution is not public",
        ));
    }
    Ok(())
}

fn is_non_public_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(ip) => {
            ip.is_private()
                || ip.is_loopback()
                || ip.is_link_local()
                || ip.is_broadcast()
                || ip.is_documentation()
                || ip.is_unspecified()
                || ip.octets()[0] == 0
        }
        IpAddr::V6(ip) => {
            ip.is_loopback()
                || ip.is_unspecified()
                || (ip.segments()[0] & 0xfe00) == 0xfc00
                || (ip.segments()[0] & 0xffc0) == 0xfe80
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct TonConnectTextSignIntentV1 {
    pub workchain: i32,
    pub address_hash: [u8; 32],
    pub domain: String,
    pub timestamp: u64,
    pub payload: String,
}

pub fn ton_connect_text_sign_digest(
    intent: &TonConnectTextSignIntentV1,
    now_seconds: u64,
) -> Result<[u8; 32], WalletChainError> {
    if intent.domain.is_empty() || intent.domain.len() > 255 || intent.payload.len() > 4096 {
        return Err(WalletChainError::invalid_input(
            "TON Connect text sign domain/payload limits exceeded",
        ));
    }
    if intent.timestamp.abs_diff(now_seconds) > TON_CONNECT_TIMESTAMP_TOLERANCE_SECONDS {
        return Err(WalletChainError::invalid_input(
            "TON Connect signData timestamp is outside tolerance",
        ));
    }
    let domain = intent.domain.as_bytes();
    let payload = intent.payload.as_bytes();
    let mut canonical = Vec::with_capacity(64 + domain.len() + payload.len());
    canonical.extend_from_slice(b"ton-connect/sign-data/text/v1");
    canonical.extend_from_slice(&intent.workchain.to_be_bytes());
    canonical.extend_from_slice(&intent.address_hash);
    canonical.push(domain.len() as u8);
    canonical.extend_from_slice(domain);
    canonical.extend_from_slice(&intent.timestamp.to_be_bytes());
    canonical.extend_from_slice(&(payload.len() as u32).to_be_bytes());
    canonical.extend_from_slice(payload);
    Ok(Sha256::digest(canonical).into())
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TonJettonMetadataTrust {
    Curated,
    UserAddedUntrusted,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct TonJettonWalletProofV1 {
    pub network_profile_id: String,
    pub owner_address: String,
    pub master_address: String,
    pub jetton_wallet_address: String,
    pub returned_owner_address: String,
    pub returned_master_address: String,
}

pub fn validate_jetton_wallet_proof(
    proof: &TonJettonWalletProofV1,
) -> Result<(), WalletChainError> {
    if proof.network_profile_id != "ton-mainnet" && proof.network_profile_id != "ton-testnet" {
        return Err(WalletChainError::unsupported_chain(
            "Jetton network profile is unsupported",
        ));
    }
    if proof.owner_address != proof.returned_owner_address
        || proof.master_address != proof.returned_master_address
        || proof.jetton_wallet_address.is_empty()
    {
        return Err(WalletChainError::preparation_stale(
            "Jetton wallet owner/master proof mismatch",
        ));
    }
    Ok(())
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TonLegacyWalletContractV1 {
    V4R2,
    V3R2,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct TonLegacyDiscoveryCandidateV1 {
    pub contract: TonLegacyWalletContractV1,
    pub account_index: u32,
    pub workchain: i32,
    pub subwallet_id: u32,
}

pub fn legacy_discovery_candidates(workchain: i32) -> Vec<TonLegacyDiscoveryCandidateV1> {
    let workchain_variant = if workchain >= 0 {
        DEFAULT_SUBWALLET_ID.saturating_add(workchain as u32)
    } else {
        DEFAULT_SUBWALLET_ID
    };
    let mut subwallet_ids = vec![DEFAULT_SUBWALLET_ID, workchain_variant];
    subwallet_ids.sort_unstable();
    subwallet_ids.dedup();
    let mut candidates = Vec::new();
    for contract in [
        TonLegacyWalletContractV1::V4R2,
        TonLegacyWalletContractV1::V3R2,
    ] {
        for account_index in 0..=4 {
            for subwallet_id in &subwallet_ids {
                candidates.push(TonLegacyDiscoveryCandidateV1 {
                    contract,
                    account_index,
                    workchain,
                    subwallet_id: *subwallet_id,
                });
            }
        }
    }
    candidates
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct TonRawPayloadPreviewV1 {
    pub destination: String,
    pub amount_nanoton: String,
    pub state_init_present: bool,
    pub payload_hash: String,
    pub decoded_opcode: Option<u32>,
    pub risk_class: String,
}

pub fn inspect_raw_payload(
    config: &WalletRuntimeConfig,
    destination: String,
    amount_nanoton: String,
    state_init_present: bool,
    payload: &[u8],
) -> Result<TonRawPayloadPreviewV1, WalletChainError> {
    if !config.capability_enabled(TON_CONTRACT_RAW_CACHE_CAPABILITY) {
        return Err(WalletChainError::unsupported_provider_surface(
            "TON raw payload capability is disabled",
        ));
    }
    if payload.is_empty() || payload.len() > MAX_RAW_BOC_BYTES {
        return Err(WalletChainError::invalid_input(
            "TON raw payload size is outside policy",
        ));
    }
    if amount_nanoton.is_empty() || !amount_nanoton.bytes().all(|byte| byte.is_ascii_digit()) {
        return Err(WalletChainError::invalid_input(
            "TON amount must be a nanoton integer string",
        ));
    }
    let decoded_opcode = payload
        .get(..4)
        .map(|bytes| u32::from_be_bytes(bytes.try_into().expect("four-byte opcode")));
    Ok(TonRawPayloadPreviewV1 {
        destination,
        amount_nanoton,
        state_init_present,
        payload_hash: format!("sha256:{}", hex_string(&Sha256::digest(payload))),
        decoded_opcode,
        risk_class: if state_init_present {
            "deploy_high_risk"
        } else {
            "opaque_high_risk"
        }
        .to_string(),
    })
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct TonUxCacheEntryV1 {
    pub network_profile_id: String,
    pub subject_id: String,
    pub provider_profile: String,
    pub source: String,
    pub fetched_at: u64,
    pub stale_after: u64,
    pub confidence: String,
}

impl TonUxCacheEntryV1 {
    pub fn validate_display_only(&self, now: u64) -> Result<bool, WalletChainError> {
        if self.network_profile_id.is_empty()
            || self.subject_id.is_empty()
            || self.provider_profile.is_empty()
            || self.source.is_empty()
            || self.stale_after < self.fetched_at
        {
            return Err(WalletChainError::invalid_input(
                "TON UX cache entry contract is invalid",
            ));
        }
        Ok(now >= self.stale_after)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn manifest_url_blocks_ssrf_and_origin_mismatch() {
        for url in [
            "http://example.com/manifest.json",
            "https://127.0.0.1/manifest.json",
            "https://10.0.0.1/manifest.json",
            "https://[::1]/manifest.json",
            "https://user@example.com/manifest.json",
        ] {
            assert!(validate_ton_connect_manifest_url(url, "https://example.com").is_err());
        }
        assert!(validate_ton_connect_manifest_url(
            "https://other.example/manifest.json",
            "https://example.com"
        )
        .is_err());
        assert!(validate_ton_connect_manifest_url(
            "https://example.com/tonconnect-manifest.json",
            "https://example.com"
        )
        .is_ok());
        assert!(validate_ton_connect_resolved_addresses(&["10.0.0.1".parse().unwrap()]).is_err());
        assert!(
            validate_ton_connect_resolved_addresses(&["93.184.216.34".parse().unwrap()]).is_ok()
        );
    }

    #[test]
    fn text_sign_digest_is_domain_bound_and_timestamp_bounded() {
        let intent = TonConnectTextSignIntentV1 {
            workchain: 0,
            address_hash: [7u8; 32],
            domain: "example.com".to_string(),
            timestamp: 1_000,
            payload: "Login".to_string(),
        };
        let digest = ton_connect_text_sign_digest(&intent, 1_100).expect("digest");
        let mut changed = intent.clone();
        changed.domain = "other.example".to_string();
        assert_ne!(
            digest,
            ton_connect_text_sign_digest(&changed, 1_100).unwrap()
        );
        assert!(ton_connect_text_sign_digest(&intent, 2_000).is_err());
    }

    #[test]
    fn legacy_candidate_set_is_bounded_and_deterministic() {
        let candidates = legacy_discovery_candidates(0);
        assert_eq!(candidates.len(), 10);
        assert_eq!(candidates, legacy_discovery_candidates(0));
        assert!(candidates
            .iter()
            .all(|candidate| candidate.account_index <= 4));
    }

    #[test]
    fn raw_payload_is_default_off_and_digest_bound_when_enabled() {
        let mut config = WalletRuntimeConfig::with_wallet_enabled(true);
        assert!(inspect_raw_payload(
            &config,
            "destination".to_string(),
            "1".to_string(),
            false,
            &[0, 0, 0, 1]
        )
        .is_err());
        config
            .enabled_capabilities
            .insert(TON_CONTRACT_RAW_CACHE_CAPABILITY.to_string());
        let preview = inspect_raw_payload(
            &config,
            "destination".to_string(),
            "1".to_string(),
            false,
            &[0, 0, 0, 1],
        )
        .expect("preview");
        assert_eq!(preview.decoded_opcode, Some(1));
        assert!(preview.payload_hash.starts_with("sha256:"));
    }
}
