mod test_helpers;

use chromvoid_core::rpc::types::{RpcRequest, RpcResponse};
use chromvoid_core::rpc::RpcRouter;
use chromvoid_core::wallet::WalletRuntimeConfig;
use tempfile::TempDir;
use test_helpers::*;

fn wallet_config_enabled() -> WalletRuntimeConfig {
    WalletRuntimeConfig {
        wallet_phase1_enabled: true,
        wallet_core_broadcast_enabled: true,
    }
}

fn create_wallet_router() -> (RpcRouter, TempDir) {
    let (router, temp_dir) = create_test_router();
    (
        router.with_wallet_runtime_config(wallet_config_enabled()),
        temp_dir,
    )
}

fn rpc(router: &mut RpcRouter, command: &str, data: serde_json::Value) -> RpcResponse {
    router.handle(&RpcRequest::new(command, data))
}

fn assert_wallet_disabled(response: &RpcResponse) {
    assert_rpc_error(response, "UNSUPPORTED");
    assert_eq!(
        response.error_message(),
        Some("UNSUPPORTED: wallet crypto is disabled until real wallet crypto is implemented")
    );
}

#[test]
fn wallet_status_reports_disabled_even_when_runtime_flag_is_enabled() {
    let (mut router, _temp_dir) = create_wallet_router();
    let locked = rpc(&mut router, "wallet:status", serde_json::json!({}));
    assert_rpc_error(&locked, "VAULT_REQUIRED");

    unlock_vault(&mut router, "pw");
    let status = rpc(&mut router, "wallet:status", serde_json::json!({}));
    assert_rpc_ok(&status);
    let result = status.result().expect("status result");
    assert_eq!(
        result.get("initialized").and_then(|value| value.as_bool()),
        Some(false)
    );
    assert_eq!(
        result.get("wallet_count").and_then(|value| value.as_u64()),
        Some(0)
    );
    assert_eq!(
        result.get("enabled").and_then(|value| value.as_bool()),
        Some(false)
    );
    assert_eq!(
        result
            .get("disabled_reason")
            .and_then(|value| value.as_str()),
        Some("UNSUPPORTED: wallet crypto is disabled until real wallet crypto is implemented")
    );
}

#[test]
fn wallet_safe_list_style_commands_remain_read_only() {
    let (mut router, _temp_dir) = create_wallet_router();
    unlock_vault(&mut router, "pw");

    let wallet_list = rpc(&mut router, "wallet:list", serde_json::json!({}));
    assert_rpc_ok(&wallet_list);
    assert_eq!(
        wallet_list
            .result()
            .and_then(|result| result.get("wallets"))
            .and_then(|value| value.as_array())
            .map(Vec::len),
        Some(0)
    );

    let accounts = rpc(&mut router, "wallet:accounts:list", serde_json::json!({}));
    assert_rpc_ok(&accounts);
    assert_eq!(
        accounts
            .result()
            .and_then(|result| result.get("accounts"))
            .and_then(|value| value.as_array())
            .map(Vec::len),
        Some(0)
    );

    let transactions = rpc(
        &mut router,
        "wallet:transactions:list",
        serde_json::json!({}),
    );
    assert_rpc_ok(&transactions);
    assert_eq!(
        transactions
            .result()
            .and_then(|result| result.get("transactions"))
            .and_then(|value| value.as_array())
            .map(Vec::len),
        Some(0)
    );
}

#[test]
fn wallet_crypto_capable_commands_are_hard_disabled() {
    let (mut router, _temp_dir) = create_wallet_router();
    unlock_vault(&mut router, "pw");

    let cases = [
        (
            "wallet:hd:generateMnemonic",
            serde_json::json!({"word_count": 12}),
        ),
        (
            "wallet:hd:create",
            serde_json::json!({
                "label": "Main wallet",
                "mnemonic": ["able", "acid", "agent", "album", "alpha", "anchor", "apple", "april", "arena", "asset", "august", "auto"],
                "wordlist": "english",
                "supported_networks": ["bitcoin"]
            }),
        ),
        (
            "wallet:import:create",
            serde_json::json!({
                "label": "Imported",
                "network": "bitcoin",
                "curve": "secp256k1",
                "private_key": "fake-private-key",
                "encoding": "hex"
            }),
        ),
        (
            "wallet:accounts:derive",
            serde_json::json!({"wallet_id": "wallet-missing", "network": "bitcoin"}),
        ),
        (
            "wallet:addresses:derive",
            serde_json::json!({"account_id": "account-missing", "purpose": "receive"}),
        ),
        (
            "wallet:balance:get",
            serde_json::json!({"account_id": "account-missing"}),
        ),
        (
            "wallet:transaction:prepare",
            serde_json::json!({
                "account_id": "account-missing",
                "network": "bitcoin",
                "outputs": [{"address": "bc1qreceiver", "amount": "1000"}],
                "fee_policy": {"tier": "standard"}
            }),
        ),
        (
            "wallet:transaction:confirm",
            serde_json::json!({"preparation_id": "prep-missing", "accepted_warnings": []}),
        ),
        (
            "wallet:transactions:refresh",
            serde_json::json!({"tx_ref": "tx-missing"}),
        ),
        (
            "wallet:backup:export",
            serde_json::json!({"wallet_id": "wallet-missing", "kind": "metadata"}),
        ),
    ];

    for (command, payload) in cases {
        let response = rpc(&mut router, command, payload);
        assert_wallet_disabled(&response);
    }
}

#[test]
fn wallet_disabled_commands_do_not_return_fake_material() {
    let (mut router, _temp_dir) = create_wallet_router();
    unlock_vault(&mut router, "pw");

    let mnemonic = rpc(
        &mut router,
        "wallet:hd:generateMnemonic",
        serde_json::json!({"word_count": 12}),
    );
    assert_wallet_disabled(&mnemonic);
    assert!(mnemonic.result().is_none());

    let address = rpc(
        &mut router,
        "wallet:addresses:derive",
        serde_json::json!({"account_id": "account-missing", "purpose": "receive"}),
    );
    assert_wallet_disabled(&address);
    assert!(address.result().is_none());
}
