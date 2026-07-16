use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::wallet::WalletChainError;

use super::constants::{
    TON_MESSAGE_MODE_SIMPLE_TRANSFER, TON_PREPARED_PAYLOAD_KIND, TON_WALLET_CONTRACT,
};
use super::provider::{TonProviderAccount, TonProviderAccountState, TonProviderSnapshot};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct TonPreparedPayloadV1 {
    pub(super) kind: String,
    pub(super) account_id: String,
    pub(super) wallet_contract: String,
    pub(super) account_address: String,
    pub(super) raw_account: String,
    pub(super) destination_address: String,
    pub(super) destination_raw_account: String,
    pub(super) destination_bounceable: bool,
    pub(super) amount: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(super) comment: Option<String>,
    pub(super) seqno: u32,
    pub(super) valid_until: u32,
    pub(super) message_mode: u8,
    pub(super) account_state: String,
    pub(super) sender_state_init_included: bool,
    pub(super) destination_state: String,
    pub(super) estimated_fee: String,
    pub(super) warning_codes: Vec<String>,
}

impl TonPreparedPayloadV1 {
    pub(super) fn validate_for_account(
        &self,
        account: &TonProviderAccount,
    ) -> Result<(), WalletChainError> {
        if self.kind != TON_PREPARED_PAYLOAD_KIND
            || self.account_id != account.account_id
            || self.wallet_contract != TON_WALLET_CONTRACT
            || self.raw_account != account.raw_account
            || self.account_address != account.address
            || self.message_mode != TON_MESSAGE_MODE_SIMPLE_TRANSFER
        {
            return Err(WalletChainError::preparation_stale(
                "TON preparation does not match account",
            ));
        }
        Ok(())
    }
}

pub(super) fn snapshot_value(
    snapshot: &TonProviderSnapshot,
    destination_state: TonProviderAccountState,
    estimated_fee: u128,
    sender_state_init_included: bool,
) -> serde_json::Value {
    json!({
        "seqno": snapshot.seqno,
        "account_state": snapshot.account_state.as_str(),
        "balance": snapshot.balance.to_string(),
        "destination_state": destination_state.as_str(),
        "estimated_fee": estimated_fee.to_string(),
        "message_mode": TON_MESSAGE_MODE_SIMPLE_TRANSFER,
        "sender_state_init_included": sender_state_init_included,
    })
}
