//! Synthetic TON provider for real Core send integration. Never performs network I/O.
use std::sync::atomic::{AtomicBool, Ordering};

use chromvoid_core::rpc::types::WalletConfirmStatus;
use chromvoid_core::wallet::ton::{
    TonBroadcastRequest, TonBroadcastResult, TonProvider, TonProviderAccount,
    TonProviderAccountState, TonProviderError, TonProviderSnapshot, TonRefreshRequest,
    TonRefreshResult, UnavailableTonProvider,
};

#[derive(Default)]
pub(super) struct SendProvider {
    submitted: AtomicBool,
}

impl TonProvider for SendProvider {
    fn snapshot(
        &self,
        _account: &TonProviderAccount,
    ) -> Result<TonProviderSnapshot, TonProviderError> {
        Ok(TonProviderSnapshot {
            seqno: 7,
            account_state: TonProviderAccountState::Active,
            balance: 2_000_000_000,
            estimated_fee: Some(5_000_000),
        })
    }
    fn account_state(&self, _address: &str) -> Result<TonProviderAccountState, TonProviderError> {
        Ok(TonProviderAccountState::Active)
    }
    fn broadcast(
        &self,
        request: TonBroadcastRequest,
    ) -> Result<TonBroadcastResult, TonProviderError> {
        if !self.submitted.swap(true, Ordering::Relaxed) {
            return Err(TonProviderError::unknown(
                "Synthetic submission outcome is unknown",
            ));
        }
        Ok(TonBroadcastResult {
            status: WalletConfirmStatus::Pending,
            tx_hash: Some(format!("air-fixture-{}", request.message_hash)),
            message_ref: Some(request.message_hash),
        })
    }
    fn refresh(&self, request: TonRefreshRequest) -> Result<TonRefreshResult, TonProviderError> {
        UnavailableTonProvider.refresh(request)
    }
}
