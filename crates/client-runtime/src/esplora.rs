use std::collections::BTreeMap;
use std::sync::Mutex;
use std::thread;
use std::time::{Duration, Instant};

use chromvoid_core::rpc::types::WalletProviderStatus;
use chromvoid_core::wallet::bitcoin::{
    BitcoinAddressStats, BitcoinAddressStatus, BitcoinAddressTransaction, BitcoinBroadcastResult,
    BitcoinFeeEstimates, BitcoinProvider, BitcoinProviderError, BitcoinTransactionIo,
    BitcoinTransactionStatus, BitcoinUtxo,
};
use reqwest::blocking::Client;
use reqwest::{StatusCode, Url};
use serde::Deserialize;

const DEFAULT_PROVIDER_TIMEOUT: Duration = Duration::from_secs(10);
const DEFAULT_REQUEST_INTERVAL: Duration = Duration::from_millis(250);
/// Esplora pages confirmed history 25 transactions at a time (`/txs/chain`); the first page may
/// carry up to 50 mempool entries on top, which this provider trims to the same size.
const HISTORY_PAGE_SIZE: usize = 25;

pub(super) struct EsploraProvider {
    client: Client,
    api_base_url: Url,
    request_gate: EsploraRequestGate,
}

pub(super) struct EsploraProviderConfig {
    api_base_url: Url,
    min_request_interval: Duration,
    timeout: Duration,
}

impl EsploraProviderConfig {
    fn from_url(url: &str) -> Result<Self, String> {
        let api_base_url = parse_base_url(url)?;
        Ok(Self {
            api_base_url,
            min_request_interval: DEFAULT_REQUEST_INTERVAL,
            timeout: DEFAULT_PROVIDER_TIMEOUT,
        })
    }
}

impl EsploraProvider {
    pub(super) fn mainnet_from_url(url: &str) -> Result<Self, String> {
        Self::new(EsploraProviderConfig::from_url(url)?)
    }

    fn new(config: EsploraProviderConfig) -> Result<Self, String> {
        let client = Client::builder()
            .timeout(config.timeout)
            .user_agent("ChromVoid Bitcoin wallet/1.0")
            .build()
            .map_err(|error| format!("failed to build Esplora HTTP client: {error}"))?;
        Ok(Self {
            client,
            api_base_url: config.api_base_url,
            request_gate: EsploraRequestGate::new(config.min_request_interval),
        })
    }

    fn get(&self, path: &str) -> Result<EsploraHttpResponse, BitcoinProviderError> {
        self.request_gate.run(|| {
            let response = self
                .client
                .get(self.endpoint(path)?)
                .send()
                .map_err(get_network_error)?;
            EsploraHttpResponse::from_response(response)
        })
    }

    fn post_tx(&self, raw_tx_hex: &str) -> Result<EsploraHttpResponse, BitcoinProviderError> {
        self.request_gate.run(|| {
            let response = self
                .client
                .post(self.endpoint("tx")?)
                .body(raw_tx_hex.to_string())
                .send()
                .map_err(broadcast_network_error)?;
            EsploraHttpResponse::from_response(response)
        })
    }

    fn endpoint(&self, path: &str) -> Result<Url, BitcoinProviderError> {
        self.api_base_url.join(path).map_err(|error| {
            BitcoinProviderError::unavailable(format!("invalid Esplora endpoint: {error}"))
        })
    }
}

impl BitcoinProvider for EsploraProvider {
    fn provider_status(&self) -> WalletProviderStatus {
        WalletProviderStatus::Ready
    }

    fn tip_height(&self) -> Result<Option<u64>, BitcoinProviderError> {
        let response = self.get("blocks/tip/height")?;
        if !response.status().is_success() {
            return Err(esplora_error(response, "Esplora tip height"));
        }
        response
            .body
            .trim()
            .parse::<u64>()
            .map(Some)
            .map_err(|error| {
                BitcoinProviderError::unavailable(format!(
                    "Esplora tip height parse failed: {error}"
                ))
            })
    }

    fn address_status(&self, address: &str) -> Result<BitcoinAddressStatus, BitcoinProviderError> {
        let response = self.get(&format!("address/{address}"))?;
        let body: EsploraAddressResponse = parse_json_response(response, "Esplora address")?;
        Ok(BitcoinAddressStatus {
            chain_stats: body.chain_stats.into(),
            mempool_stats: body.mempool_stats.into(),
        })
    }

    fn address_utxos(&self, address: &str) -> Result<Vec<BitcoinUtxo>, BitcoinProviderError> {
        let tip_height = self.tip_height()?.unwrap_or(0);
        let response = self.get(&format!("address/{address}/utxo"))?;
        let body: Vec<EsploraUtxoResponse> = parse_json_response(response, "Esplora address utxo")?;
        Ok(body
            .into_iter()
            .map(|utxo| {
                let confirmations = if utxo.status.confirmed {
                    utxo.status
                        .block_height
                        .and_then(|height| tip_height.checked_sub(height).map(|delta| delta + 1))
                        .and_then(|confirmations| u32::try_from(confirmations).ok())
                        .unwrap_or(1)
                } else {
                    0
                };
                BitcoinUtxo {
                    txid: utxo.txid,
                    vout: utxo.vout,
                    value: utxo.value,
                    address: address.to_string(),
                    script_pubkey: String::new(),
                    confirmed: utxo.status.confirmed,
                    confirmations,
                    block_height: utxo.status.block_height,
                }
            })
            .collect())
    }

    fn fee_estimates(&self) -> Result<BitcoinFeeEstimates, BitcoinProviderError> {
        let response = self.get("fee-estimates")?;
        let estimates: BTreeMap<String, f64> =
            parse_json_response(response, "Esplora fee estimates")?;
        Ok(BitcoinFeeEstimates {
            slow_sat_vb: fee_for_target(&estimates, 144)?,
            standard_sat_vb: fee_for_target(&estimates, 6)?,
            fast_sat_vb: fee_for_target(&estimates, 1)?,
        })
    }

    fn broadcast_raw_tx(
        &self,
        raw_tx_hex: &str,
    ) -> Result<BitcoinBroadcastResult, BitcoinProviderError> {
        let response = self.post_tx(raw_tx_hex)?;
        if response.status().is_success() {
            let txid = response.body.trim();
            if txid.is_empty() {
                return Err(BitcoinProviderError::unknown(
                    "Esplora broadcast response did not include txid",
                ));
            }
            return Ok(BitcoinBroadcastResult {
                txid: txid.to_string(),
            });
        }
        if response.status().is_server_error() || response.status() == StatusCode::TOO_MANY_REQUESTS
        {
            return Err(BitcoinProviderError::unknown(esplora_error_message(
                &response,
                "Esplora broadcast",
            )));
        }
        Err(BitcoinProviderError::rejected(esplora_error_message(
            &response,
            "Esplora broadcast",
        )))
    }

    fn transaction_status(
        &self,
        txid: &str,
    ) -> Result<Option<BitcoinTransactionStatus>, BitcoinProviderError> {
        let response = self.get(&format!("tx/{txid}/status"))?;
        if response.status() == StatusCode::NOT_FOUND {
            return Ok(None);
        }
        let body: EsploraTxStatusResponse = parse_json_response(response, "Esplora tx status")?;
        let tip_height = self.tip_height()?.unwrap_or(0);
        let confirmations = if body.confirmed {
            body.block_height
                .and_then(|height| tip_height.checked_sub(height).map(|delta| delta + 1))
                .and_then(|confirmations| u32::try_from(confirmations).ok())
                .unwrap_or(1)
        } else {
            0
        };
        Ok(Some(BitcoinTransactionStatus {
            confirmed: body.confirmed,
            block_height: body.block_height,
            confirmations,
        }))
    }

    fn address_transactions(
        &self,
        address: &str,
        after_txid: Option<&str>,
    ) -> Result<Vec<BitcoinAddressTransaction>, BitcoinProviderError> {
        let path = match after_txid {
            Some(txid) => format!("address/{address}/txs/chain/{txid}"),
            None => format!("address/{address}/txs"),
        };
        let response = self.get(&path)?;
        let body: Vec<EsploraTxResponse> =
            parse_json_response(response, "Esplora address transactions")?;
        Ok(body
            .into_iter()
            .take(HISTORY_PAGE_SIZE)
            .map(EsploraTxResponse::into_transaction)
            .collect())
    }
}

#[derive(Debug, Clone)]
struct EsploraHttpResponse {
    status: StatusCode,
    body: String,
}

impl EsploraHttpResponse {
    fn from_response(response: reqwest::blocking::Response) -> Result<Self, BitcoinProviderError> {
        let status = response.status();
        let body = response.text().map_err(get_network_error)?;
        Ok(Self { status, body })
    }

    fn status(&self) -> StatusCode {
        self.status
    }
}

struct EsploraRequestGate {
    min_request_interval: Duration,
    request_lane: Mutex<()>,
    last_request: Mutex<Option<Instant>>,
}

impl EsploraRequestGate {
    fn new(min_request_interval: Duration) -> Self {
        Self {
            min_request_interval,
            request_lane: Mutex::new(()),
            last_request: Mutex::new(None),
        }
    }

    fn run<F>(&self, request: F) -> Result<EsploraHttpResponse, BitcoinProviderError>
    where
        F: FnOnce() -> Result<EsploraHttpResponse, BitcoinProviderError>,
    {
        let _lane = self
            .request_lane
            .lock()
            .expect("Esplora provider request lane");
        self.wait();
        request()
    }

    fn wait(&self) {
        if self.min_request_interval.is_zero() {
            return;
        }
        let mut guard = self.last_request.lock().expect("Esplora rate limiter");
        if let Some(last_request) = *guard {
            let elapsed = last_request.elapsed();
            if elapsed < self.min_request_interval {
                thread::sleep(self.min_request_interval - elapsed);
            }
        }
        *guard = Some(Instant::now());
    }
}

#[derive(Debug, Deserialize)]
struct EsploraAddressResponse {
    chain_stats: EsploraAddressStats,
    mempool_stats: EsploraAddressStats,
}

#[derive(Debug, Deserialize)]
struct EsploraAddressStats {
    funded_txo_sum: u64,
    spent_txo_sum: u64,
    tx_count: u64,
}

impl From<EsploraAddressStats> for BitcoinAddressStats {
    fn from(value: EsploraAddressStats) -> Self {
        Self {
            funded_txo_sum: value.funded_txo_sum,
            spent_txo_sum: value.spent_txo_sum,
            tx_count: value.tx_count,
        }
    }
}

#[derive(Debug, Deserialize)]
struct EsploraUtxoResponse {
    txid: String,
    vout: u32,
    status: EsploraUtxoStatus,
    value: u64,
}

#[derive(Debug, Deserialize)]
struct EsploraUtxoStatus {
    confirmed: bool,
    #[serde(default)]
    block_height: Option<u64>,
}

#[derive(Debug, Deserialize)]
struct EsploraTxStatusResponse {
    confirmed: bool,
    #[serde(default)]
    block_height: Option<u64>,
    #[serde(default)]
    block_time: Option<u64>,
}

#[derive(Debug, Deserialize)]
struct EsploraTxResponse {
    txid: String,
    #[serde(default)]
    fee: u64,
    status: EsploraTxStatusResponse,
    #[serde(default)]
    vin: Vec<EsploraTxInput>,
    #[serde(default)]
    vout: Vec<EsploraTxOutput>,
}

#[derive(Debug, Deserialize)]
struct EsploraTxInput {
    /// Absent for coinbase inputs.
    #[serde(default)]
    prevout: Option<EsploraTxOutput>,
}

#[derive(Debug, Deserialize)]
struct EsploraTxOutput {
    #[serde(default)]
    scriptpubkey_address: Option<String>,
    #[serde(default)]
    value: u64,
}

impl EsploraTxResponse {
    fn into_transaction(self) -> BitcoinAddressTransaction {
        BitcoinAddressTransaction {
            txid: self.txid,
            confirmed: self.status.confirmed,
            block_height: self.status.block_height,
            block_time: self.status.block_time,
            fee: self.fee,
            inputs: self
                .vin
                .into_iter()
                .map(|input| match input.prevout {
                    Some(prevout) => prevout.into_io(),
                    None => BitcoinTransactionIo {
                        address: None,
                        value: 0,
                    },
                })
                .collect(),
            outputs: self
                .vout
                .into_iter()
                .map(EsploraTxOutput::into_io)
                .collect(),
        }
    }
}

impl EsploraTxOutput {
    fn into_io(self) -> BitcoinTransactionIo {
        BitcoinTransactionIo {
            address: self
                .scriptpubkey_address
                .filter(|address| !address.is_empty()),
            value: self.value,
        }
    }
}

fn parse_json_response<T: for<'de> Deserialize<'de>>(
    response: EsploraHttpResponse,
    context: &str,
) -> Result<T, BitcoinProviderError> {
    if response.status().is_success() {
        return serde_json::from_str::<T>(&response.body).map_err(|error| {
            BitcoinProviderError::unknown(format!("{context} response parse failed: {error}"))
        });
    }
    Err(esplora_error(response, context))
}

fn esplora_error(response: EsploraHttpResponse, context: &str) -> BitcoinProviderError {
    let message = esplora_error_message(&response, context);
    if response.status() == StatusCode::TOO_MANY_REQUESTS || response.status().is_server_error() {
        return BitcoinProviderError::unavailable(message);
    }
    BitcoinProviderError::rejected(message)
}

fn esplora_error_message(response: &EsploraHttpResponse, context: &str) -> String {
    let detail = response.body.trim();
    if detail.is_empty() {
        format!("{context} failed with HTTP {}", response.status())
    } else {
        format!("{context} failed with HTTP {}: {detail}", response.status())
    }
}

fn get_network_error(error: reqwest::Error) -> BitcoinProviderError {
    BitcoinProviderError::unavailable(format!("Esplora request failed: {error}"))
}

fn broadcast_network_error(error: reqwest::Error) -> BitcoinProviderError {
    BitcoinProviderError::unknown(format!("Esplora broadcast outcome unknown: {error}"))
}

fn fee_for_target(
    estimates: &BTreeMap<String, f64>,
    target: u16,
) -> Result<u64, BitcoinProviderError> {
    let parsed = estimates
        .iter()
        .filter_map(|(key, value)| key.parse::<u16>().ok().map(|key| (key, *value)))
        .filter(|(_, value)| value.is_finite() && *value > 0.0)
        .collect::<Vec<_>>();
    if parsed.is_empty() {
        return Err(BitcoinProviderError::unavailable(
            "Esplora fee estimates are unavailable",
        ));
    }
    let chosen = parsed
        .iter()
        .filter(|(candidate, _)| *candidate <= target)
        .max_by_key(|(candidate, _)| *candidate)
        .or_else(|| parsed.iter().min_by_key(|(candidate, _)| *candidate))
        .map(|(_, value)| value.ceil() as u64)
        .unwrap_or(1)
        .max(1);
    Ok(chosen)
}

fn parse_base_url(url: &str) -> Result<Url, String> {
    let mut url = Url::parse(url.trim())
        .map_err(|error| format!("invalid CHROMVOID_BTC_ESPLORA_URL: {error}"))?;
    if url.scheme() != "http" && url.scheme() != "https" {
        return Err("CHROMVOID_BTC_ESPLORA_URL must be http or https".to_string());
    }
    if !url.path().ends_with('/') {
        let path = format!("{}/", url.path());
        url.set_path(&path);
    }
    Ok(url)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_http::{TestResponse, TestServer};

    fn test_provider(server: &TestServer) -> EsploraProvider {
        EsploraProvider::new(EsploraProviderConfig {
            api_base_url: server.url(),
            min_request_interval: Duration::ZERO,
            timeout: Duration::from_secs(2),
        })
        .expect("provider")
    }

    #[test]
    fn address_transactions_parse_esplora_history_and_page_cursor() {
        let server = TestServer::new(vec![
            TestResponse::json(
                200,
                r#"[
                    {
                        "txid": "tx-mempool",
                        "fee": 500,
                        "status": {"confirmed": false},
                        "vin": [{"prevout": {"scriptpubkey_address": "bc1-sender", "value": 200000}}],
                        "vout": [
                            {"scriptpubkey_address": "bc1-ours", "value": 150000},
                            {"scriptpubkey_address": "bc1-sender", "value": 49500}
                        ]
                    },
                    {
                        "txid": "tx-coinbase",
                        "status": {"confirmed": true, "block_height": 90, "block_time": 1710000000},
                        "vin": [{"is_coinbase": true}],
                        "vout": [{"scriptpubkey": "6a", "value": 0}, {"scriptpubkey_address": "bc1-ours", "value": 1}]
                    }
                ]"#,
            ),
            TestResponse::json(200, "[]"),
            TestResponse::json(429, "slow down"),
        ]);
        let provider = test_provider(&server);

        let transactions = provider
            .address_transactions("bc1-ours", None)
            .expect("history");
        assert_eq!(transactions.len(), 2);
        assert_eq!(transactions[0].txid, "tx-mempool");
        assert!(!transactions[0].confirmed);
        assert_eq!(transactions[0].block_time, None);
        assert_eq!(transactions[0].fee, 500);
        assert_eq!(
            transactions[0].inputs,
            vec![BitcoinTransactionIo {
                address: Some("bc1-sender".to_string()),
                value: 200_000
            }]
        );
        assert_eq!(transactions[0].outputs.len(), 2);
        assert_eq!(
            transactions[0].outputs[0].address.as_deref(),
            Some("bc1-ours")
        );
        assert_eq!(transactions[1].block_height, Some(90));
        assert_eq!(transactions[1].block_time, Some(1_710_000_000));
        assert_eq!(transactions[1].fee, 0);
        assert_eq!(transactions[1].inputs[0].address, None);
        assert_eq!(transactions[1].outputs[0].address, None);

        assert!(
            provider
                .address_transactions("bc1-ours", Some("tx-coinbase"))
                .expect("next page")
                .is_empty()
        );
        let throttled = provider
            .address_transactions("bc1-ours", None)
            .expect_err("throttled");
        assert_eq!(
            throttled.kind,
            chromvoid_core::wallet::bitcoin::BitcoinProviderErrorKind::Unavailable
        );

        let requests = server.requests();
        assert_eq!(requests[0].path, "/address/bc1-ours/txs");
        assert_eq!(requests[1].path, "/address/bc1-ours/txs/chain/tx-coinbase");
        assert!(requests.iter().all(|request| request.method == "GET"));
    }

    #[test]
    fn fee_mapping_uses_nearest_faster_or_equal_target() {
        let estimates = BTreeMap::from([
            ("1".to_string(), 12.2),
            ("3".to_string(), 8.1),
            ("12".to_string(), 4.4),
            ("144".to_string(), 1.1),
        ]);

        assert_eq!(fee_for_target(&estimates, 1).expect("fast"), 13);
        assert_eq!(fee_for_target(&estimates, 6).expect("standard"), 9);
        assert_eq!(fee_for_target(&estimates, 144).expect("slow"), 2);
    }

    #[test]
    fn base_url_gets_trailing_slash() {
        let url = parse_base_url("https://example.invalid/api").expect("url");

        assert_eq!(url.as_str(), "https://example.invalid/api/");
    }
}
