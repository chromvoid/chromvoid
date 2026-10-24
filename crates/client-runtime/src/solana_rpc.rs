//! Solana mainnet-beta provider over a public JSON-RPC endpoint.
//!
//! Core builds and signs the legacy transfer message itself, so this provider only needs
//! balances, the latest blockhash, block height, rent and fee quotes, recent prioritization fees
//! for the compute unit price, base64 broadcast and signature status lookups. Every query uses `finalized` commitment: balances and block heights
//! then never roll back, and a `confirmed` status never becomes `confirmed` in the journal before
//! finality (SPEC-234 FR-234-016).

use std::sync::Mutex;
use std::thread;
use std::time::{Duration, Instant};

use chromvoid_core::rpc::types::WalletProviderStatus;
use chromvoid_core::wallet::solana::{
    SOLANA_DEFAULT_SIGNATURE_FEE_LAMPORTS, SolanaBlockhash, SolanaProvider, SolanaProviderError,
    SolanaProviderErrorKind, SolanaSignatureInfo, SolanaSignatureStatus, SolanaTransactionDetails,
};
use reqwest::blocking::Client;
use reqwest::{StatusCode, Url};
use serde::Deserialize;
use serde_json::{Value, json};

const DEFAULT_PROVIDER_TIMEOUT: Duration = Duration::from_secs(10);
const DEFAULT_REQUEST_INTERVAL: Duration = Duration::from_millis(200);
const COMMITMENT: &str = "finalized";
/// History reads use `confirmed` so fresh sends show up as pending; `confirmationStatus` on each
/// signature still decides when Core marks them confirmed.
const HISTORY_COMMITMENT: &str = "confirmed";

pub(super) struct SolanaRpcProvider {
    client: Client,
    endpoint: Url,
    request_gate: SolanaRequestGate,
    next_id: Mutex<u64>,
}

pub(super) struct SolanaRpcProviderConfig {
    endpoint: Url,
    min_request_interval: Duration,
    timeout: Duration,
}

impl SolanaRpcProviderConfig {
    fn from_url(url: &str) -> Result<Self, String> {
        Ok(Self {
            endpoint: parse_endpoint(url)?,
            min_request_interval: DEFAULT_REQUEST_INTERVAL,
            timeout: DEFAULT_PROVIDER_TIMEOUT,
        })
    }

    #[cfg(test)]
    fn test(endpoint: Url) -> Self {
        Self {
            endpoint,
            min_request_interval: Duration::ZERO,
            timeout: Duration::from_secs(2),
        }
    }
}

impl SolanaRpcProvider {
    pub(super) fn mainnet_from_url(url: &str) -> Result<Self, String> {
        Self::new(SolanaRpcProviderConfig::from_url(url)?)
    }

    fn new(config: SolanaRpcProviderConfig) -> Result<Self, String> {
        let client = Client::builder()
            .timeout(config.timeout)
            .user_agent("ChromVoid Solana wallet/1.0")
            .build()
            .map_err(|error| format!("failed to build Solana HTTP client: {error}"))?;
        Ok(Self {
            client,
            endpoint: config.endpoint,
            request_gate: SolanaRequestGate::new(config.min_request_interval),
            next_id: Mutex::new(1),
        })
    }

    /// One JSON-RPC call. Network failures map to `Unavailable`; the caller decides whether a
    /// broadcast failure should instead be reported as `Unknown`.
    fn call(&self, method: &str, params: Value) -> Result<Value, SolanaProviderError> {
        let id = {
            let mut next = self.next_id.lock().expect("Solana request id");
            let id = *next;
            *next += 1;
            id
        };
        let body = json!({"jsonrpc": "2.0", "id": id, "method": method, "params": params});
        let response = self.request_gate.run(|| {
            self.client
                .post(self.endpoint.clone())
                .json(&body)
                .send()
                .map_err(|error| {
                    SolanaProviderError::unavailable(format!("{method} request failed: {error}"))
                })
        })?;
        let status = response.status();
        let text = response.text().map_err(|error| {
            SolanaProviderError::unavailable(format!("{method} response unreadable: {error}"))
        })?;
        if !status.is_success() {
            let message = format!("{method} failed with HTTP {status}: {}", detail(&text));
            return Err(
                if status == StatusCode::TOO_MANY_REQUESTS || status.is_server_error() {
                    SolanaProviderError::unavailable(message)
                } else {
                    SolanaProviderError::rejected(message)
                },
            );
        }
        let envelope: JsonRpcEnvelope = serde_json::from_str(&text).map_err(|error| {
            SolanaProviderError::unavailable(format!("{method} response parse failed: {error}"))
        })?;
        if let Some(error) = envelope.error {
            return Err(SolanaProviderError::rejected(format!(
                "{method} rejected by node ({}): {}",
                error.code,
                detail(&error.message)
            )));
        }
        Ok(envelope.result.unwrap_or(Value::Null))
    }

    /// Result of a method that wraps its payload in `{"context": …, "value": …}`.
    fn call_value(&self, method: &str, params: Value) -> Result<Value, SolanaProviderError> {
        let result = self.call(method, params)?;
        result
            .get("value")
            .cloned()
            .ok_or_else(|| SolanaProviderError::unavailable(format!("{method} returned no value")))
    }
}

fn lamports(method: &str, value: &Value) -> Result<u64, SolanaProviderError> {
    value.as_u64().ok_or_else(|| {
        SolanaProviderError::unavailable(format!("{method} returned a non-integer amount"))
    })
}

impl SolanaProvider for SolanaRpcProvider {
    fn provider_status(&self) -> WalletProviderStatus {
        WalletProviderStatus::Ready
    }

    fn balance(&self, address: &str) -> Result<u64, SolanaProviderError> {
        let value = self.call_value("getBalance", json!([address, {"commitment": COMMITMENT}]))?;
        lamports("getBalance", &value)
    }

    fn latest_blockhash(&self) -> Result<SolanaBlockhash, SolanaProviderError> {
        let value = self.call_value("getLatestBlockhash", json!([{"commitment": COMMITMENT}]))?;
        let parsed: LatestBlockhash = serde_json::from_value(value).map_err(|error| {
            SolanaProviderError::unavailable(format!("getLatestBlockhash parse failed: {error}"))
        })?;
        if parsed.blockhash.is_empty() {
            return Err(SolanaProviderError::unavailable(
                "getLatestBlockhash returned an empty blockhash",
            ));
        }
        Ok(SolanaBlockhash {
            blockhash: parsed.blockhash,
            last_valid_block_height: parsed.last_valid_block_height,
        })
    }

    fn block_height(&self) -> Result<u64, SolanaProviderError> {
        let value = self.call("getBlockHeight", json!([{"commitment": COMMITMENT}]))?;
        value.as_u64().ok_or_else(|| {
            SolanaProviderError::unavailable("getBlockHeight returned a non-integer height")
        })
    }

    fn minimum_balance_for_rent_exemption(
        &self,
        data_len: u64,
    ) -> Result<u64, SolanaProviderError> {
        let value = self.call(
            "getMinimumBalanceForRentExemption",
            json!([data_len, {"commitment": COMMITMENT}]),
        )?;
        lamports("getMinimumBalanceForRentExemption", &value)
    }

    fn fee_for_message(&self, message_base64: &str) -> Result<u64, SolanaProviderError> {
        let value = self.call_value(
            "getFeeForMessage",
            json!([message_base64, {"commitment": COMMITMENT}]),
        )?;
        // Nodes answer `null` for a blockhash they no longer track; the base per-signature fee
        // still lets Core show a total and the node re-validates the blockhash on submit.
        if value.is_null() {
            return Ok(SOLANA_DEFAULT_SIGNATURE_FEE_LAMPORTS);
        }
        lamports("getFeeForMessage", &value)
    }

    fn recent_prioritization_fees(
        &self,
        addresses: &[&str],
    ) -> Result<Vec<u64>, SolanaProviderError> {
        let value = self.call("getRecentPrioritizationFees", json!([addresses]))?;
        let entries: Vec<PrioritizationFee> = serde_json::from_value(value).map_err(|error| {
            SolanaProviderError::unavailable(format!(
                "getRecentPrioritizationFees parse failed: {error}"
            ))
        })?;
        Ok(entries
            .into_iter()
            .map(|entry| entry.prioritization_fee)
            .collect())
    }

    fn send_transaction(&self, transaction_base64: &str) -> Result<String, SolanaProviderError> {
        let params = json!([
            transaction_base64,
            {"encoding": "base64", "skipPreflight": false, "preflightCommitment": COMMITMENT}
        ]);
        match self.call("sendTransaction", params) {
            Ok(value) => value.as_str().map(str::to_string).ok_or_else(|| {
                SolanaProviderError::unknown("sendTransaction returned no signature")
            }),
            // A transport failure after the request left the device leaves the outcome unknown;
            // Core then keeps the transaction for reconciliation instead of treating it as rejected.
            Err(error) if error.kind == SolanaProviderErrorKind::Unavailable => {
                Err(SolanaProviderError::unknown(format!(
                    "Solana broadcast outcome unknown: {}",
                    error.message
                )))
            }
            Err(error) => Err(error),
        }
    }

    fn signature_status(
        &self,
        signature: &str,
    ) -> Result<Option<SolanaSignatureStatus>, SolanaProviderError> {
        let value = self.call_value(
            "getSignatureStatuses",
            json!([[signature], {"searchTransactionHistory": true}]),
        )?;
        let Some(entry) = value.as_array().and_then(|statuses| statuses.first()) else {
            return Err(SolanaProviderError::unavailable(
                "getSignatureStatuses returned no entries",
            ));
        };
        if entry.is_null() {
            return Ok(None);
        }
        let parsed: SignatureStatus = serde_json::from_value(entry.clone()).map_err(|error| {
            SolanaProviderError::unavailable(format!("getSignatureStatuses parse failed: {error}"))
        })?;
        Ok(Some(SolanaSignatureStatus {
            finalized: parsed.confirmation_status.as_deref() == Some("finalized"),
            failed: !parsed.err.is_null(),
            slot: parsed.slot,
        }))
    }

    fn signatures_for_address(
        &self,
        address: &str,
        limit: u32,
        before: Option<&str>,
    ) -> Result<Vec<SolanaSignatureInfo>, SolanaProviderError> {
        let mut options = json!({"limit": limit, "commitment": HISTORY_COMMITMENT});
        if let Some(before) = before {
            options["before"] = json!(before);
        }
        let value = self.call("getSignaturesForAddress", json!([address, options]))?;
        let entries: Vec<SignatureInfo> = serde_json::from_value(value).map_err(|error| {
            SolanaProviderError::unavailable(format!(
                "getSignaturesForAddress parse failed: {error}"
            ))
        })?;
        Ok(entries
            .into_iter()
            .map(|entry| SolanaSignatureInfo {
                signature: entry.signature,
                slot: entry.slot,
                block_time: entry.block_time.and_then(|time| u64::try_from(time).ok()),
                failed: !entry.err.is_null(),
                finalized: entry.confirmation_status.as_deref() == Some("finalized"),
            })
            .collect())
    }

    fn transaction(
        &self,
        signature: &str,
    ) -> Result<Option<SolanaTransactionDetails>, SolanaProviderError> {
        let value = self.call(
            "getTransaction",
            json!([
                signature,
                {
                    "encoding": "jsonParsed",
                    "maxSupportedTransactionVersion": 0,
                    "commitment": HISTORY_COMMITMENT
                }
            ]),
        )?;
        if value.is_null() {
            return Ok(None);
        }
        let parsed: TransactionResponse = serde_json::from_value(value).map_err(|error| {
            SolanaProviderError::unavailable(format!("getTransaction parse failed: {error}"))
        })?;
        let account_keys = parsed
            .transaction
            .message
            .account_keys
            .into_iter()
            .filter_map(|key| match key {
                Value::String(pubkey) => Some(pubkey),
                Value::Object(mut object) => match object.remove("pubkey") {
                    Some(Value::String(pubkey)) => Some(pubkey),
                    _ => None,
                },
                _ => None,
            })
            .collect();
        Ok(Some(SolanaTransactionDetails {
            slot: parsed.slot,
            block_time: parsed.block_time.and_then(|time| u64::try_from(time).ok()),
            fee: parsed.meta.fee,
            failed: !parsed.meta.err.is_null(),
            account_keys,
            pre_balances: parsed.meta.pre_balances,
            post_balances: parsed.meta.post_balances,
        }))
    }
}

#[derive(Debug, Deserialize)]
struct PrioritizationFee {
    #[serde(rename = "prioritizationFee", default)]
    prioritization_fee: u64,
}

#[derive(Debug, Deserialize)]
struct SignatureInfo {
    signature: String,
    #[serde(default)]
    slot: Option<u64>,
    #[serde(default)]
    err: Value,
    #[serde(rename = "blockTime", default)]
    block_time: Option<i64>,
    #[serde(rename = "confirmationStatus", default)]
    confirmation_status: Option<String>,
}

#[derive(Debug, Deserialize)]
struct TransactionResponse {
    #[serde(default)]
    slot: Option<u64>,
    #[serde(rename = "blockTime", default)]
    block_time: Option<i64>,
    meta: TransactionMeta,
    transaction: TransactionBody,
}

#[derive(Debug, Deserialize)]
struct TransactionMeta {
    #[serde(default)]
    err: Value,
    #[serde(default)]
    fee: u64,
    #[serde(rename = "preBalances", default)]
    pre_balances: Vec<u64>,
    #[serde(rename = "postBalances", default)]
    post_balances: Vec<u64>,
}

#[derive(Debug, Deserialize)]
struct TransactionBody {
    message: TransactionMessage,
}

#[derive(Debug, Deserialize)]
struct TransactionMessage {
    /// `jsonParsed` emits `{pubkey, signer, writable, source}` objects (lookup-table keys
    /// included); other encodings emit plain strings.
    #[serde(rename = "accountKeys", default)]
    account_keys: Vec<Value>,
}

#[derive(Debug, Deserialize)]
struct JsonRpcEnvelope {
    #[serde(default)]
    result: Option<Value>,
    #[serde(default)]
    error: Option<JsonRpcError>,
}

#[derive(Debug, Deserialize)]
struct JsonRpcError {
    #[serde(default)]
    code: i64,
    #[serde(default)]
    message: String,
}

#[derive(Debug, Deserialize)]
struct LatestBlockhash {
    #[serde(default)]
    blockhash: String,
    #[serde(rename = "lastValidBlockHeight")]
    last_valid_block_height: u64,
}

#[derive(Debug, Deserialize)]
struct SignatureStatus {
    #[serde(default)]
    slot: Option<u64>,
    #[serde(default)]
    err: Value,
    #[serde(rename = "confirmationStatus", default)]
    confirmation_status: Option<String>,
}

fn detail(text: &str) -> String {
    let single_line: String = text
        .chars()
        .map(|character| {
            if character.is_control() {
                ' '
            } else {
                character
            }
        })
        .collect();
    let trimmed = single_line.trim();
    if trimmed.len() > 256 {
        format!("{}…", &trimmed[..trimmed.floor_char_boundary(256)])
    } else {
        trimmed.to_string()
    }
}

fn parse_endpoint(url: &str) -> Result<Url, String> {
    let url = Url::parse(url.trim())
        .map_err(|error| format!("invalid CHROMVOID_SOL_RPC_URL: {error}"))?;
    if url.scheme() != "http" && url.scheme() != "https" {
        return Err("CHROMVOID_SOL_RPC_URL must be http or https".to_string());
    }
    Ok(url)
}

struct SolanaRequestGate {
    min_request_interval: Duration,
    request_lane: Mutex<()>,
    last_request: Mutex<Option<Instant>>,
}

impl SolanaRequestGate {
    fn new(min_request_interval: Duration) -> Self {
        Self {
            min_request_interval,
            request_lane: Mutex::new(()),
            last_request: Mutex::new(None),
        }
    }

    fn run<T>(
        &self,
        request: impl FnOnce() -> Result<T, SolanaProviderError>,
    ) -> Result<T, SolanaProviderError> {
        let _lane = self.request_lane.lock().expect("Solana request lane");
        if !self.min_request_interval.is_zero() {
            let mut guard = self.last_request.lock().expect("Solana rate limiter");
            if let Some(last) = *guard {
                let elapsed = last.elapsed();
                if elapsed < self.min_request_interval {
                    thread::sleep(self.min_request_interval - elapsed);
                }
            }
            *guard = Some(Instant::now());
        }
        request()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_http::{TestResponse, TestServer};

    #[test]
    fn endpoint_requires_http_scheme() {
        assert!(parse_endpoint("ftp://rpc.example").is_err());
        assert_eq!(
            parse_endpoint(" https://api.mainnet-beta.solana.com ")
                .expect("url")
                .as_str(),
            "https://api.mainnet-beta.solana.com/"
        );
    }

    #[test]
    fn balance_blockhash_fee_broadcast_and_status_follow_json_rpc_semantics() {
        let server = TestServer::new(vec![
            TestResponse::json(
                200,
                r#"{"jsonrpc":"2.0","id":1,"result":{"context":{"slot":1},"value":1000000000}}"#,
            ),
            TestResponse::json(
                200,
                r#"{"jsonrpc":"2.0","id":2,"result":{"context":{"slot":1},"value":{"blockhash":"H8UvHwUaXKmHyr1UzEyCZjJfxxYqYNhrsxQgSc2WbHg8","lastValidBlockHeight":312345678}}}"#,
            ),
            TestResponse::json(200, r#"{"jsonrpc":"2.0","id":3,"result":312345600}"#),
            TestResponse::json(200, r#"{"jsonrpc":"2.0","id":4,"result":890880}"#),
            TestResponse::json(
                200,
                r#"{"jsonrpc":"2.0","id":5,"result":{"context":{"slot":1},"value":null}}"#,
            ),
            TestResponse::json(
                200,
                r#"{"jsonrpc":"2.0","id":6,"result":{"context":{"slot":1},"value":7500}}"#,
            ),
            TestResponse::json(
                200,
                r#"{"jsonrpc":"2.0","id":7,"result":[{"slot":100,"prioritizationFee":0},{"slot":101,"prioritizationFee":2500},{"slot":102,"prioritizationFee":10000}]}"#,
            ),
            TestResponse::json(
                200,
                r#"{"jsonrpc":"2.0","id":8,"error":{"code":-32002,"message":"Transaction simulation failed: Blockhash not found"}}"#,
            ),
            TestResponse::json(
                200,
                r#"{"jsonrpc":"2.0","id":8,"result":"5VERv8NMvzbJMEkV8xnrLkEaWRtSz9CosKDYjCJjBRnbJLgp8uirBgmQpjKhoR4tjF3ZpRzrFmBV6UjKdiSZkQUW"}"#,
            ),
            TestResponse::json(
                200,
                r#"{"jsonrpc":"2.0","id":9,"result":{"context":{"slot":1},"value":[null]}}"#,
            ),
            TestResponse::json(
                200,
                r#"{"jsonrpc":"2.0","id":10,"result":{"context":{"slot":1},"value":[{"slot":48,"confirmations":3,"err":null,"confirmationStatus":"confirmed"}]}}"#,
            ),
            TestResponse::json(
                200,
                r#"{"jsonrpc":"2.0","id":11,"result":{"context":{"slot":1},"value":[{"slot":50,"confirmations":null,"err":{"InstructionError":[0,"Custom"]},"confirmationStatus":"finalized"}]}}"#,
            ),
            TestResponse::json(429, r#"{"error":"slow down"}"#),
        ]);
        let provider =
            SolanaRpcProvider::new(SolanaRpcProviderConfig::test(server.url())).expect("provider");
        let address = "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin";
        let signature = "5VERv8NMvzbJMEkV8xnrLkEaWRtSz9CosKDYjCJjBRnbJLgp8uirBgmQpjKhoR4tjF3ZpRzrFmBV6UjKdiSZkQUW";

        assert_eq!(provider.balance(address).expect("balance"), 1_000_000_000);
        let blockhash = provider.latest_blockhash().expect("blockhash");
        assert_eq!(
            blockhash.blockhash,
            "H8UvHwUaXKmHyr1UzEyCZjJfxxYqYNhrsxQgSc2WbHg8"
        );
        assert_eq!(blockhash.last_valid_block_height, 312_345_678);
        assert_eq!(provider.block_height().expect("height"), 312_345_600);
        assert_eq!(
            provider
                .minimum_balance_for_rent_exemption(0)
                .expect("rent"),
            890_880
        );
        assert_eq!(
            provider.fee_for_message("AQAB").expect("fee fallback"),
            SOLANA_DEFAULT_SIGNATURE_FEE_LAMPORTS
        );
        assert_eq!(provider.fee_for_message("AQAB").expect("fee"), 7_500);
        assert_eq!(
            provider
                .recent_prioritization_fees(&[address])
                .expect("prioritization fees"),
            vec![0, 2_500, 10_000]
        );
        let rejected = provider.send_transaction("AQAB").expect_err("rejected");
        assert_eq!(rejected.kind, SolanaProviderErrorKind::Rejected);
        assert!(rejected.message.contains("Blockhash not found"));
        assert_eq!(provider.send_transaction("AQAB").expect("sent"), signature);
        assert_eq!(provider.signature_status(signature).expect("missing"), None);
        assert_eq!(
            provider.signature_status(signature).expect("confirmed"),
            Some(SolanaSignatureStatus {
                finalized: false,
                failed: false,
                slot: Some(48)
            })
        );
        assert_eq!(
            provider.signature_status(signature).expect("failed"),
            Some(SolanaSignatureStatus {
                finalized: true,
                failed: true,
                slot: Some(50)
            })
        );
        let throttled = provider.block_height().expect_err("throttled");
        assert_eq!(throttled.kind, SolanaProviderErrorKind::Unavailable);

        assert_eq!(
            server.json_rpc_methods(),
            [
                "getBalance",
                "getLatestBlockhash",
                "getBlockHeight",
                "getMinimumBalanceForRentExemption",
                "getFeeForMessage",
                "getFeeForMessage",
                "getRecentPrioritizationFees",
                "sendTransaction",
                "sendTransaction",
                "getSignatureStatuses",
                "getSignatureStatuses",
                "getSignatureStatuses",
                "getBlockHeight",
            ]
        );
        let requests = server.requests();
        assert!(requests.iter().all(|request| request.method == "POST"));
        let balance_call: Value = serde_json::from_str(&requests[0].body).expect("json");
        assert_eq!(
            balance_call["params"],
            json!([address, {"commitment": "finalized"}])
        );
        let fees_call: Value = serde_json::from_str(&requests[6].body).expect("json");
        assert_eq!(fees_call["params"], json!([[address]]));
        let send_call: Value = serde_json::from_str(&requests[7].body).expect("json");
        assert_eq!(send_call["params"][1]["encoding"], "base64");
        assert_eq!(send_call["params"][1]["skipPreflight"], false);
        let status_call: Value = serde_json::from_str(&requests[9].body).expect("json");
        assert_eq!(
            status_call["params"],
            json!([[signature], {"searchTransactionHistory": true}])
        );
    }

    #[test]
    fn signatures_and_transaction_details_follow_json_rpc_semantics() {
        let server = TestServer::new(vec![
            TestResponse::json(
                200,
                r#"{"jsonrpc":"2.0","id":1,"result":[
                    {"signature":"sig-1","slot":48,"err":null,"memo":null,"blockTime":1710000000,"confirmationStatus":"finalized"},
                    {"signature":"sig-2","slot":47,"err":{"InstructionError":[0,"Custom"]},"blockTime":null,"confirmationStatus":"confirmed"}
                ]}"#,
            ),
            TestResponse::json(
                200,
                r#"{"jsonrpc":"2.0","id":2,"result":{
                    "slot":48,
                    "blockTime":1710000000,
                    "meta":{"err":null,"fee":5000,"preBalances":[1000000,0,1],"postBalances":[895000,100000,1],"loadedAddresses":{"readonly":[],"writable":[]}},
                    "transaction":{"message":{"accountKeys":[
                        {"pubkey":"9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin","signer":true,"writable":true,"source":"transaction"},
                        {"pubkey":"3yFwqXBfZY4jBVUafQ1YEXw189y2dN3V5KQq9uzBDy1E","signer":false,"writable":true,"source":"transaction"},
                        "11111111111111111111111111111111"
                    ]}}
                }}"#,
            ),
            TestResponse::json(200, r#"{"jsonrpc":"2.0","id":3,"result":null}"#),
        ]);
        let provider =
            SolanaRpcProvider::new(SolanaRpcProviderConfig::test(server.url())).expect("provider");
        let address = "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin";

        let signatures = provider
            .signatures_for_address(address, 25, Some("sig-0"))
            .expect("signatures");
        assert_eq!(
            signatures,
            vec![
                SolanaSignatureInfo {
                    signature: "sig-1".to_string(),
                    slot: Some(48),
                    block_time: Some(1_710_000_000),
                    failed: false,
                    finalized: true,
                },
                SolanaSignatureInfo {
                    signature: "sig-2".to_string(),
                    slot: Some(47),
                    block_time: None,
                    failed: true,
                    finalized: false,
                },
            ]
        );
        let details = provider
            .transaction("sig-1")
            .expect("transaction")
            .expect("known");
        assert_eq!(
            details,
            SolanaTransactionDetails {
                slot: Some(48),
                block_time: Some(1_710_000_000),
                fee: 5_000,
                failed: false,
                account_keys: vec![
                    address.to_string(),
                    "3yFwqXBfZY4jBVUafQ1YEXw189y2dN3V5KQq9uzBDy1E".to_string(),
                    "11111111111111111111111111111111".to_string(),
                ],
                pre_balances: vec![1_000_000, 0, 1],
                post_balances: vec![895_000, 100_000, 1],
            }
        );
        assert_eq!(provider.transaction("sig-2").expect("missing"), None);

        assert_eq!(
            server.json_rpc_methods(),
            [
                "getSignaturesForAddress",
                "getTransaction",
                "getTransaction"
            ]
        );
        let requests = server.requests();
        let signatures_call: Value = serde_json::from_str(&requests[0].body).expect("json");
        assert_eq!(
            signatures_call["params"],
            json!([address, {"limit": 25, "commitment": "confirmed", "before": "sig-0"}])
        );
        let transaction_call: Value = serde_json::from_str(&requests[1].body).expect("json");
        assert_eq!(transaction_call["params"][0], "sig-1");
        assert_eq!(transaction_call["params"][1]["encoding"], "jsonParsed");
        assert_eq!(
            transaction_call["params"][1]["maxSupportedTransactionVersion"],
            0
        );
    }

    #[test]
    fn broadcast_transport_failure_is_reported_as_unknown_outcome() {
        let provider = SolanaRpcProvider::new(SolanaRpcProviderConfig::test(
            Url::parse("http://127.0.0.1:9/").expect("unreachable url"),
        ))
        .expect("provider");
        let error = provider.send_transaction("AQAB").expect_err("unreachable");
        assert_eq!(error.kind, SolanaProviderErrorKind::Unknown);
        let error = provider.block_height().expect_err("unreachable");
        assert_eq!(error.kind, SolanaProviderErrorKind::Unavailable);
    }
}
