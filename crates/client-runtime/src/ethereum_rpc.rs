//! Ethereum mainnet provider over a public JSON-RPC endpoint (EIP-1474 methods only) plus a
//! Blockscout v2 REST indexer for address history.
//!
//! Core signs EIP-1559 transactions itself, so this provider only needs balances, nonces,
//! contract-code checks, EIP-1559 fee data, raw broadcast, receipts/transaction lookups and the
//! chain head (`eth_blockNumber` plus the `finalized` block) for confirmation depth. Every
//! quantity crosses the boundary as a decimal string because Core parses amounts as unsigned
//! decimal integers.
//! JSON-RPC cannot list an address's transactions, so `address_transactions` goes to the indexer
//! (`GET {CHROMVOID_ETH_INDEXER_URL}/api/v2/addresses/{address}/transactions`).

use std::sync::Mutex;
use std::thread;
use std::time::{Duration, Instant};

use chromvoid_core::rpc::types::{WalletFeeTier, WalletProviderStatus};
use chromvoid_core::wallet::ethereum::{
    EthereumAccountSnapshot, EthereumAddressTransaction, EthereumChainHead, EthereumFeeEstimate,
    EthereumProvider, EthereumProviderError, EthereumProviderErrorKind, EthereumTransactionLookup,
    EthereumTransactionReceipt,
};
use reqwest::blocking::Client;
use reqwest::{StatusCode, Url};
use serde::Deserialize;
use serde_json::{Value, json};

const DEFAULT_PROVIDER_TIMEOUT: Duration = Duration::from_secs(10);
const DEFAULT_REQUEST_INTERVAL: Duration = Duration::from_millis(200);
/// Blocks sampled for priority-fee percentiles.
const FEE_HISTORY_BLOCKS: u64 = 5;
/// Floor for the priority fee so a quiet network still gets included (0.1 gwei).
const MIN_PRIORITY_FEE_WEI: u128 = 100_000_000;

pub(super) struct EthereumRpcProvider {
    client: Client,
    endpoint: Url,
    indexer_base_url: Url,
    request_gate: EthereumRequestGate,
    next_id: Mutex<u64>,
}

pub(super) struct EthereumRpcProviderConfig {
    endpoint: Url,
    indexer_base_url: Url,
    min_request_interval: Duration,
    timeout: Duration,
}

impl EthereumRpcProviderConfig {
    fn from_urls(rpc_url: &str, indexer_url: &str) -> Result<Self, String> {
        Ok(Self {
            endpoint: parse_endpoint(rpc_url)?,
            indexer_base_url: parse_indexer_base_url(indexer_url)?,
            min_request_interval: DEFAULT_REQUEST_INTERVAL,
            timeout: DEFAULT_PROVIDER_TIMEOUT,
        })
    }

    #[cfg(test)]
    fn test(endpoint: Url) -> Self {
        Self {
            indexer_base_url: endpoint.clone(),
            endpoint,
            min_request_interval: Duration::ZERO,
            timeout: Duration::from_secs(2),
        }
    }
}

impl EthereumRpcProvider {
    /// `rpc_url` serves JSON-RPC; `indexer_url` is the Blockscout instance used for history.
    pub(super) fn mainnet_from_url(rpc_url: &str, indexer_url: &str) -> Result<Self, String> {
        Self::new(EthereumRpcProviderConfig::from_urls(rpc_url, indexer_url)?)
    }

    fn new(config: EthereumRpcProviderConfig) -> Result<Self, String> {
        let client = Client::builder()
            .timeout(config.timeout)
            .user_agent("ChromVoid Ethereum wallet/1.0")
            .build()
            .map_err(|error| format!("failed to build Ethereum HTTP client: {error}"))?;
        Ok(Self {
            client,
            endpoint: config.endpoint,
            indexer_base_url: config.indexer_base_url,
            request_gate: EthereumRequestGate::new(config.min_request_interval),
            next_id: Mutex::new(1),
        })
    }

    /// One indexer REST call (shares the JSON-RPC rate gate). HTTP 429/5xx map to `Unavailable`,
    /// other failures to `Rejected`.
    fn indexer_get(&self, path: &str) -> Result<Value, EthereumProviderError> {
        let url = self.indexer_base_url.join(path).map_err(|error| {
            EthereumProviderError::unavailable(format!("invalid indexer endpoint: {error}"))
        })?;
        let response = self.request_gate.run(|| {
            self.client.get(url.clone()).send().map_err(|error| {
                EthereumProviderError::unavailable(format!("indexer request failed: {error}"))
            })
        })?;
        let status = response.status();
        let text = response.text().map_err(|error| {
            EthereumProviderError::unavailable(format!("indexer response unreadable: {error}"))
        })?;
        if !status.is_success() {
            let message = format!(
                "indexer {path} failed with HTTP {status}: {}",
                detail(&text)
            );
            return Err(
                if status == StatusCode::TOO_MANY_REQUESTS || status.is_server_error() {
                    EthereumProviderError::unavailable(message)
                } else {
                    EthereumProviderError::rejected(message)
                },
            );
        }
        serde_json::from_str(&text).map_err(|error| {
            EthereumProviderError::unavailable(format!("indexer response parse failed: {error}"))
        })
    }

    /// One JSON-RPC call. Network failures map to `Unavailable`; the caller decides whether a
    /// broadcast failure should instead be reported as `Unknown`.
    fn call(&self, method: &str, params: Value) -> Result<Value, EthereumProviderError> {
        let id = {
            let mut next = self.next_id.lock().expect("Ethereum request id");
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
                    EthereumProviderError::unavailable(format!("{method} request failed: {error}"))
                })
        })?;
        let status = response.status();
        let text = response.text().map_err(|error| {
            EthereumProviderError::unavailable(format!("{method} response unreadable: {error}"))
        })?;
        if !status.is_success() {
            let message = format!("{method} failed with HTTP {status}: {}", detail(&text));
            return Err(
                if status == StatusCode::TOO_MANY_REQUESTS || status.is_server_error() {
                    EthereumProviderError::unavailable(message)
                } else {
                    EthereumProviderError::rejected(message)
                },
            );
        }
        let envelope: JsonRpcEnvelope = serde_json::from_str(&text).map_err(|error| {
            EthereumProviderError::unavailable(format!("{method} response parse failed: {error}"))
        })?;
        if let Some(error) = envelope.error {
            return Err(EthereumProviderError::rejected(format!(
                "{method} rejected by node ({}): {}",
                error.code,
                detail(&error.message)
            )));
        }
        Ok(envelope.result.unwrap_or(Value::Null))
    }

    fn quantity(&self, method: &str, params: Value) -> Result<String, EthereumProviderError> {
        let value = self.call(method, params)?;
        let hex = value.as_str().ok_or_else(|| {
            EthereumProviderError::unavailable(format!("{method} returned a non-string quantity"))
        })?;
        hex_quantity_to_decimal(hex)
            .map_err(|error| EthereumProviderError::unavailable(format!("{method}: {error}")))
    }

    fn quantity_u64(&self, method: &str, params: Value) -> Result<u64, EthereumProviderError> {
        let value = self.call(method, params)?;
        let hex = value.as_str().ok_or_else(|| {
            EthereumProviderError::unavailable(format!("{method} returned a non-string quantity"))
        })?;
        hex_quantity_to_u64(hex)
            .map_err(|error| EthereumProviderError::unavailable(format!("{method}: {error}")))
    }
}

impl EthereumProvider for EthereumRpcProvider {
    fn provider_status(&self) -> WalletProviderStatus {
        WalletProviderStatus::Ready
    }

    fn chain_id(&self) -> Result<u64, EthereumProviderError> {
        self.quantity_u64("eth_chainId", json!([]))
    }

    fn account_snapshot(
        &self,
        address: &str,
    ) -> Result<EthereumAccountSnapshot, EthereumProviderError> {
        let balance = self.quantity("eth_getBalance", json!([address, "latest"]))?;
        let pending_nonce =
            self.quantity_u64("eth_getTransactionCount", json!([address, "pending"]))?;
        Ok(EthereumAccountSnapshot {
            balance,
            pending_nonce,
        })
    }

    fn code_at(&self, address: &str) -> Result<Vec<u8>, EthereumProviderError> {
        let value = self.call("eth_getCode", json!([address, "latest"]))?;
        let hex = value.as_str().unwrap_or("0x");
        hex::decode(hex.trim_start_matches("0x")).map_err(|error| {
            EthereumProviderError::unavailable(format!("eth_getCode returned invalid hex: {error}"))
        })
    }

    fn fee_estimate(
        &self,
        tier: WalletFeeTier,
    ) -> Result<EthereumFeeEstimate, EthereumProviderError> {
        let percentile = match tier {
            WalletFeeTier::Slow => 10,
            WalletFeeTier::Standard => 50,
            WalletFeeTier::Fast => 90,
        };
        let history: FeeHistory = serde_json::from_value(self.call(
            "eth_feeHistory",
            json!([format!("0x{FEE_HISTORY_BLOCKS:x}"), "latest", [percentile]]),
        )?)
        .map_err(|error| {
            EthereumProviderError::unavailable(format!("eth_feeHistory parse failed: {error}"))
        })?;
        fee_estimate_from_history(&history, tier)
            .map_err(|error| EthereumProviderError::unavailable(format!("eth_feeHistory: {error}")))
    }

    fn broadcast_raw_transaction(&self, raw_tx: &str) -> Result<String, EthereumProviderError> {
        match self.call("eth_sendRawTransaction", json!([raw_tx])) {
            Ok(value) => value
                .as_str()
                .map(str::to_string)
                .ok_or_else(|| EthereumProviderError {
                    kind: EthereumProviderErrorKind::Unknown,
                    message: "eth_sendRawTransaction returned no hash".to_string(),
                }),
            // A transport failure after the request left the device leaves the outcome unknown;
            // Core then keeps the transaction for reconciliation instead of treating it as rejected.
            Err(error) if error.kind == EthereumProviderErrorKind::Unavailable => {
                Err(EthereumProviderError {
                    kind: EthereumProviderErrorKind::Unknown,
                    message: format!("Ethereum broadcast outcome unknown: {}", error.message),
                })
            }
            Err(error) => Err(error),
        }
    }

    fn transaction_receipt(
        &self,
        tx_hash: &str,
    ) -> Result<Option<EthereumTransactionReceipt>, EthereumProviderError> {
        let receipt = self.call("eth_getTransactionReceipt", json!([tx_hash]))?;
        let Some(receipt) = receipt.as_object() else {
            return Ok(None);
        };
        let block_number = block_number_field(receipt.get("blockNumber"))
            .map_err(|error| {
                EthereumProviderError::unavailable(format!("receipt block number: {error}"))
            })?
            .ok_or_else(|| EthereumProviderError::unavailable("receipt without a block number"))?;
        Ok(Some(EthereumTransactionReceipt {
            block_number,
            failed: receipt.get("status").and_then(Value::as_str) == Some("0x0"),
        }))
    }

    fn transaction_by_hash(
        &self,
        tx_hash: &str,
    ) -> Result<Option<EthereumTransactionLookup>, EthereumProviderError> {
        let transaction = self.call("eth_getTransactionByHash", json!([tx_hash]))?;
        let Some(transaction) = transaction.as_object() else {
            return Ok(None);
        };
        Ok(Some(EthereumTransactionLookup {
            block_number: block_number_field(transaction.get("blockNumber")).map_err(|error| {
                EthereumProviderError::unavailable(format!("transaction block number: {error}"))
            })?,
        }))
    }

    fn chain_head(&self) -> Result<EthereumChainHead, EthereumProviderError> {
        let latest_block_number = self.quantity_u64("eth_blockNumber", json!([]))?;
        // Nodes without the `finalized` tag answer with an error; Core then falls back to a
        // canonical-block depth, so only transport failures are surfaced.
        let finalized_block_number =
            match self.call("eth_getBlockByNumber", json!(["finalized", false])) {
                Ok(block) => block_number_field(block.get("number")).map_err(|error| {
                    EthereumProviderError::unavailable(format!("finalized block number: {error}"))
                })?,
                Err(error) if error.kind == EthereumProviderErrorKind::Rejected => None,
                Err(error) => return Err(error),
            };
        Ok(EthereumChainHead {
            latest_block_number,
            finalized_block_number,
        })
    }

    fn address_transactions(
        &self,
        address: &str,
        limit: u32,
    ) -> Result<Vec<EthereumAddressTransaction>, EthereumProviderError> {
        let page: BlockscoutTransactionsPage = serde_json::from_value(
            self.indexer_get(&format!("api/v2/addresses/{address}/transactions"))?,
        )
        .map_err(|error| {
            EthereumProviderError::unavailable(format!(
                "indexer transactions parse failed: {error}"
            ))
        })?;
        page.items
            .into_iter()
            .take(limit as usize)
            .map(BlockscoutTransaction::into_transaction)
            .collect::<Result<Vec<_>, _>>()
            .map_err(EthereumProviderError::unavailable)
    }
}

/// A `blockNumber`/`number` field: `null` (pending) or a hex quantity.
fn block_number_field(value: Option<&Value>) -> Result<Option<u64>, String> {
    value
        .filter(|value| !value.is_null())
        .map(|value| {
            value
                .as_str()
                .ok_or_else(|| "block number is not a string".to_string())
                .and_then(hex_quantity_to_u64)
        })
        .transpose()
}

/// `GET /api/v2/addresses/{address}/transactions` (Blockscout v2); only the fields Core needs.
#[derive(Debug, Deserialize)]
struct BlockscoutTransactionsPage {
    #[serde(default)]
    items: Vec<BlockscoutTransaction>,
}

#[derive(Debug, Deserialize)]
struct BlockscoutTransaction {
    hash: String,
    from: BlockscoutAddress,
    #[serde(default)]
    to: Option<BlockscoutAddress>,
    #[serde(default)]
    value: Value,
    #[serde(default)]
    gas_used: Value,
    #[serde(default)]
    gas_price: Value,
    #[serde(default)]
    fee: Option<BlockscoutFee>,
    /// Older instances name this `block`.
    #[serde(default, alias = "block")]
    block_number: Option<u64>,
    /// RFC 3339 (`2024-01-01T00:00:00.000000Z`).
    #[serde(default)]
    timestamp: Option<String>,
    /// `"ok"`, `"error"` or `null` while pending.
    #[serde(default)]
    status: Option<String>,
}

#[derive(Debug, Deserialize)]
struct BlockscoutAddress {
    #[serde(default)]
    hash: String,
}

#[derive(Debug, Deserialize)]
struct BlockscoutFee {
    #[serde(default)]
    value: Value,
}

impl BlockscoutTransaction {
    fn into_transaction(self) -> Result<EthereumAddressTransaction, String> {
        if self.hash.trim().is_empty() || self.from.hash.trim().is_empty() {
            return Err("indexer transaction is missing hash or sender".to_string());
        }
        let value = decimal_quantity(&self.value).unwrap_or(0);
        // `gas_used × gas_price` is the actual cost; a pending transaction has neither yet.
        let fee = match (
            decimal_quantity(&self.gas_used),
            decimal_quantity(&self.gas_price),
        ) {
            (Some(gas_used), Some(gas_price)) => gas_used.saturating_mul(gas_price),
            _ => self
                .fee
                .as_ref()
                .and_then(|fee| decimal_quantity(&fee.value))
                .unwrap_or(0),
        };
        let timestamp = self
            .timestamp
            .as_deref()
            .map(|text| {
                rfc3339_to_unix_ms(text)
                    .ok_or_else(|| format!("indexer timestamp {text:?} is not RFC 3339"))
            })
            .transpose()?;
        Ok(EthereumAddressTransaction {
            hash: self.hash,
            from: self.from.hash,
            to: self
                .to
                .map(|to| to.hash)
                .filter(|hash| !hash.trim().is_empty()),
            value: value.to_string(),
            fee: fee.to_string(),
            block_number: self.block_number,
            timestamp,
            failed: self.status.as_deref() == Some("error"),
        })
    }
}

/// Blockscout serializes quantities as decimal strings, occasionally as JSON numbers.
fn decimal_quantity(value: &Value) -> Option<u128> {
    match value {
        Value::String(text) => text.trim().parse::<u128>().ok(),
        Value::Number(number) => number.as_u64().map(u128::from),
        _ => None,
    }
}

/// `YYYY-MM-DDTHH:MM:SS[.fraction](Z|±HH:MM)` → Unix milliseconds. Fractions beyond
/// milliseconds are truncated.
fn rfc3339_to_unix_ms(text: &str) -> Option<u64> {
    let text = text.trim();
    let (date, rest) = text.split_once(['T', 't', ' '])?;
    let mut date_parts = date.split('-');
    let year: i64 = date_parts.next()?.parse().ok()?;
    let month: u32 = date_parts.next()?.parse().ok()?;
    let day: u32 = date_parts.next()?.parse().ok()?;
    if date_parts.next().is_some() || !(1..=12).contains(&month) || !(1..=31).contains(&day) {
        return None;
    }
    let offset_start = rest.rfind(['Z', 'z', '+', '-'])?;
    let (time, offset) = rest.split_at(offset_start);
    let offset_seconds: i64 = match offset {
        "Z" | "z" => 0,
        _ => {
            let (sign, hhmm) = offset.split_at(1);
            let (hours, minutes) = hhmm.split_once(':')?;
            let seconds = hours.parse::<i64>().ok()? * 3_600 + minutes.parse::<i64>().ok()? * 60;
            if sign == "-" { -seconds } else { seconds }
        }
    };
    let (clock, fraction) = time.split_once('.').unwrap_or((time, ""));
    let mut clock_parts = clock.split(':');
    let hour: i64 = clock_parts.next()?.parse().ok()?;
    let minute: i64 = clock_parts.next()?.parse().ok()?;
    let second: i64 = clock_parts.next()?.parse().ok()?;
    if clock_parts.next().is_some() || hour > 23 || minute > 59 || second > 60 {
        return None;
    }
    let millis: i64 = if fraction.is_empty() {
        0
    } else {
        let digits: String = fraction.chars().take(3).collect();
        if !digits.bytes().all(|byte| byte.is_ascii_digit()) {
            return None;
        }
        digits.parse::<i64>().ok()? * 10_i64.pow(3 - digits.len() as u32)
    };
    // Days from civil (Howard Hinnant), proleptic Gregorian.
    let (year, month) = if month <= 2 {
        (year - 1, i64::from(month) + 9)
    } else {
        (year, i64::from(month) - 3)
    };
    let era = year.div_euclid(400);
    let year_of_era = year.rem_euclid(400);
    let day_of_year = (153 * month + 2) / 5 + i64::from(day) - 1;
    let day_of_era = year_of_era * 365 + year_of_era / 4 - year_of_era / 100 + day_of_year;
    let days = era * 146_097 + day_of_era - 719_468;
    let seconds = days * 86_400 + hour * 3_600 + minute * 60 + second - offset_seconds;
    u64::try_from(seconds * 1_000 + millis).ok()
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
struct FeeHistory {
    #[serde(rename = "baseFeePerGas", default)]
    base_fee_per_gas: Vec<String>,
    #[serde(default)]
    reward: Vec<Vec<String>>,
}

/// EIP-1559 fee data from `eth_feeHistory`: the next block's base fee plus the requested
/// percentile of recent priority fees. `max_fee_per_gas` leaves room for two base-fee doublings
/// (slow) up to three (fast) so a transaction stays valid while it waits.
fn fee_estimate_from_history(
    history: &FeeHistory,
    tier: WalletFeeTier,
) -> Result<EthereumFeeEstimate, String> {
    // The last entry is the base fee of the block after the newest sampled one.
    let base_fee = history
        .base_fee_per_gas
        .last()
        .ok_or_else(|| "no base fee in history".to_string())
        .and_then(|hex| hex_quantity_to_u128(hex))?;
    let mut rewards: Vec<u128> = history
        .reward
        .iter()
        .filter_map(|block| block.first())
        .filter_map(|hex| hex_quantity_to_u128(hex).ok())
        .collect();
    rewards.sort_unstable();
    let priority = rewards
        .get(rewards.len() / 2)
        .copied()
        .unwrap_or(MIN_PRIORITY_FEE_WEI)
        .max(MIN_PRIORITY_FEE_WEI);
    let headroom: u128 = match tier {
        WalletFeeTier::Slow => 2,
        WalletFeeTier::Standard => 2,
        WalletFeeTier::Fast => 3,
    };
    let max_fee = base_fee
        .checked_mul(headroom)
        .and_then(|value| value.checked_add(priority))
        .ok_or("fee overflow")?;
    Ok(EthereumFeeEstimate {
        max_fee_per_gas: max_fee.to_string(),
        max_priority_fee_per_gas: priority.to_string(),
        base_fee_per_gas: base_fee.to_string(),
    })
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

fn hex_quantity_to_u64(hex: &str) -> Result<u64, String> {
    let digits = hex.trim().trim_start_matches("0x");
    if digits.is_empty() {
        return Err("empty quantity".to_string());
    }
    u64::from_str_radix(digits, 16).map_err(|error| format!("invalid quantity {hex}: {error}"))
}

fn hex_quantity_to_u128(hex: &str) -> Result<u128, String> {
    let digits = hex.trim().trim_start_matches("0x");
    if digits.is_empty() {
        return Err("empty quantity".to_string());
    }
    u128::from_str_radix(digits, 16).map_err(|error| format!("invalid quantity {hex}: {error}"))
}

/// `0x…` quantity → unsigned decimal string of any width (wei balances exceed u64).
fn hex_quantity_to_decimal(hex: &str) -> Result<String, String> {
    let digits = hex.trim().trim_start_matches("0x");
    if digits.is_empty() || !digits.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Err(format!("invalid quantity {hex}"));
    }
    // Base 10^9 limbs, little-endian; multiply by 16 and add each nibble.
    let mut limbs: Vec<u64> = vec![0];
    for nibble in digits
        .bytes()
        .map(|byte| (byte as char).to_digit(16).unwrap_or(0) as u64)
    {
        let mut carry = nibble;
        for limb in limbs.iter_mut() {
            let value = *limb * 16 + carry;
            *limb = value % 1_000_000_000;
            carry = value / 1_000_000_000;
        }
        while carry > 0 {
            limbs.push(carry % 1_000_000_000);
            carry /= 1_000_000_000;
        }
    }
    let mut out = String::new();
    for (index, limb) in limbs.iter().rev().enumerate() {
        if index == 0 {
            out.push_str(&limb.to_string());
        } else {
            out.push_str(&format!("{limb:09}"));
        }
    }
    Ok(out)
}

fn parse_endpoint(url: &str) -> Result<Url, String> {
    let url = Url::parse(url.trim())
        .map_err(|error| format!("invalid CHROMVOID_ETH_RPC_URL: {error}"))?;
    if url.scheme() != "http" && url.scheme() != "https" {
        return Err("CHROMVOID_ETH_RPC_URL must be http or https".to_string());
    }
    Ok(url)
}

/// Blockscout base URL; a trailing slash keeps `Url::join` from dropping the last path segment.
fn parse_indexer_base_url(url: &str) -> Result<Url, String> {
    let mut url = Url::parse(url.trim())
        .map_err(|error| format!("invalid CHROMVOID_ETH_INDEXER_URL: {error}"))?;
    if url.scheme() != "http" && url.scheme() != "https" {
        return Err("CHROMVOID_ETH_INDEXER_URL must be http or https".to_string());
    }
    if !url.path().ends_with('/') {
        let path = format!("{}/", url.path());
        url.set_path(&path);
    }
    Ok(url)
}

struct EthereumRequestGate {
    min_request_interval: Duration,
    request_lane: Mutex<()>,
    last_request: Mutex<Option<Instant>>,
}

impl EthereumRequestGate {
    fn new(min_request_interval: Duration) -> Self {
        Self {
            min_request_interval,
            request_lane: Mutex::new(()),
            last_request: Mutex::new(None),
        }
    }

    fn run<T>(
        &self,
        request: impl FnOnce() -> Result<T, EthereumProviderError>,
    ) -> Result<T, EthereumProviderError> {
        let _lane = self.request_lane.lock().expect("Ethereum request lane");
        if !self.min_request_interval.is_zero() {
            let mut guard = self.last_request.lock().expect("Ethereum rate limiter");
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
    fn hex_quantities_convert_to_decimal_of_any_width() {
        assert_eq!(hex_quantity_to_decimal("0x0").expect("zero"), "0");
        assert_eq!(
            hex_quantity_to_decimal("0xde0b6b3a7640000").expect("1 eth"),
            "1000000000000000000"
        );
        assert_eq!(
            hex_quantity_to_decimal(
                "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"
            )
            .expect("u256 max"),
            "115792089237316195423570985008687907853269984665640564039457584007913129639935"
        );
        assert_eq!(hex_quantity_to_u64("0x1").expect("one"), 1);
        assert!(hex_quantity_to_decimal("0x").is_err());
        assert!(hex_quantity_to_decimal("0xzz").is_err());
    }

    #[test]
    fn fee_estimate_uses_next_base_fee_and_median_priority_with_headroom() {
        let history = FeeHistory {
            base_fee_per_gas: vec!["0x3b9aca00".into(), "0x77359400".into()], // 1 gwei, 2 gwei
            reward: vec![
                vec!["0x5f5e100".into()],
                vec!["0x3b9aca00".into()],
                vec!["0xbebc200".into()],
            ],
        };
        let standard = fee_estimate_from_history(&history, WalletFeeTier::Standard).expect("fee");
        assert_eq!(standard.base_fee_per_gas, "2000000000");
        assert_eq!(standard.max_priority_fee_per_gas, "200000000");
        assert_eq!(standard.max_fee_per_gas, "4200000000");
        let fast = fee_estimate_from_history(&history, WalletFeeTier::Fast).expect("fee");
        assert_eq!(fast.max_fee_per_gas, "6200000000");
        // No reward samples: the priority floor still keeps the transaction includable.
        let quiet = FeeHistory {
            base_fee_per_gas: vec!["0x1".into()],
            reward: vec![],
        };
        let slow = fee_estimate_from_history(&quiet, WalletFeeTier::Slow).expect("fee");
        assert_eq!(
            slow.max_priority_fee_per_gas,
            MIN_PRIORITY_FEE_WEI.to_string()
        );
    }

    #[test]
    fn endpoint_requires_http_scheme() {
        assert!(parse_endpoint("ftp://rpc.example").is_err());
        assert_eq!(
            parse_endpoint(" https://rpc.example/v1 ")
                .expect("url")
                .as_str(),
            "https://rpc.example/v1"
        );
        assert!(parse_indexer_base_url("ftp://indexer.example").is_err());
        assert_eq!(
            parse_indexer_base_url("https://eth.blockscout.com")
                .expect("url")
                .as_str(),
            "https://eth.blockscout.com/"
        );
    }

    #[test]
    fn rfc3339_timestamps_convert_to_unix_millis() {
        assert_eq!(rfc3339_to_unix_ms("1970-01-01T00:00:00Z"), Some(0));
        assert_eq!(
            rfc3339_to_unix_ms("2024-03-09T16:00:00.000000Z"),
            Some(1_710_000_000_000)
        );
        assert_eq!(
            rfc3339_to_unix_ms("2024-03-09T17:00:00.5+01:00"),
            Some(1_710_000_000_500)
        );
        assert_eq!(rfc3339_to_unix_ms("2024-03-09"), None);
        assert_eq!(rfc3339_to_unix_ms("2024-13-09T00:00:00Z"), None);
    }

    #[test]
    fn address_transactions_parse_blockscout_items() {
        let server = TestServer::new(vec![
            TestResponse::json(
                200,
                r#"{
                    "items": [
                        {
                            "hash": "0xaaaa",
                            "from": {"hash": "0x742d35Cc6634C0532925a3b844Bc454e4438f44e"},
                            "to": {"hash": "0x1111111111111111111111111111111111111111"},
                            "value": "1000000000000000",
                            "gas_used": "21000",
                            "gas_price": "2000000000",
                            "fee": {"type": "actual", "value": "42000000000000"},
                            "block_number": 19000000,
                            "timestamp": "2024-03-09T16:00:00.000000Z",
                            "status": "ok",
                            "result": "success"
                        },
                        {
                            "hash": "0xbbbb",
                            "from": {"hash": "0x2222222222222222222222222222222222222222"},
                            "to": null,
                            "value": 5,
                            "gas_used": null,
                            "gas_price": "1",
                            "fee": {"type": "maximum", "value": "7"},
                            "block": null,
                            "timestamp": null,
                            "status": null
                        },
                        {
                            "hash": "0xcccc",
                            "from": {"hash": "0x742d35Cc6634C0532925a3b844Bc454e4438f44e"},
                            "to": {"hash": "0x3333333333333333333333333333333333333333"},
                            "value": "0",
                            "gas_used": "30000",
                            "gas_price": "10",
                            "block_number": 19000001,
                            "timestamp": "2024-03-09T16:00:12Z",
                            "status": "error"
                        }
                    ],
                    "next_page_params": {"block_number": 18999999, "index": 0, "items_count": 50}
                }"#,
            ),
            TestResponse::json(503, "maintenance"),
        ]);
        let provider = EthereumRpcProvider::new(EthereumRpcProviderConfig::test(server.url()))
            .expect("provider");
        let address = "0x742d35cc6634c0532925a3b844bc454e4438f44e";

        let transactions = provider.address_transactions(address, 2).expect("history");
        assert_eq!(transactions.len(), 2, "limit trims the page");
        assert_eq!(
            transactions[0],
            EthereumAddressTransaction {
                hash: "0xaaaa".to_string(),
                from: "0x742d35Cc6634C0532925a3b844Bc454e4438f44e".to_string(),
                to: Some("0x1111111111111111111111111111111111111111".to_string()),
                value: "1000000000000000".to_string(),
                fee: "42000000000000".to_string(),
                block_number: Some(19_000_000),
                timestamp: Some(1_710_000_000_000),
                failed: false,
            }
        );
        assert_eq!(transactions[1].to, None);
        assert_eq!(transactions[1].value, "5");
        assert_eq!(
            transactions[1].fee, "7",
            "pending: falls back to indexer fee"
        );
        assert_eq!(transactions[1].block_number, None);
        assert_eq!(transactions[1].timestamp, None);
        assert!(!transactions[1].failed);
        let unavailable = provider
            .address_transactions(address, 25)
            .expect_err("maintenance");
        assert_eq!(unavailable.kind, EthereumProviderErrorKind::Unavailable);

        let requests = server.requests();
        assert_eq!(requests[0].method, "GET");
        assert_eq!(
            requests[0].path,
            format!("/api/v2/addresses/{address}/transactions")
        );
    }

    #[test]
    fn snapshot_broadcast_and_status_follow_json_rpc_semantics() {
        let server = TestServer::new(vec![
            TestResponse::json(200, r#"{"jsonrpc":"2.0","id":1,"result":"0x1"}"#),
            TestResponse::json(
                200,
                r#"{"jsonrpc":"2.0","id":2,"result":"0xde0b6b3a7640000"}"#,
            ),
            TestResponse::json(200, r#"{"jsonrpc":"2.0","id":3,"result":"0x7"}"#),
            TestResponse::json(200, r#"{"jsonrpc":"2.0","id":4,"result":"0x"}"#),
            TestResponse::json(
                200,
                r#"{"jsonrpc":"2.0","id":5,"error":{"code":-32000,"message":"nonce too low"}}"#,
            ),
            TestResponse::json(200, r#"{"jsonrpc":"2.0","id":6,"result":null}"#),
            TestResponse::json(
                200,
                r#"{"jsonrpc":"2.0","id":7,"result":{"hash":"0xab","blockNumber":null}}"#,
            ),
            TestResponse::json(
                200,
                r#"{"jsonrpc":"2.0","id":8,"result":{"status":"0x1","blockNumber":"0x10"}}"#,
            ),
            TestResponse::json(
                200,
                r#"{"jsonrpc":"2.0","id":9,"result":{"hash":"0xab","blockNumber":"0x10"}}"#,
            ),
            TestResponse::json(200, r#"{"jsonrpc":"2.0","id":10,"result":"0x60"}"#),
            TestResponse::json(
                200,
                r#"{"jsonrpc":"2.0","id":11,"result":{"number":"0x20","hash":"0xff"}}"#,
            ),
            TestResponse::json(200, r#"{"jsonrpc":"2.0","id":12,"result":"0x61"}"#),
            TestResponse::json(
                200,
                r#"{"jsonrpc":"2.0","id":13,"error":{"code":-32602,"message":"unknown block tag"}}"#,
            ),
            TestResponse::json(429, r#"{"error":"slow down"}"#),
        ]);
        let provider = EthereumRpcProvider::new(EthereumRpcProviderConfig::test(server.url()))
            .expect("provider");
        let address = "0x742d35cc6634c0532925a3b844bc454e4438f44e";

        assert_eq!(provider.chain_id().expect("chain"), 1);
        let snapshot = provider.account_snapshot(address).expect("snapshot");
        assert_eq!(snapshot.balance, "1000000000000000000");
        assert_eq!(snapshot.pending_nonce, 7);
        assert!(provider.code_at(address).expect("code").is_empty());
        let rejected = provider
            .broadcast_raw_transaction("0x02ff")
            .expect_err("rejected");
        assert_eq!(rejected.kind, EthereumProviderErrorKind::Rejected);
        assert!(rejected.message.contains("nonce too low"));
        assert_eq!(provider.transaction_receipt("0xab").expect("receipt"), None);
        assert_eq!(
            provider.transaction_by_hash("0xab").expect("lookup"),
            Some(EthereumTransactionLookup { block_number: None }),
            "mempool transaction"
        );
        assert_eq!(
            provider.transaction_receipt("0xab").expect("receipt"),
            Some(EthereumTransactionReceipt {
                block_number: 16,
                failed: false
            })
        );
        assert_eq!(
            provider.transaction_by_hash("0xab").expect("lookup"),
            Some(EthereumTransactionLookup {
                block_number: Some(16)
            })
        );
        assert_eq!(
            provider.chain_head().expect("head"),
            EthereumChainHead {
                latest_block_number: 96,
                finalized_block_number: Some(32)
            }
        );
        assert_eq!(
            provider.chain_head().expect("head without finalized tag"),
            EthereumChainHead {
                latest_block_number: 97,
                finalized_block_number: None
            },
            "a node that rejects the finalized tag still reports the latest block"
        );
        let throttled = provider.chain_id().expect_err("throttled");
        assert_eq!(throttled.kind, EthereumProviderErrorKind::Unavailable);

        let requests = server.requests();
        assert_eq!(
            server.json_rpc_methods(),
            [
                "eth_chainId",
                "eth_getBalance",
                "eth_getTransactionCount",
                "eth_getCode",
                "eth_sendRawTransaction",
                "eth_getTransactionReceipt",
                "eth_getTransactionByHash",
                "eth_getTransactionReceipt",
                "eth_getTransactionByHash",
                "eth_blockNumber",
                "eth_getBlockByNumber",
                "eth_blockNumber",
                "eth_getBlockByNumber",
                "eth_chainId",
            ]
        );
        assert!(requests.iter().all(|request| request.method == "POST"));
        let balance_call: Value = serde_json::from_str(&requests[1].body).expect("json");
        assert_eq!(balance_call["params"], json!([address, "latest"]));
        let finalized_call: Value = serde_json::from_str(&requests[10].body).expect("json");
        assert_eq!(finalized_call["params"], json!(["finalized", false]));
    }

    #[test]
    fn broadcast_transport_failure_is_reported_as_unknown_outcome() {
        let provider = EthereumRpcProvider::new(EthereumRpcProviderConfig::test(
            Url::parse("http://127.0.0.1:9/").expect("unreachable url"),
        ))
        .expect("provider");
        let error = provider
            .broadcast_raw_transaction("0x02ff")
            .expect_err("unreachable");
        assert_eq!(error.kind, EthereumProviderErrorKind::Unknown);
        let error = provider.chain_id().expect_err("unreachable");
        assert_eq!(error.kind, EthereumProviderErrorKind::Unavailable);
    }
}
