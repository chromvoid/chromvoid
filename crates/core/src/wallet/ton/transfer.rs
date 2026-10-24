use std::str::FromStr;

use base64::engine::general_purpose::{
    STANDARD as BASE64_STANDARD, URL_SAFE_NO_PAD as BASE64_URL_SAFE_NO_PAD,
};
use base64::Engine as _;

use crate::rpc::types::{WalletTransactionOutput, WalletWarning};
use crate::wallet::WalletChainError;

use super::constants::{
    TON_COMMENT_MAX_BYTES, TON_DESTINATION_UNINITIALIZED_BOUNCEABLE_WARNING,
    TON_DESTINATION_UNINITIALIZED_BOUNCEABLE_WARNING_MESSAGE, TON_MESSAGE_MODE_SIMPLE_TRANSFER,
    TON_VALID_UNTIL_SECONDS, TON_WORKCHAIN,
};
use super::error::ton_core_error;
use super::provider::TonProviderAccountState;
use super::wallet_tg::WalletTg;

pub(super) fn validate_single_output(
    outputs: &[WalletTransactionOutput],
) -> Result<&WalletTransactionOutput, WalletChainError> {
    if outputs.len() != 1 {
        return Err(WalletChainError::invalid_input(
            "TON transaction prepare accepts exactly one output",
        ));
    }
    Ok(&outputs[0])
}

pub(super) fn parse_amount(amount: &str) -> Result<u128, WalletChainError> {
    if amount.is_empty() || !amount.bytes().all(|byte| byte.is_ascii_digit()) {
        return Err(WalletChainError::invalid_input(
            "TON amount must be an integer nanoton string",
        ));
    }
    amount
        .parse::<u128>()
        .map_err(|_| WalletChainError::invalid_input("TON amount is too large"))
}

pub(super) fn validate_comment(comment: Option<&str>) -> Result<(), WalletChainError> {
    let Some(comment) = comment else {
        return Ok(());
    };
    if comment.as_bytes().len() > TON_COMMENT_MAX_BYTES {
        return Err(WalletChainError::unsupported_ton_payload(
            "TON v1 text comment is too large",
        ));
    }
    Ok(())
}

pub(super) fn parse_ton_address(
    address: &str,
) -> Result<::ton::ton_core::types::TonAddress, WalletChainError> {
    let parsed = ::ton::ton_core::types::TonAddress::from_str(address.trim()).map_err(|error| {
        WalletChainError::invalid_input(format!("invalid TON address: {error}"))
    })?;
    if parsed.workchain != TON_WORKCHAIN {
        return Err(WalletChainError::invalid_input(
            "TON v1 supports only workchain 0",
        ));
    }
    Ok(parsed)
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct ParsedTonDestination {
    pub(super) address: ::ton::ton_core::types::TonAddress,
    pub(super) normalized_address: String,
    pub(super) raw_account: String,
    pub(super) bounceable: bool,
}

pub(super) fn parse_ton_destination(
    address: &str,
) -> Result<ParsedTonDestination, WalletChainError> {
    let trimmed = address.trim();
    let parsed = parse_ton_address(trimmed)
        .map_err(|error| WalletChainError::invalid_address(error.message))?;
    let bounceable = ton_destination_bounceable(trimmed)
        .map_err(|error| WalletChainError::invalid_address(error.message))?;
    let normalized_address = parsed.to_base64(true, bounceable, true);
    let raw_account = parsed.to_hex();
    Ok(ParsedTonDestination {
        address: parsed,
        normalized_address,
        raw_account,
        bounceable,
    })
}

fn ton_destination_bounceable(address: &str) -> Result<bool, WalletChainError> {
    if address.contains(':') {
        return Ok(false);
    }
    if address.len() != 48 {
        return Err(WalletChainError::invalid_input(
            "invalid TON address: expecting user-friendly or raw address",
        ));
    }
    let bytes = if address.chars().any(|ch| ch == '-' || ch == '_') {
        BASE64_URL_SAFE_NO_PAD.decode(address)
    } else {
        BASE64_STANDARD.decode(address)
    }
    .map_err(|error| WalletChainError::invalid_input(format!("invalid TON address: {error}")))?;
    let Some(tag) = bytes.first().copied() else {
        return Err(WalletChainError::invalid_input("invalid TON address"));
    };
    match tag {
        0x11 => Ok(true),
        0x51 => Ok(false),
        0x91 | 0xD1 => Err(WalletChainError::invalid_input(
            "TON testnet addresses are unsupported in v1",
        )),
        _ => Err(WalletChainError::invalid_input(
            "invalid TON user-friendly address flags",
        )),
    }
}

pub(super) fn ton_prepare_warnings(
    destination: &ParsedTonDestination,
    destination_state: TonProviderAccountState,
) -> Vec<WalletWarning> {
    if destination_state == TonProviderAccountState::Uninitialized && destination.bounceable {
        return vec![WalletWarning {
            code: TON_DESTINATION_UNINITIALIZED_BOUNCEABLE_WARNING.to_string(),
            message: TON_DESTINATION_UNINITIALIZED_BOUNCEABLE_WARNING_MESSAGE.to_string(),
        }];
    }
    Vec::new()
}

pub(super) fn comment_body(
    comment: Option<&str>,
) -> Result<::ton::ton_core::cell::TonCell, WalletChainError> {
    validate_comment(comment)?;
    let mut builder = ::ton::ton_core::cell::TonCell::builder();
    if let Some(comment) = comment {
        builder.write_num(&0u32, 32).map_err(ton_core_error)?;
        builder
            .write_bits(comment.as_bytes(), comment.as_bytes().len() * 8)
            .map_err(ton_core_error)?;
    }
    builder.build().map_err(ton_core_error)
}

pub(super) fn build_internal_message(
    destination: ::ton::ton_core::types::TonAddress,
    amount: u128,
    body: ::ton::ton_core::cell::TonCell,
    bounce: bool,
) -> Result<::ton::ton_core::cell::TonCell, WalletChainError> {
    use ::ton::block_tlb::{CommonMsgInfo, CommonMsgInfoInt, CurrencyCollection, Msg};
    use ::ton::ton_core::traits::tlb::TLB;
    use ::ton::ton_core::types::tlb_core::TLBCoins;

    let info = CommonMsgInfo::Int(CommonMsgInfoInt {
        dst: destination.to_msg_address(),
        value: CurrencyCollection::new(TLBCoins::new(amount)),
        bounce,
        ..Default::default()
    });
    Msg::new(info, body).to_cell().map_err(ton_core_error)
}

pub(super) fn build_fee_estimate_body(
    wallet: &WalletTg,
    internal_message: ::ton::ton_core::cell::TonCell,
    seqno: u32,
    valid_until: u32,
) -> Result<::ton::ton_core::cell::TonCell, WalletChainError> {
    let unsigned_body = wallet.build_send_one_external_body(
        seqno,
        valid_until,
        TON_MESSAGE_MODE_SIMPLE_TRANSFER,
        &internal_message,
    )?;
    WalletTg::unsigned_request(&unsigned_body)
}

pub(super) fn valid_until_seconds_now() -> u32 {
    (crate::wallet::now_ms() / 1000).min(u32::MAX as u64) as u32
}

pub(super) fn valid_until_seconds() -> u32 {
    let now_seconds = crate::wallet::now_ms() / 1000;
    now_seconds
        .saturating_add(TON_VALID_UNTIL_SECONDS)
        .min(u32::MAX as u64) as u32
}
