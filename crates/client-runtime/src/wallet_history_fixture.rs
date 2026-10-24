//! Deterministic provider input for real Core history/refresh integration; no network I/O.
use std::sync::atomic::{AtomicBool, Ordering};

use chromvoid_core::rpc::types::WalletTransactionDirection;
use chromvoid_core::wallet::WalletTxStatus;
use chromvoid_core::wallet::ton::{
    TonBroadcastRequest, TonBroadcastResult, TonHistoryRequest, TonHistoryTransaction, TonProvider,
    TonProviderAccount, TonProviderAccountState, TonProviderError, TonProviderSnapshot,
    TonRefreshRequest, TonRefreshResult, UnavailableTonProvider,
};

const INCOMING_HASH: &str = "air-fixture-incoming";
const OUTGOING_HASH: &str = "air-fixture-outgoing";

#[derive(Default)]
pub(super) struct HistoryProvider {
    confirmed: AtomicBool,
}

impl TonProvider for HistoryProvider {
    fn snapshot(
        &self,
        account: &TonProviderAccount,
    ) -> Result<TonProviderSnapshot, TonProviderError> {
        UnavailableTonProvider.snapshot(account)
    }
    fn account_state(&self, address: &str) -> Result<TonProviderAccountState, TonProviderError> {
        UnavailableTonProvider.account_state(address)
    }
    fn broadcast(
        &self,
        request: TonBroadcastRequest,
    ) -> Result<TonBroadcastResult, TonProviderError> {
        UnavailableTonProvider.broadcast(request)
    }
    fn refresh(&self, request: TonRefreshRequest) -> Result<TonRefreshResult, TonProviderError> {
        match request.tx_hash.as_deref() {
            Some(INCOMING_HASH | OUTGOING_HASH) => {
                self.confirmed.store(true, Ordering::Relaxed);
                Ok(TonRefreshResult {
                    status: WalletTxStatus::Confirmed,
                    tx_hash: request.tx_hash,
                    found: true,
                })
            }
            _ => Err(TonProviderError::unavailable(
                "No synthetic transaction matches this request",
            )),
        }
    }
    fn history(
        &self,
        request: TonHistoryRequest,
    ) -> Result<Vec<TonHistoryTransaction>, TonProviderError> {
        let outgoing_status = if self.confirmed.load(Ordering::Relaxed) {
            WalletTxStatus::Confirmed
        } else {
            WalletTxStatus::Pending
        };
        let mut transactions = vec![
            TonHistoryTransaction {
                tx_hash: OUTGOING_HASH.into(),
                message_ref: None,
                status: outgoing_status,
                direction: WalletTransactionDirection::Outgoing,
                counterparty: Some("synthetic-recipient".into()),
                amount: 42,
                fee: 3,
                created_at: 1_710_000_001_000,
            },
            TonHistoryTransaction {
                tx_hash: INCOMING_HASH.into(),
                message_ref: Some("synthetic-incoming-message".into()),
                status: WalletTxStatus::Confirmed,
                direction: WalletTransactionDirection::Incoming,
                counterparty: Some("synthetic-sender".into()),
                amount: 900_719_925_474_099_312_345,
                fee: 0,
                created_at: 1_710_000_000_000,
            },
        ];
        transactions.truncate(request.limit as usize);
        Ok(transactions)
    }
}
