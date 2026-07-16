use std::collections::BTreeSet;

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
#[cfg(feature = "ts-bindings")]
use ts_rs::TS;

use super::ethereum::keccak256;
use super::{hex_string, parse_hex, WalletChainError};

pub const EVM_CLEAR_SIGNING_CAPABILITY: &str = "evm_clear_signing_v1";
pub const EVM_EVALUATOR_VERSION: &str = "evm-baseline-1";
const MAX_CALLDATA_BYTES: usize = 128 * 1024;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
#[serde(rename_all = "snake_case")]
pub enum EvmRiskLevel {
    Info,
    Caution,
    Danger,
    Blocked,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
#[serde(rename_all = "snake_case")]
pub enum EvmActionKind {
    NativeTransfer,
    TokenTransfer,
    TokenApproval,
    NftApproval,
    ContractCall,
    PersonalSign,
    TypedDataSign,
    Permit,
    Unknown,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
pub struct EvmRiskFindingV1 {
    pub code: String,
    pub level: EvmRiskLevel,
    pub hard_block: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
pub struct EvmPermissionEffectV1 {
    pub kind: String,
    pub spender: String,
    pub scope: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub amount_base_units: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub asset_address: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
pub struct EvmVerificationV1 {
    pub status: String,
    pub decoder_source: String,
    pub simulation_status: String,
    pub confidence: String,
    pub evaluator_version: String,
    pub evaluated_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
pub struct EvmRiskSummaryV1 {
    pub level: EvmRiskLevel,
    pub blocked: bool,
    pub findings: Vec<EvmRiskFindingV1>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
pub struct EvmAdvancedEvidenceV1 {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub function_selector: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub calldata_hash: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub signed_payload_hash: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub target_contract: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
pub struct EvmBaselinePreviewV1 {
    pub preview_version: u8,
    pub preparation_id: String,
    pub origin: String,
    pub chain_id: String,
    pub account_address: String,
    pub action_kind: EvmActionKind,
    pub method: String,
    pub human_summary: String,
    pub permission_effects: Vec<EvmPermissionEffectV1>,
    pub counterparties: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub native_value_wei: Option<String>,
    pub verification: EvmVerificationV1,
    pub risk: EvmRiskSummaryV1,
    pub advanced_evidence: EvmAdvancedEvidenceV1,
    pub preview_digest: String,
    pub expires_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[cfg_attr(feature = "ts-bindings", derive(TS))]
#[cfg_attr(feature = "ts-bindings", ts(export))]
pub struct EvmTransactionEvaluationInputV1 {
    pub preparation_id: String,
    pub origin: String,
    pub expected_origin: String,
    pub chain_id: String,
    pub account_address: String,
    pub target: String,
    pub value_wei: String,
    pub calldata: String,
    pub target_verified: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub target_code_present: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub current_allowance: Option<String>,
    pub evaluated_at: String,
    pub expires_at: String,
}

pub fn evaluate_transaction(
    input: EvmTransactionEvaluationInputV1,
) -> Result<EvmBaselinePreviewV1, WalletChainError> {
    let calldata = parse_prefixed_hex(&input.calldata)?;
    if calldata.len() > MAX_CALLDATA_BYTES {
        return Err(WalletChainError::invalid_input(
            "EVM calldata exceeds 128 KiB baseline limit",
        ));
    }
    let target = normalize_address(&input.target)?;
    let account = normalize_address(&input.account_address)?;
    let mut findings = Vec::new();
    let mut permissions = Vec::new();
    let mut counterparties = vec![input.origin.clone(), target.clone()];
    let value = DecimalU256::parse(&input.value_wei)?;

    if input.chain_id != "0x1" {
        findings.push(finding(
            "evm.typed_data_domain_mismatch",
            EvmRiskLevel::Blocked,
            true,
        ));
    }
    if input.origin != input.expected_origin {
        findings.push(finding(
            "evm.origin_contract_mismatch",
            EvmRiskLevel::Blocked,
            true,
        ));
    }

    if value.is_nonzero() {
        match input.target_code_present {
            Some(true) => findings.push(finding(
                "evm.native_value_to_contract",
                EvmRiskLevel::Caution,
                false,
            )),
            None => {
                findings.push(finding(
                    "evm.native_value_to_contract",
                    EvmRiskLevel::Caution,
                    false,
                ));
                findings.push(finding(
                    "evm.evaluator_unavailable",
                    EvmRiskLevel::Caution,
                    false,
                ));
            }
            Some(false) => {}
        }
    }

    let selector = calldata.get(..4).map(hex_string);
    let mut action_kind = if calldata.is_empty() {
        EvmActionKind::NativeTransfer
    } else {
        EvmActionKind::Unknown
    };
    let mut decoder_source = if calldata.is_empty() {
        "local_erc_standard"
    } else {
        "unknown"
    };
    let mut verification_status = if calldata.is_empty() {
        "decoded"
    } else {
        "unknown"
    };

    match selector.as_deref() {
        Some("095ea7b3") if calldata.len() == 68 => {
            action_kind = EvmActionKind::TokenApproval;
            decoder_source = "local_erc_standard";
            verification_status = "decoded";
            let spender = abi_address(&calldata[4..36]);
            let amount = DecimalU256::from_bytes(&calldata[36..68]);
            counterparties.push(spender.clone());
            let unlimited = amount.effectively_unlimited();
            permissions.push(EvmPermissionEffectV1 {
                kind: "erc20_allowance".to_string(),
                spender,
                scope: if unlimited { "unlimited" } else { "exact" }.to_string(),
                amount_base_units: Some(amount.to_decimal()),
                asset_address: Some(target.clone()),
            });
            if unlimited {
                findings.push(finding(
                    "evm.unlimited_allowance",
                    EvmRiskLevel::Danger,
                    false,
                ));
            }
            findings.push(finding(
                "evm.approval_to_unknown_spender",
                EvmRiskLevel::Caution,
                false,
            ));
            let current_allowance = input
                .current_allowance
                .as_deref()
                .map(DecimalU256::parse)
                .transpose()?;
            if amount.is_nonzero()
                && current_allowance
                    .as_ref()
                    .is_none_or(DecimalU256::is_nonzero)
            {
                findings.push(finding(
                    "evm.approval_change_nonzero_to_nonzero",
                    EvmRiskLevel::Caution,
                    false,
                ));
                if current_allowance.is_none() {
                    findings.push(finding(
                        "evm.evaluator_unavailable",
                        EvmRiskLevel::Caution,
                        false,
                    ));
                }
            }
        }
        Some("a22cb465") if calldata.len() == 68 => {
            action_kind = EvmActionKind::NftApproval;
            decoder_source = "local_erc_standard";
            verification_status = "decoded";
            let operator = abi_address(&calldata[4..36]);
            let enabled = calldata[67] == 1;
            counterparties.push(operator.clone());
            permissions.push(EvmPermissionEffectV1 {
                kind: "nft_operator".to_string(),
                spender: operator,
                scope: if enabled { "all_tokens" } else { "exact" }.to_string(),
                amount_base_units: None,
                asset_address: Some(target.clone()),
            });
            if enabled {
                findings.push(finding(
                    "evm.nft_approval_for_all",
                    EvmRiskLevel::Danger,
                    false,
                ));
            }
        }
        Some("a9059cbb") if calldata.len() == 68 => {
            action_kind = EvmActionKind::TokenTransfer;
            decoder_source = "local_erc_standard";
            verification_status = "decoded";
            counterparties.push(abi_address(&calldata[4..36]));
        }
        None => {}
        Some(_) => findings.push(finding(
            "evm.unknown_function_selector",
            EvmRiskLevel::Caution,
            false,
        )),
    }

    if !input.target_verified && !calldata.is_empty() && action_kind != EvmActionKind::Unknown {
        findings.push(finding(
            "evm.unverified_contract_decoder",
            EvmRiskLevel::Caution,
            false,
        ));
        verification_status = "partially_decoded";
    }

    findings.sort_by(|left, right| left.code.cmp(&right.code));
    findings.dedup_by(|left, right| left.code == right.code);
    counterparties.sort();
    counterparties.dedup();
    let blocked = findings.iter().any(|finding| finding.hard_block);
    let level = highest_level(&findings);
    let confidence = if blocked || action_kind == EvmActionKind::Unknown {
        "low"
    } else if input.target_verified
        && !findings
            .iter()
            .any(|finding| finding.code == "evm.evaluator_unavailable")
    {
        "high"
    } else {
        "medium"
    };
    let advanced_evidence = EvmAdvancedEvidenceV1 {
        function_selector: selector.map(|selector| format!("0x{selector}")),
        calldata_hash: (!calldata.is_empty())
            .then(|| format!("0x{}", hex_string(&keccak256(&calldata)))),
        signed_payload_hash: None,
        target_contract: Some(target),
    };
    let mut preview = EvmBaselinePreviewV1 {
        preview_version: 1,
        preparation_id: input.preparation_id,
        origin: input.origin,
        chain_id: input.chain_id,
        account_address: account,
        human_summary: summary_for(&action_kind).to_string(),
        action_kind,
        method: "eth_sendTransaction".to_string(),
        permission_effects: permissions,
        counterparties,
        native_value_wei: value.is_nonzero().then(|| value.to_decimal()),
        verification: EvmVerificationV1 {
            status: verification_status.to_string(),
            decoder_source: decoder_source.to_string(),
            simulation_status: "not_run".to_string(),
            confidence: confidence.to_string(),
            evaluator_version: EVM_EVALUATOR_VERSION.to_string(),
            evaluated_at: input.evaluated_at,
        },
        risk: EvmRiskSummaryV1 {
            level,
            blocked,
            findings,
        },
        advanced_evidence,
        preview_digest: String::new(),
        expires_at: input.expires_at,
    };
    preview.preview_digest = preview_digest(&preview)?;
    Ok(preview)
}

pub fn preview_digest(preview: &EvmBaselinePreviewV1) -> Result<String, WalletChainError> {
    let finding_set = preview
        .risk
        .findings
        .iter()
        .map(|finding| {
            json!({
                "code": finding.code,
                "hard_block": finding.hard_block,
                "level": finding.level,
            })
        })
        .collect::<Vec<_>>();
    let critical = json!({
        "account_address": preview.account_address,
        "action_kind": preview.action_kind,
        "advanced_evidence": preview.advanced_evidence,
        "chain_id": preview.chain_id,
        "counterparties": preview.counterparties,
        "findings": finding_set,
        "method": preview.method,
        "native_value_wei": preview.native_value_wei,
        "origin": preview.origin,
        "permission_effects": preview.permission_effects,
        "verification": {
            "confidence": preview.verification.confidence,
            "decoder_source": preview.verification.decoder_source,
            "evaluator_version": preview.verification.evaluator_version,
            "simulation_status": preview.verification.simulation_status,
            "status": preview.verification.status,
        },
    });
    let canonical = canonical_json(&critical)?;
    Ok(format!("sha256:{}", hex_string(&Sha256::digest(canonical))))
}

pub fn validate_preview_acceptance(
    preview: &EvmBaselinePreviewV1,
    accepted_digest: &str,
    accepted_finding_codes: &[String],
) -> Result<(), WalletChainError> {
    if preview.risk.blocked {
        return Err(WalletChainError::unsupported_provider_surface(
            "EVM preview contains a hard-block finding",
        ));
    }
    if preview.preview_digest != accepted_digest {
        return Err(WalletChainError::preparation_stale(
            "EVM preview digest changed",
        ));
    }
    let expected = preview
        .risk
        .findings
        .iter()
        .map(|finding| finding.code.clone())
        .collect::<BTreeSet<_>>();
    let accepted = accepted_finding_codes
        .iter()
        .cloned()
        .collect::<BTreeSet<_>>();
    if expected != accepted || accepted.len() != accepted_finding_codes.len() {
        return Err(WalletChainError::preparation_stale(
            "EVM accepted finding set changed",
        ));
    }
    Ok(())
}

fn parse_prefixed_hex(value: &str) -> Result<Vec<u8>, WalletChainError> {
    parse_hex(value.trim().strip_prefix("0x").unwrap_or(value.trim()))
}

fn normalize_address(value: &str) -> Result<String, WalletChainError> {
    let bytes = parse_prefixed_hex(value)?;
    if bytes.len() != 20 {
        return Err(WalletChainError::invalid_input(
            "EVM address must contain 20 bytes",
        ));
    }
    Ok(format!("0x{}", hex_string(&bytes)))
}

fn abi_address(word: &[u8]) -> String {
    format!("0x{}", hex_string(&word[12..]))
}

fn finding(code: &str, level: EvmRiskLevel, hard_block: bool) -> EvmRiskFindingV1 {
    EvmRiskFindingV1 {
        code: code.to_string(),
        level,
        hard_block,
    }
}

fn highest_level(findings: &[EvmRiskFindingV1]) -> EvmRiskLevel {
    findings
        .iter()
        .map(|finding| finding.level.clone())
        .max_by_key(|level| match level {
            EvmRiskLevel::Info => 0,
            EvmRiskLevel::Caution => 1,
            EvmRiskLevel::Danger => 2,
            EvmRiskLevel::Blocked => 3,
        })
        .unwrap_or(EvmRiskLevel::Info)
}

fn summary_for(action: &EvmActionKind) -> &'static str {
    match action {
        EvmActionKind::NativeTransfer => "Send native ETH",
        EvmActionKind::TokenTransfer => "Transfer tokens",
        EvmActionKind::TokenApproval => "Grant token spending permission",
        EvmActionKind::NftApproval => "Grant NFT operator permission",
        _ => "Review an unverified EVM request",
    }
}

fn canonical_json(value: &Value) -> Result<Vec<u8>, WalletChainError> {
    // These digest inputs contain strings, booleans, nulls, arrays and objects only.
    // serde_json's default Map is key-sorted, yielding the RFC 8785 order for this subset.
    serde_json::to_vec(value).map_err(|error| {
        WalletChainError::internal(format!("EVM preview canonicalization failed: {error}"))
    })
}

#[derive(Clone, PartialEq, Eq)]
struct DecimalU256([u8; 32]);

impl DecimalU256 {
    fn parse(value: &str) -> Result<Self, WalletChainError> {
        if value.is_empty() || !value.bytes().all(|byte| byte.is_ascii_digit()) {
            return Err(WalletChainError::invalid_input(
                "EVM integer must be an unsigned decimal string",
            ));
        }
        let mut out = [0u8; 32];
        for digit in value.bytes().map(|byte| byte - b'0') {
            let mut carry = digit as u16;
            for byte in out.iter_mut().rev() {
                let next = (*byte as u16) * 10 + carry;
                *byte = next as u8;
                carry = next >> 8;
            }
            if carry != 0 {
                return Err(WalletChainError::invalid_input("EVM uint256 overflow"));
            }
        }
        Ok(Self(out))
    }

    fn from_bytes(bytes: &[u8]) -> Self {
        let mut out = [0u8; 32];
        out[32 - bytes.len()..].copy_from_slice(bytes);
        Self(out)
    }

    fn is_nonzero(&self) -> bool {
        self.0.iter().any(|byte| *byte != 0)
    }

    fn effectively_unlimited(&self) -> bool {
        self.0[0] & 0x80 != 0
    }

    fn to_decimal(&self) -> String {
        if !self.is_nonzero() {
            return "0".to_string();
        }
        let mut value = self.0;
        let mut digits = Vec::new();
        while value.iter().any(|byte| *byte != 0) {
            let mut remainder = 0u16;
            for byte in &mut value {
                let current = (remainder << 8) | *byte as u16;
                *byte = (current / 10) as u8;
                remainder = current % 10;
            }
            digits.push((b'0' + remainder as u8) as char);
        }
        digits.iter().rev().collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn base_input(calldata: String) -> EvmTransactionEvaluationInputV1 {
        EvmTransactionEvaluationInputV1 {
            preparation_id: "preparation".to_string(),
            origin: "https://app.example".to_string(),
            expected_origin: "https://app.example".to_string(),
            chain_id: "0x1".to_string(),
            account_address: "0x1111111111111111111111111111111111111111".to_string(),
            target: "0x2222222222222222222222222222222222222222".to_string(),
            value_wei: "0".to_string(),
            calldata,
            target_verified: true,
            target_code_present: Some(true),
            current_allowance: Some("0".to_string()),
            evaluated_at: "1".to_string(),
            expires_at: "2".to_string(),
        }
    }

    fn approve(spender: &str, amount: [u8; 32]) -> String {
        format!(
            "0x095ea7b3{}{}",
            "0".repeat(24),
            format!(
                "{}{}",
                spender.trim_start_matches("0x"),
                hex_string(&amount)
            )
        )
    }

    #[test]
    fn unlimited_approval_has_danger_finding_and_stable_digest() {
        let calldata = approve("0x3333333333333333333333333333333333333333", [0xff; 32]);
        let first = evaluate_transaction(base_input(calldata.clone())).expect("preview");
        let second = evaluate_transaction(base_input(calldata)).expect("preview");
        assert_eq!(first.preview_digest, second.preview_digest);
        assert!(first
            .risk
            .findings
            .iter()
            .any(|finding| finding.code == "evm.unlimited_allowance"
                && finding.level == EvmRiskLevel::Danger));
        assert_eq!(first.permission_effects[0].scope, "unlimited");
    }

    #[test]
    fn origin_mismatch_is_hard_blocked_and_cannot_be_accepted() {
        let mut input = base_input("0x".to_string());
        input.expected_origin = "https://other.example".to_string();
        let preview = evaluate_transaction(input).expect("preview");
        assert!(preview.risk.blocked);
        assert!(validate_preview_acceptance(&preview, &preview.preview_digest, &[]).is_err());
    }

    #[test]
    fn unknown_selector_never_produces_safe_verification() {
        let preview = evaluate_transaction(base_input("0xdeadbeef".to_string())).expect("preview");
        assert_eq!(preview.action_kind, EvmActionKind::Unknown);
        assert_eq!(preview.verification.status, "unknown");
        assert_eq!(preview.verification.confidence, "low");
        assert!(preview
            .risk
            .findings
            .iter()
            .any(|finding| finding.code == "evm.unknown_function_selector"));
    }

    #[test]
    fn digest_acceptance_requires_exact_finding_set() {
        let preview = evaluate_transaction(base_input("0xdeadbeef".to_string())).expect("preview");
        let codes = preview
            .risk
            .findings
            .iter()
            .map(|finding| finding.code.clone())
            .collect::<Vec<_>>();
        assert!(validate_preview_acceptance(&preview, &preview.preview_digest, &codes).is_ok());
        assert!(validate_preview_acceptance(&preview, "sha256:stale", &codes).is_err());
        assert!(validate_preview_acceptance(&preview, &preview.preview_digest, &[]).is_err());
    }
}
