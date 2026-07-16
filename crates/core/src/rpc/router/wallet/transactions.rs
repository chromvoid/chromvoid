use crate::rpc::types::WalletTransactionOutput;

use super::provider::invalid_input;
use super::WalletResult;

pub(super) fn validate_outputs(outputs: &[WalletTransactionOutput]) -> WalletResult<()> {
    for output in outputs {
        if output.address.trim().is_empty() {
            return Err(invalid_input("output address is required"));
        }
        parse_amount(&output.amount)?;
    }
    Ok(())
}

pub(super) fn parse_amount(amount: &str) -> WalletResult<u128> {
    if amount.is_empty() || !amount.bytes().all(|byte| byte.is_ascii_digit()) {
        return Err(invalid_input(
            "amount must be an integer string in base units",
        ));
    }
    amount
        .parse::<u128>()
        .map_err(|_| invalid_input("amount is too large"))
}

pub(super) fn sum_outputs(outputs: &[WalletTransactionOutput]) -> WalletResult<u128> {
    outputs.iter().try_fold(0u128, |sum, output| {
        parse_amount(&output.amount).map(|amount| sum.saturating_add(amount))
    })
}
