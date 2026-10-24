//! Provider-backed transaction history for a Bitcoin account (`wallet:transactions:sync`).
//!
//! Every allocated receive/change address is queried for one page of history; transactions are
//! deduplicated across addresses and folded into the account's net effect: outputs to owned
//! addresses minus owned inputs. Amounts stay in satoshi as integer strings.

use std::collections::HashSet;

use crate::rpc::types::WalletTransactionDirection;
use crate::wallet::{WalletChainError, WalletHistoryTransaction, WalletTxStatus};

use super::constants::BITCOIN_FINALITY_CONFIRMATIONS;
use super::provider::{provider_error, BitcoinAddressTransaction, BitcoinProvider};
use super::scan::ScanAddress;

/// Most transactions a single sync returns; keeps one page per address on public Esplora hosts.
pub(super) const BITCOIN_HISTORY_PAGE_LIMIT: u32 = 25;

pub(super) fn history_for_addresses(
    provider: &dyn BitcoinProvider,
    addresses: &[ScanAddress],
    limit: u32,
    now: u64,
) -> Result<Vec<WalletHistoryTransaction>, WalletChainError> {
    let limit = limit.clamp(1, BITCOIN_HISTORY_PAGE_LIMIT) as usize;
    let tip_height = provider.tip_height().map_err(provider_error)?.unwrap_or(0);
    let owned = addresses
        .iter()
        .map(|address| address.address.as_str())
        .collect::<HashSet<_>>();
    let mut seen = HashSet::new();
    let mut transactions = Vec::new();
    for address in addresses {
        for transaction in provider
            .address_transactions(&address.address, None)
            .map_err(provider_error)?
        {
            if !seen.insert(transaction.txid.clone()) {
                continue;
            }
            transactions.push(map_transaction(transaction, &owned, tip_height, now));
        }
    }
    transactions.sort_by(|a, b| {
        b.created_at
            .cmp(&a.created_at)
            .then_with(|| a.tx_hash.cmp(&b.tx_hash))
    });
    transactions.truncate(limit);
    Ok(transactions)
}

pub(super) fn map_transaction(
    transaction: BitcoinAddressTransaction,
    owned: &HashSet<&str>,
    tip_height: u64,
    now: u64,
) -> WalletHistoryTransaction {
    let is_owned = |address: Option<&str>| address.is_some_and(|address| owned.contains(address));
    let spent = transaction
        .inputs
        .iter()
        .filter(|input| is_owned(input.address.as_deref()))
        .fold(0u64, |total, input| total.saturating_add(input.value));
    let received = transaction
        .outputs
        .iter()
        .filter(|output| is_owned(output.address.as_deref()))
        .fold(0u64, |total, output| total.saturating_add(output.value));
    let (direction, counterparty, amount, fee) = if spent > received {
        // Owned inputs funded the transaction: what left the wallet is the debit minus the fee.
        let counterparty = transaction
            .outputs
            .iter()
            .find(|output| !is_owned(output.address.as_deref()))
            .and_then(|output| output.address.clone());
        (
            WalletTransactionDirection::Outgoing,
            counterparty,
            (spent - received).saturating_sub(transaction.fee),
            transaction.fee,
        )
    } else if received > spent {
        let counterparty = transaction
            .inputs
            .iter()
            .find(|input| !is_owned(input.address.as_deref()))
            .and_then(|input| input.address.clone());
        (
            WalletTransactionDirection::Incoming,
            counterparty,
            received - spent,
            0,
        )
    } else {
        (WalletTransactionDirection::Unknown, None, 0, 0)
    };
    let confirmations = if transaction.confirmed {
        transaction
            .block_height
            .and_then(|height| tip_height.checked_sub(height))
            .and_then(|delta| u32::try_from(delta.saturating_add(1)).ok())
            .unwrap_or(1)
    } else {
        0
    };
    let status = if confirmations >= BITCOIN_FINALITY_CONFIRMATIONS {
        WalletTxStatus::Confirmed
    } else {
        WalletTxStatus::Pending
    };
    WalletHistoryTransaction {
        tx_hash: transaction.txid,
        message_ref: None,
        status,
        direction,
        counterparty,
        amount: amount.to_string(),
        fee: fee.to_string(),
        created_at: transaction
            .block_time
            .map(|seconds| seconds.saturating_mul(1_000))
            .unwrap_or(now),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::wallet::bitcoin::BitcoinTransactionIo;

    fn io(address: Option<&str>, value: u64) -> BitcoinTransactionIo {
        BitcoinTransactionIo {
            address: address.map(str::to_string),
            value,
        }
    }

    #[test]
    fn outgoing_transaction_nets_change_and_reports_fee() {
        let owned = HashSet::from(["bc1-ours", "bc1-change"]);
        let mapped = map_transaction(
            BitcoinAddressTransaction {
                txid: "tx-out".to_string(),
                confirmed: true,
                block_height: Some(95),
                block_time: Some(1_710_000_000),
                fee: 1_000,
                inputs: vec![io(Some("bc1-ours"), 100_000)],
                outputs: vec![
                    io(Some("bc1-recipient"), 60_000),
                    io(Some("bc1-change"), 39_000),
                ],
            },
            &owned,
            100,
            7,
        );
        assert_eq!(mapped.direction, WalletTransactionDirection::Outgoing);
        assert_eq!(mapped.counterparty.as_deref(), Some("bc1-recipient"));
        assert_eq!(mapped.amount, "60000");
        assert_eq!(mapped.fee, "1000");
        assert_eq!(mapped.status, WalletTxStatus::Confirmed);
        assert_eq!(mapped.created_at, 1_710_000_000_000);
    }

    #[test]
    fn incoming_mempool_transaction_is_pending_with_zero_fee_and_now_timestamp() {
        let owned = HashSet::from(["bc1-ours"]);
        let mapped = map_transaction(
            BitcoinAddressTransaction {
                txid: "tx-in".to_string(),
                confirmed: false,
                block_height: None,
                block_time: None,
                fee: 500,
                inputs: vec![io(Some("bc1-sender"), 200_000)],
                outputs: vec![
                    io(Some("bc1-ours"), 150_000),
                    io(Some("bc1-sender"), 49_500),
                ],
            },
            &owned,
            100,
            7,
        );
        assert_eq!(mapped.direction, WalletTransactionDirection::Incoming);
        assert_eq!(mapped.counterparty.as_deref(), Some("bc1-sender"));
        assert_eq!(mapped.amount, "150000");
        assert_eq!(mapped.fee, "0");
        assert_eq!(mapped.status, WalletTxStatus::Pending);
        assert_eq!(mapped.created_at, 7);
    }

    #[test]
    fn shallow_confirmations_stay_pending_until_finality() {
        let owned = HashSet::from(["bc1-ours"]);
        let mapped = map_transaction(
            BitcoinAddressTransaction {
                txid: "tx-shallow".to_string(),
                confirmed: true,
                block_height: Some(98),
                block_time: Some(1),
                fee: 0,
                inputs: vec![io(None, 0)],
                outputs: vec![io(Some("bc1-ours"), 1)],
            },
            &owned,
            100,
            7,
        );
        assert_eq!(mapped.status, WalletTxStatus::Pending);
        assert_eq!(mapped.counterparty, None);
    }
}
