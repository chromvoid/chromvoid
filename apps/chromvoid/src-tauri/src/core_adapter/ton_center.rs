use std::collections::HashMap;
use std::panic::{catch_unwind, resume_unwind, AssertUnwindSafe};
use std::sync::{Arc, Condvar, Mutex};
use std::time::{Duration, Instant};

use chromvoid_core::rpc::types::{
    WalletConfirmStatus, WalletProviderStatus, WalletTransactionDirection,
};
use chromvoid_core::wallet::ton::{
    TonBroadcastRequest, TonBroadcastResult, TonFeeEstimateRequest, TonHistoryRequest,
    TonHistoryTransaction, TonProvider, TonProviderAccount, TonProviderAccountState,
    TonProviderError, TonProviderSnapshot, TonRefreshRequest, TonRefreshResult,
};
use chromvoid_core::wallet::WalletTxStatus;
use reqwest::blocking::Client;
use reqwest::{StatusCode, Url};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};

const DEFAULT_TON_CENTER_API_BASE_URL: &str = "https://toncenter.com/api/v3/";
const DEFAULT_PROVIDER_TIMEOUT: Duration = Duration::from_secs(10);
const DEFAULT_UNAUTHENTICATED_RATE_INTERVAL: Duration = Duration::from_secs(1);
const DEFAULT_PRIORITY_AGING_INTERVAL: Duration = Duration::from_secs(5);
const DEFAULT_TON_TRANSFER_FEE_ESTIMATE: u128 = 5_000_000;
const TON_FEE_ESTIMATE_BUFFER_BPS: u128 = 1_000;
const TON_FEE_ESTIMATE_MIN_BUFFER: u128 = 100_000;
const TON_CENTER_ERROR_DETAIL_LIMIT: usize = 256;
const TON_CENTER_RECENT_CACHE_CAPACITY: usize = 256;

pub(super) struct TonCenterProvider {
    client: Client,
    api_base_url: Url,
    request_gate: TonCenterRequestGate,
    estimated_fee: u128,
}

pub(super) struct TonCenterProviderConfig {
    api_base_url: Url,
    min_request_interval: Duration,
    debounce_interval: Duration,
    timeout: Duration,
    estimated_fee: u128,
}

impl TonCenterProviderConfig {
    fn mainnet() -> Result<Self, String> {
        Ok(Self {
            api_base_url: Url::parse(DEFAULT_TON_CENTER_API_BASE_URL)
                .map_err(|error| format!("invalid TON Center API base URL: {error}"))?,
            min_request_interval: DEFAULT_UNAUTHENTICATED_RATE_INTERVAL,
            debounce_interval: DEFAULT_UNAUTHENTICATED_RATE_INTERVAL,
            timeout: DEFAULT_PROVIDER_TIMEOUT,
            estimated_fee: DEFAULT_TON_TRANSFER_FEE_ESTIMATE,
        })
    }

    #[cfg(test)]
    fn test(api_base_url: Url) -> Self {
        Self {
            api_base_url,
            min_request_interval: Duration::ZERO,
            debounce_interval: Duration::ZERO,
            timeout: Duration::from_secs(2),
            estimated_fee: DEFAULT_TON_TRANSFER_FEE_ESTIMATE,
        }
    }
}

impl TonCenterProvider {
    pub(super) fn mainnet() -> Result<Self, String> {
        Self::new(TonCenterProviderConfig::mainnet()?)
    }

    fn new(config: TonCenterProviderConfig) -> Result<Self, String> {
        let client = Client::builder()
            .timeout(config.timeout)
            .user_agent("ChromVoid TON wallet/1.0")
            .build()
            .map_err(|error| format!("failed to build TON Center HTTP client: {error}"))?;
        Ok(Self {
            client,
            api_base_url: config.api_base_url,
            request_gate: TonCenterRequestGate::new(
                config.min_request_interval,
                config.debounce_interval,
            ),
            estimated_fee: config.estimated_fee,
        })
    }

    fn get(
        &self,
        key: String,
        priority: TonCenterRequestPriority,
        path: &str,
        query: &[(&str, &str)],
    ) -> Result<TonCenterHttpResponse, TonProviderError> {
        self.request_gate
            .run(TonCenterRequestPolicy::cached(key, priority), || {
                let response = self
                    .client
                    .get(self.endpoint(path)?)
                    .query(query)
                    .send()
                    .map_err(|error| network_error(path, error))?;
                TonCenterHttpResponse::from_response(path, response)
            })
    }

    fn post_json<T: Serialize>(
        &self,
        policy: TonCenterRequestPolicy,
        path: &str,
        body: &T,
    ) -> Result<TonCenterHttpResponse, TonProviderError> {
        self.request_gate.run(policy, || {
            let response = self
                .client
                .post(self.endpoint(path)?)
                .json(body)
                .send()
                .map_err(|error| network_error(path, error))?;
            TonCenterHttpResponse::from_response(path, response)
        })
    }

    fn endpoint(&self, path: &str) -> Result<Url, TonProviderError> {
        self.api_base_url.join(path).map_err(|error| {
            TonProviderError::unavailable(format!("invalid TON Center endpoint: {error}"))
        })
    }
}

impl TonProvider for TonCenterProvider {
    fn provider_status(&self) -> WalletProviderStatus {
        WalletProviderStatus::Ready
    }

    fn snapshot(
        &self,
        account: &TonProviderAccount,
    ) -> Result<TonProviderSnapshot, TonProviderError> {
        let response = self.get(
            wallet_state_key(account.address.as_str()),
            TonCenterRequestPriority::Interactive,
            "walletStates",
            &[("address", account.address.as_str())],
        )?;
        let body: TonCenterWalletStatesResponse =
            parse_json_response(response, "TON Center walletStates")?;
        let Some(wallet) = body.wallets.into_iter().next() else {
            return Ok(TonProviderSnapshot {
                seqno: 0,
                account_state: TonProviderAccountState::Uninitialized,
                balance: 0,
                estimated_fee: Some(self.estimated_fee),
            });
        };
        Ok(TonProviderSnapshot {
            seqno: wallet.seqno.unwrap_or(0),
            account_state: account_state(wallet.status.as_deref()),
            balance: amount_value(Some(&wallet.balance))
                .ok_or_else(|| TonProviderError::unknown("TON Center wallet balance is invalid"))?,
            estimated_fee: Some(self.estimated_fee),
        })
    }

    fn account_state(&self, address: &str) -> Result<TonProviderAccountState, TonProviderError> {
        let response = self.get(
            wallet_state_key(address),
            TonCenterRequestPriority::Interactive,
            "walletStates",
            &[("address", address)],
        )?;
        let body: TonCenterWalletStatesResponse =
            parse_json_response(response, "TON Center walletStates")?;
        Ok(body
            .wallets
            .into_iter()
            .next()
            .map(|wallet| account_state(wallet.status.as_deref()))
            .unwrap_or(TonProviderAccountState::Uninitialized))
    }

    fn estimate_transfer_fee(
        &self,
        request: TonFeeEstimateRequest,
    ) -> Result<u128, TonProviderError> {
        let body = TonCenterFeeEstimateRequest {
            address: request.account.address.as_str(),
            body: request.body_boc_base64.as_str(),
            init_code: request.init_code_boc_base64.as_deref(),
            init_data: request.init_data_boc_base64.as_deref(),
            ignore_chksig: true,
        };
        let response = self.post_json(
            TonCenterRequestPolicy::cached(
                fee_estimate_key(&request),
                TonCenterRequestPriority::Interactive,
            ),
            "estimateFee",
            &body,
        )?;
        let estimate: TonCenterFeeEstimateResponse =
            parse_json_response(response, "TON Center estimateFee")?;
        let estimated_fee = estimate
            .source_fees
            .total()
            .ok_or_else(|| TonProviderError::unknown("TON Center fee estimate is invalid"))?;
        Ok(ton_fee_reserve(estimated_fee))
    }

    fn broadcast(
        &self,
        request: TonBroadcastRequest,
    ) -> Result<TonBroadcastResult, TonProviderError> {
        let body = TonCenterMessageRequest {
            boc: request.signed_message_boc_base64.as_str(),
        };
        let response = self.post_json(
            TonCenterRequestPolicy::in_flight_only(
                broadcast_key(&request),
                TonCenterRequestPriority::Critical,
            ),
            "message",
            &body,
        )?;
        let accepted: TonCenterMessageResponse =
            parse_json_response(response, "TON Center message")?;
        Ok(TonBroadcastResult {
            status: WalletConfirmStatus::Pending,
            tx_hash: None,
            message_ref: accepted
                .message_hash_norm
                .or(accepted.message_hash)
                .or(Some(request.message_hash)),
        })
    }

    fn refresh(&self, request: TonRefreshRequest) -> Result<TonRefreshResult, TonProviderError> {
        let message_ref = request
            .message_ref
            .as_deref()
            .or(request.tx_hash.as_deref())
            .unwrap_or(request.tx_ref.as_str());
        let response = self.get(
            tx_by_message_key(message_ref),
            TonCenterRequestPriority::Reconciliation,
            "transactionsByMessage",
            &[("msg_hash", message_ref), ("limit", "1")],
        )?;
        let body: TonCenterTransactionsResponse =
            parse_json_response(response, "TON Center transactionsByMessage")?;
        let transaction = match body.transactions.into_iter().next() {
            Some(transaction) => Some(transaction),
            None => self.transaction_by_hash(&request)?,
        };
        let Some(transaction) = transaction else {
            return Ok(TonRefreshResult {
                status: WalletTxStatus::Pending,
                tx_hash: request.tx_hash,
                found: false,
            });
        };
        Ok(TonRefreshResult {
            status: if transaction_failed(&transaction) {
                WalletTxStatus::Failed
            } else if transaction_finalized(&transaction) {
                WalletTxStatus::Confirmed
            } else {
                WalletTxStatus::Pending
            },
            tx_hash: transaction.hash.or(request.tx_hash),
            found: true,
        })
    }

    fn history(
        &self,
        request: TonHistoryRequest,
    ) -> Result<Vec<TonHistoryTransaction>, TonProviderError> {
        let limit = request.limit.clamp(1, 200);
        let limit_param = limit.to_string();
        let response = self.get(
            tx_history_key(request.account.address.as_str(), limit),
            TonCenterRequestPriority::Background,
            "transactions",
            &[
                ("account", request.account.address.as_str()),
                ("limit", limit_param.as_str()),
                ("sort", "desc"),
            ],
        )?;
        let body: TonCenterTransactionsResponse =
            parse_json_response(response, "TON Center transaction history")?;
        body.transactions
            .into_iter()
            .map(parse_history_transaction)
            .collect()
    }
}

impl TonCenterProvider {
    fn transaction_by_hash(
        &self,
        request: &TonRefreshRequest,
    ) -> Result<Option<TonCenterTransaction>, TonProviderError> {
        let Some(tx_hash) = request.tx_hash.as_deref() else {
            return Ok(None);
        };
        let response = self.get(
            tx_by_hash_key(request.account.address.as_str(), tx_hash),
            TonCenterRequestPriority::Reconciliation,
            "transactions",
            &[
                ("account", request.account.address.as_str()),
                ("hash", tx_hash),
                ("limit", "1"),
            ],
        )?;
        let body: TonCenterTransactionsResponse =
            parse_json_response(response, "TON Center transactions")?;
        Ok(body.transactions.into_iter().next())
    }
}

#[derive(Debug, Clone)]
struct TonCenterHttpResponse {
    status: StatusCode,
    body: String,
}

impl TonCenterHttpResponse {
    fn from_response(
        operation: &str,
        response: reqwest::blocking::Response,
    ) -> Result<Self, TonProviderError> {
        let status = response.status();
        let body = response
            .text()
            .map_err(|error| network_error(operation, error))?;
        Ok(Self { status, body })
    }

    fn status(&self) -> StatusCode {
        self.status
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
enum TonCenterRequestPriority {
    Background,
    Reconciliation,
    Interactive,
    Critical,
}

impl TonCenterRequestPriority {
    fn rank(self) -> u8 {
        self as u8
    }
}

#[derive(Debug)]
struct TonCenterRequestPolicy {
    key: String,
    priority: TonCenterRequestPriority,
    cache_recent: bool,
}

impl TonCenterRequestPolicy {
    fn cached(key: String, priority: TonCenterRequestPriority) -> Self {
        Self {
            key,
            priority,
            cache_recent: true,
        }
    }

    fn in_flight_only(key: String, priority: TonCenterRequestPriority) -> Self {
        Self {
            key,
            priority,
            cache_recent: false,
        }
    }
}

#[derive(Debug)]
struct TonCenterQueuedRequest {
    sequence: u64,
    priority: TonCenterRequestPriority,
    queued_at: Instant,
}

fn effective_priority(
    request: &TonCenterQueuedRequest,
    now: Instant,
    aging_interval: Duration,
) -> u8 {
    if request.priority == TonCenterRequestPriority::Critical || aging_interval.is_zero() {
        return request.priority.rank();
    }
    let boosts =
        now.saturating_duration_since(request.queued_at).as_nanos() / aging_interval.as_nanos();
    request
        .priority
        .rank()
        .saturating_add(boosts.min(u128::from(u8::MAX)) as u8)
        .min(TonCenterRequestPriority::Interactive.rank())
}

#[derive(Debug, Default)]
struct TonCenterQueueState {
    active: bool,
    next_sequence: u64,
    last_started: Option<Instant>,
    waiting: Vec<TonCenterQueuedRequest>,
}

struct TonCenterRequestGate {
    min_request_interval: Duration,
    debounce_interval: Duration,
    priority_aging_interval: Duration,
    queue: Mutex<TonCenterQueueState>,
    queue_changed: Condvar,
    in_flight: Mutex<HashMap<String, Arc<TonCenterInFlight>>>,
    recent: Mutex<HashMap<String, (Instant, TonCenterHttpResponse)>>,
}

impl TonCenterRequestGate {
    fn new(min_request_interval: Duration, debounce_interval: Duration) -> Self {
        Self {
            min_request_interval,
            debounce_interval,
            priority_aging_interval: DEFAULT_PRIORITY_AGING_INTERVAL,
            queue: Mutex::new(TonCenterQueueState::default()),
            queue_changed: Condvar::new(),
            in_flight: Mutex::new(HashMap::new()),
            recent: Mutex::new(HashMap::new()),
        }
    }

    fn run<F>(
        &self,
        policy: TonCenterRequestPolicy,
        request: F,
    ) -> Result<TonCenterHttpResponse, TonProviderError>
    where
        F: FnOnce() -> Result<TonCenterHttpResponse, TonProviderError>,
    {
        if policy.cache_recent {
            if let Some(cached) = self.cached_response(&policy.key) {
                return Ok(cached);
            }
        }

        let (flight, owner) = {
            let mut in_flight = self.in_flight.lock().expect("TON provider in-flight map");
            if let Some(flight) = in_flight.get(&policy.key) {
                (flight.clone(), false)
            } else {
                let flight = Arc::new(TonCenterInFlight::default());
                in_flight.insert(policy.key.clone(), flight.clone());
                (flight, true)
            }
        };

        if !owner {
            return flight.wait();
        }

        if policy.cache_recent {
            if let Some(cached) = self.cached_response(&policy.key) {
                flight.complete(Ok(cached.clone()));
                self.in_flight
                    .lock()
                    .expect("TON provider in-flight map")
                    .remove(&policy.key);
                return Ok(cached);
            }
        }

        let _permit = self.acquire(policy.priority);
        let result = match catch_unwind(AssertUnwindSafe(request)) {
            Ok(result) => result,
            Err(payload) => {
                flight.complete(Err(TonProviderError::unknown(
                    "TON Center request execution panicked",
                )));
                self.in_flight
                    .lock()
                    .expect("TON provider in-flight map")
                    .remove(&policy.key);
                resume_unwind(payload);
            }
        };
        if policy.cache_recent {
            if let Ok(response) = &result {
                if response.status().is_success() {
                    self.store_recent(policy.key.clone(), response.clone());
                }
            }
        }
        flight.complete(result.clone());
        self.in_flight
            .lock()
            .expect("TON provider in-flight map")
            .remove(&policy.key);
        result
    }

    fn cached_response(&self, key: &str) -> Option<TonCenterHttpResponse> {
        if self.debounce_interval.is_zero() {
            return None;
        }
        let mut recent = self.recent.lock().expect("TON provider recent cache");
        recent.retain(|_, (stored_at, _)| stored_at.elapsed() <= self.debounce_interval);
        recent.get(key).map(|(_, response)| response.clone())
    }

    fn store_recent(&self, key: String, response: TonCenterHttpResponse) {
        if self.debounce_interval.is_zero() {
            return;
        }
        let mut recent = self.recent.lock().expect("TON provider recent cache");
        recent.retain(|_, (stored_at, _)| stored_at.elapsed() <= self.debounce_interval);
        if recent.len() >= TON_CENTER_RECENT_CACHE_CAPACITY {
            if let Some(oldest) = recent
                .iter()
                .min_by_key(|(_, (stored_at, _))| *stored_at)
                .map(|(key, _)| key.clone())
            {
                recent.remove(&oldest);
            }
        }
        recent.insert(key, (Instant::now(), response));
    }

    fn acquire(&self, priority: TonCenterRequestPriority) -> TonCenterRequestPermit<'_> {
        let mut state = self.queue.lock().expect("TON provider request queue");
        let sequence = state.next_sequence;
        state.next_sequence = state.next_sequence.wrapping_add(1);
        state.waiting.push(TonCenterQueuedRequest {
            sequence,
            priority,
            queued_at: Instant::now(),
        });
        self.queue_changed.notify_all();

        loop {
            let now = Instant::now();
            let is_next = state
                .waiting
                .iter()
                .max_by(|left, right| {
                    effective_priority(left, now, self.priority_aging_interval)
                        .cmp(&effective_priority(
                            right,
                            now,
                            self.priority_aging_interval,
                        ))
                        .then_with(|| right.sequence.cmp(&left.sequence))
                })
                .is_some_and(|request| request.sequence == sequence);
            if !state.active && is_next {
                let remaining = state
                    .last_started
                    .and_then(|started| self.min_request_interval.checked_sub(started.elapsed()));
                if let Some(remaining) = remaining.filter(|delay| !delay.is_zero()) {
                    let (next, _) = self
                        .queue_changed
                        .wait_timeout(state, remaining)
                        .expect("TON provider request queue wait");
                    state = next;
                    continue;
                }
                state.waiting.retain(|request| request.sequence != sequence);
                state.active = true;
                state.last_started = Some(Instant::now());
                return TonCenterRequestPermit { gate: self };
            }
            state = self
                .queue_changed
                .wait(state)
                .expect("TON provider request queue wait");
        }
    }

    fn release(&self) {
        self.queue
            .lock()
            .expect("TON provider request queue")
            .active = false;
        self.queue_changed.notify_all();
    }
}

struct TonCenterRequestPermit<'a> {
    gate: &'a TonCenterRequestGate,
}

impl Drop for TonCenterRequestPermit<'_> {
    fn drop(&mut self) {
        self.gate.release();
    }
}

#[derive(Debug, Default)]
struct TonCenterInFlight {
    result: Mutex<Option<Result<TonCenterHttpResponse, TonProviderError>>>,
    ready: Condvar,
}

impl TonCenterInFlight {
    fn wait(&self) -> Result<TonCenterHttpResponse, TonProviderError> {
        let mut guard = self.result.lock().expect("TON provider in-flight result");
        loop {
            if let Some(result) = guard.as_ref() {
                return result.clone();
            }
            guard = self.ready.wait(guard).expect("TON provider in-flight wait");
        }
    }

    fn complete(&self, result: Result<TonCenterHttpResponse, TonProviderError>) {
        *self.result.lock().expect("TON provider in-flight result") = Some(result);
        self.ready.notify_all();
    }
}

fn wallet_state_key(address: &str) -> String {
    format!("wallet_state:{address}")
}

fn fee_estimate_key(request: &TonFeeEstimateRequest) -> String {
    let mut digest = Sha256::new();
    digest.update(request.account.address.as_bytes());
    digest.update([0]);
    digest.update(request.body_boc_base64.as_bytes());
    digest.update([0]);
    if let Some(init_code) = &request.init_code_boc_base64 {
        digest.update(init_code.as_bytes());
    }
    digest.update([0]);
    if let Some(init_data) = &request.init_data_boc_base64 {
        digest.update(init_data.as_bytes());
    }
    format!("estimate_fee:{}", hex::encode(digest.finalize()))
}

fn broadcast_key(request: &TonBroadcastRequest) -> String {
    let mut digest = Sha256::new();
    digest.update(request.signed_message_boc_base64.as_bytes());
    format!("broadcast:{}", hex::encode(digest.finalize()))
}

fn tx_by_message_key(message_ref: &str) -> String {
    format!("tx_by_message:{message_ref}")
}

fn tx_by_hash_key(account: &str, tx_hash: &str) -> String {
    format!("tx_by_hash:{account}:{tx_hash}")
}

fn tx_history_key(account: &str, limit: u32) -> String {
    format!("tx_history:{account}:{limit}")
}

#[derive(Debug, Deserialize)]
struct TonCenterWalletStatesResponse {
    #[serde(default)]
    wallets: Vec<TonCenterWalletState>,
}

#[derive(Debug, Deserialize)]
struct TonCenterWalletState {
    balance: Value,
    #[serde(default)]
    seqno: Option<u32>,
    #[serde(default)]
    status: Option<String>,
}

#[derive(Debug, Serialize)]
struct TonCenterMessageRequest<'a> {
    boc: &'a str,
}

#[derive(Debug, Deserialize)]
struct TonCenterMessageResponse {
    #[serde(default)]
    message_hash: Option<String>,
    #[serde(default)]
    message_hash_norm: Option<String>,
}

#[derive(Debug, Serialize)]
struct TonCenterFeeEstimateRequest<'a> {
    address: &'a str,
    body: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    init_code: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    init_data: Option<&'a str>,
    ignore_chksig: bool,
}

#[derive(Debug, Deserialize)]
struct TonCenterFeeEstimateResponse {
    source_fees: TonCenterFeeBreakdown,
}

#[derive(Debug, Deserialize)]
struct TonCenterFeeBreakdown {
    in_fwd_fee: Value,
    storage_fee: Value,
    gas_fee: Value,
    fwd_fee: Value,
}

impl TonCenterFeeBreakdown {
    fn total(&self) -> Option<u128> {
        [
            &self.in_fwd_fee,
            &self.storage_fee,
            &self.gas_fee,
            &self.fwd_fee,
        ]
        .into_iter()
        .try_fold(0_u128, |total, value| {
            total.checked_add(amount_value(Some(value))?)
        })
    }
}

#[derive(Debug, Deserialize)]
struct TonCenterTransactionsResponse {
    #[serde(default)]
    transactions: Vec<TonCenterTransaction>,
}

#[derive(Debug, Deserialize)]
struct TonCenterTransaction {
    #[serde(default)]
    hash: Option<String>,
    #[serde(default)]
    now: Option<u64>,
    #[serde(default)]
    total_fees: Option<Value>,
    #[serde(default)]
    in_msg: Option<TonCenterMessage>,
    #[serde(default)]
    out_msgs: Vec<TonCenterMessage>,
    #[serde(default)]
    finalized: Option<bool>,
    #[serde(default)]
    mc_block_seqno: Option<u64>,
    #[serde(default)]
    masterchain_seqno: Option<u64>,
    #[serde(default)]
    description: Option<TonCenterTransactionDescription>,
}

#[derive(Debug, Deserialize)]
struct TonCenterMessage {
    #[serde(default)]
    hash: Option<String>,
    #[serde(default)]
    hash_norm: Option<String>,
    #[serde(default)]
    source: Option<String>,
    #[serde(default)]
    destination: Option<String>,
    #[serde(default)]
    value: Option<Value>,
}

#[derive(Debug, Deserialize)]
struct TonCenterTransactionDescription {
    #[serde(default)]
    aborted: Option<bool>,
    #[serde(default)]
    action: Option<TonCenterTransactionPhase>,
    #[serde(default)]
    compute_ph: Option<TonCenterTransactionPhase>,
}

#[derive(Debug, Deserialize)]
struct TonCenterTransactionPhase {
    #[serde(default)]
    success: Option<bool>,
}

#[derive(Debug, Deserialize)]
struct TonCenterErrorResponse {
    #[serde(default)]
    code: Option<i64>,
    #[serde(default)]
    error: Option<String>,
}

#[derive(Debug)]
struct TonCenterFailure {
    message: String,
    code: Option<i64>,
    detail: String,
}

fn parse_json_response<T: for<'de> Deserialize<'de>>(
    response: TonCenterHttpResponse,
    context: &str,
) -> Result<T, TonProviderError> {
    let status = response.status();
    if status.is_success() {
        return serde_json::from_str::<T>(&response.body).map_err(|error| {
            TonProviderError::unknown(format!("{context} response parse failed: {error}"))
        });
    }

    let failure = ton_center_failure(&response, context);
    let category = provider_error_category(status, &failure.detail);
    tracing::warn!(
        target: "chromvoid_lib::wallet::ton",
        provider = "toncenter",
        operation = context,
        http_status = status.as_u16(),
        ton_code = ?failure.code,
        category,
        "TON Center request failed"
    );
    if status == StatusCode::TOO_MANY_REQUESTS || status.is_server_error() {
        return Err(TonProviderError::unavailable(failure.message));
    }
    Err(TonProviderError::rejected(failure.message))
}

fn ton_center_failure(response: &TonCenterHttpResponse, context: &str) -> TonCenterFailure {
    let status = response.status();
    match serde_json::from_str::<TonCenterErrorResponse>(&response.body) {
        Ok(error) => {
            let detail = sanitize_provider_error_detail(
                error
                    .error
                    .as_deref()
                    .unwrap_or("TON Center request failed"),
            );
            let message = match error.code {
                Some(code) => {
                    format!("{context} failed with HTTP {status} / TON code {code}: {detail}")
                }
                None => format!("{context} failed with HTTP {status}: {detail}"),
            };
            TonCenterFailure {
                message,
                code: error.code,
                detail,
            }
        }
        Err(_) => TonCenterFailure {
            message: format!("{context} failed with HTTP {status}"),
            code: None,
            detail: "unparseable error response".to_string(),
        },
    }
}

fn sanitize_provider_error_detail(detail: &str) -> String {
    let mut sanitized = String::new();
    let mut chars = detail.trim().chars();
    for character in chars.by_ref().take(TON_CENTER_ERROR_DETAIL_LIMIT) {
        sanitized.push(if character.is_control() {
            ' '
        } else {
            character
        });
    }
    if chars.next().is_some() {
        sanitized.push('…');
    }
    if sanitized.is_empty() {
        "TON Center request failed".to_string()
    } else {
        sanitized
    }
}

fn provider_error_category(status: StatusCode, detail: &str) -> &'static str {
    let detail = detail.to_ascii_lowercase();
    if status == StatusCode::TOO_MANY_REQUESTS || detail.contains("rate limit") {
        "rate_limited"
    } else if detail.contains("emulat") || detail.contains("exit code") {
        "emulation_failed"
    } else if status.is_client_error() {
        "request_rejected"
    } else if status.is_server_error() {
        "upstream_failure"
    } else {
        "provider_failure"
    }
}

fn network_error(operation: &str, error: reqwest::Error) -> TonProviderError {
    let reason = if error.is_timeout() {
        "timed out"
    } else if error.is_connect() {
        "connection failed"
    } else if error.is_request() {
        "could not be created"
    } else if error.is_body() {
        "response body failed"
    } else {
        "failed"
    };
    tracing::warn!(
        target: "chromvoid_lib::wallet::ton",
        provider = "toncenter",
        operation,
        reason,
        "TON Center network request failed"
    );
    TonProviderError::unavailable(format!("TON Center {operation} request {reason}"))
}

fn account_state(status: Option<&str>) -> TonProviderAccountState {
    match status.unwrap_or_default().to_ascii_lowercase().as_str() {
        "active" => TonProviderAccountState::Active,
        _ => TonProviderAccountState::Uninitialized,
    }
}

fn amount_value(value: Option<&Value>) -> Option<u128> {
    match value? {
        Value::String(text) => text.parse::<u128>().ok(),
        Value::Number(number) => number.as_u64().map(u128::from),
        _ => None,
    }
}

fn ton_fee_reserve(estimated_fee: u128) -> u128 {
    let proportional_buffer = estimated_fee.saturating_mul(TON_FEE_ESTIMATE_BUFFER_BPS) / 10_000;
    estimated_fee.saturating_add(proportional_buffer.max(TON_FEE_ESTIMATE_MIN_BUFFER))
}

fn parse_history_transaction(
    transaction: TonCenterTransaction,
) -> Result<TonHistoryTransaction, TonProviderError> {
    let tx_hash = non_empty(transaction.hash.as_deref())
        .ok_or_else(|| TonProviderError::unknown("TON Center transaction hash is missing"))?
        .to_string();
    let created_at = transaction
        .now
        .ok_or_else(|| TonProviderError::unknown("TON Center transaction timestamp is missing"))?
        .saturating_mul(1_000);
    let fee = amount_value(transaction.total_fees.as_ref()).unwrap_or(0);
    let message_ref = transaction.in_msg.as_ref().and_then(|message| {
        non_empty(message.hash_norm.as_deref())
            .or_else(|| non_empty(message.hash.as_deref()))
            .map(str::to_string)
    });
    let (direction, counterparty, amount) = if transaction.out_msgs.is_empty() {
        let inbound = transaction.in_msg.as_ref();
        (
            if inbound
                .and_then(|message| non_empty(message.source.as_deref()))
                .is_some()
            {
                WalletTransactionDirection::Incoming
            } else {
                WalletTransactionDirection::Unknown
            },
            inbound
                .and_then(|message| non_empty(message.source.as_deref()))
                .map(str::to_string),
            inbound
                .and_then(|message| amount_value(message.value.as_ref()))
                .unwrap_or(0),
        )
    } else {
        (
            WalletTransactionDirection::Outgoing,
            transaction
                .out_msgs
                .iter()
                .find_map(|message| non_empty(message.destination.as_deref()))
                .map(str::to_string),
            transaction.out_msgs.iter().fold(0_u128, |total, message| {
                total.saturating_add(amount_value(message.value.as_ref()).unwrap_or(0))
            }),
        )
    };
    let status = if transaction_failed(&transaction) {
        WalletTxStatus::Failed
    } else {
        WalletTxStatus::Confirmed
    };
    Ok(TonHistoryTransaction {
        tx_hash,
        message_ref,
        status,
        direction,
        counterparty,
        amount,
        fee,
        created_at,
    })
}

fn non_empty(value: Option<&str>) -> Option<&str> {
    value.filter(|value| !value.trim().is_empty())
}

fn transaction_failed(transaction: &TonCenterTransaction) -> bool {
    let Some(description) = &transaction.description else {
        return false;
    };
    description.aborted == Some(true)
        || description
            .compute_ph
            .as_ref()
            .and_then(|phase| phase.success)
            == Some(false)
        || description.action.as_ref().and_then(|phase| phase.success) == Some(false)
}

fn transaction_finalized(transaction: &TonCenterTransaction) -> bool {
    transaction.finalized == Some(true)
        || transaction.mc_block_seqno.is_some()
        || transaction.masterchain_seqno.is_some()
}

#[cfg(test)]
mod tests {
    use std::io::{Read, Write};
    use std::net::{TcpListener, TcpStream};
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::{mpsc, Arc, Barrier, Mutex};
    use std::thread;

    use super::*;

    #[test]
    fn snapshot_maps_wallet_states_response() {
        let server = TestServer::new(vec![TestResponse::json(
            200,
            r#"{"wallets":[{"address":"EQ1","balance":"2000000000","seqno":7,"status":"active"}]}"#,
        )]);
        let provider = test_provider(&server);

        let snapshot = provider.snapshot(&test_account()).expect("snapshot");

        assert_eq!(snapshot.seqno, 7);
        assert_eq!(snapshot.account_state, TonProviderAccountState::Active);
        assert_eq!(snapshot.balance, 2_000_000_000);
        assert_eq!(
            server.requests()[0].path,
            "/api/v3/walletStates?address=EQ1"
        );
    }

    #[test]
    fn mainnet_endpoint_preserves_api_v3_path() {
        let provider = TonCenterProvider::mainnet().expect("provider");

        let endpoint = provider.endpoint("walletStates").expect("endpoint");

        assert_eq!(
            endpoint.as_str(),
            "https://toncenter.com/api/v3/walletStates"
        );
    }

    #[test]
    fn snapshot_treats_missing_wallet_as_uninitialized() {
        let server = TestServer::new(vec![TestResponse::json(200, r#"{"wallets":[]}"#)]);
        let provider = test_provider(&server);

        let snapshot = provider.snapshot(&test_account()).expect("snapshot");

        assert_eq!(snapshot.seqno, 0);
        assert_eq!(
            snapshot.account_state,
            TonProviderAccountState::Uninitialized
        );
        assert_eq!(snapshot.balance, 0);
    }

    #[test]
    fn estimate_transfer_fee_posts_unsigned_body_and_adds_safety_buffer() {
        let server = TestServer::new(vec![TestResponse::json(
            200,
            r#"{
                "source_fees": {
                    "in_fwd_fee": "1000000",
                    "storage_fee": 2000000,
                    "gas_fee": 3000000,
                    "fwd_fee": 4000000
                },
                "destination_fees": []
            }"#,
        )]);
        let provider = test_provider(&server);

        let fee = provider
            .estimate_transfer_fee(TonFeeEstimateRequest {
                account: test_account(),
                body_boc_base64: "body-boc".to_string(),
                init_code_boc_base64: Some("code-boc".to_string()),
                init_data_boc_base64: Some("data-boc".to_string()),
            })
            .expect("fee estimate");

        let request = &server.requests()[0];
        assert_eq!(request.method, "POST");
        assert_eq!(request.path, "/api/v3/estimateFee");
        assert!(request.body.contains(r#""address":"EQ1""#));
        assert!(request.body.contains(r#""body":"body-boc""#));
        assert!(request.body.contains(r#""init_code":"code-boc""#));
        assert!(request.body.contains(r#""init_data":"data-boc""#));
        assert!(request.body.contains(r#""ignore_chksig":true"#));
        assert_eq!(fee, 11_000_000);
    }

    #[test]
    fn estimate_transfer_fee_preserves_provider_failure_diagnostic() {
        let server = TestServer::new(vec![TestResponse::json(
            500,
            r#"{"code":500,"error":"LITE_SERVER_UNKNOWN: cannot emulate query"}"#,
        )]);
        let provider = test_provider(&server);

        let error = provider
            .estimate_transfer_fee(TonFeeEstimateRequest {
                account: test_account(),
                body_boc_base64: "body-boc".to_string(),
                init_code_boc_base64: None,
                init_data_boc_base64: None,
            })
            .expect_err("fee estimate failure");

        assert_eq!(
            error.kind,
            chromvoid_core::wallet::ton::TonProviderErrorKind::Unavailable
        );
        assert_eq!(
            error.message,
            "TON Center estimateFee failed with HTTP 500 Internal Server Error / TON code 500: LITE_SERVER_UNKNOWN: cannot emulate query"
        );
    }

    #[test]
    fn broadcast_posts_boc_and_returns_message_reference() {
        let server = TestServer::new(vec![TestResponse::json(
            200,
            r#"{"message_hash":"hash-raw","message_hash_norm":"hash-norm"}"#,
        )]);
        let provider = test_provider(&server);

        let result = provider
            .broadcast(TonBroadcastRequest {
                account: test_account(),
                seqno: 7,
                message_hash: "local-hash".to_string(),
                signed_message_boc_base64: "te6cckEBAQEAAgAAAA==".to_string(),
            })
            .expect("broadcast");

        let request = &server.requests()[0];
        assert_eq!(request.method, "POST");
        assert_eq!(request.path, "/api/v3/message");
        assert!(request.body.contains(r#""boc":"te6cckEBAQEAAgAAAA==""#));
        assert_eq!(result.status, WalletConfirmStatus::Pending);
        assert_eq!(result.message_ref.as_deref(), Some("hash-norm"));
    }

    #[test]
    fn broadcast_dedupe_key_uses_the_exact_http_body() {
        let first = TonBroadcastRequest {
            account: test_account(),
            seqno: 7,
            message_hash: "local-hash-a".to_string(),
            signed_message_boc_base64: "signed-boc".to_string(),
        };
        let second = TonBroadcastRequest {
            message_hash: "local-hash-b".to_string(),
            ..first.clone()
        };
        let different_boc = TonBroadcastRequest {
            signed_message_boc_base64: "different-signed-boc".to_string(),
            ..first.clone()
        };

        assert_eq!(broadcast_key(&first), broadcast_key(&second));
        assert_ne!(broadcast_key(&first), broadcast_key(&different_boc));
    }

    #[test]
    fn history_maps_incoming_and_outgoing_transactions() {
        let server = TestServer::new(vec![TestResponse::json(
            200,
            r#"{
                "transactions": [
                    {
                        "hash": "incoming-hash",
                        "now": 1710000000,
                        "total_fees": "1500",
                        "in_msg": {
                            "hash": "incoming-message",
                            "hash_norm": "incoming-message-norm",
                            "source": "EQ-source",
                            "destination": "EQ1",
                            "value": "2500000000"
                        },
                        "out_msgs": [],
                        "description": {"aborted": false}
                    },
                    {
                        "hash": "outgoing-hash",
                        "now": 1710000100,
                        "total_fees": 2000,
                        "in_msg": {"hash": "outgoing-message"},
                        "out_msgs": [
                            {"destination": "EQ-destination", "value": "1000000000"},
                            {"destination": "EQ-change", "value": "500000000"}
                        ],
                        "description": {"aborted": true}
                    }
                ]
            }"#,
        )]);
        let provider = test_provider(&server);

        let transactions = provider
            .history(TonHistoryRequest {
                account: test_account(),
                limit: 50,
            })
            .expect("history");

        assert_eq!(
            server.requests()[0].path,
            "/api/v3/transactions?account=EQ1&limit=50&sort=desc"
        );
        assert_eq!(transactions.len(), 2);
        assert_eq!(transactions[0].tx_hash, "incoming-hash");
        assert_eq!(
            transactions[0].message_ref.as_deref(),
            Some("incoming-message-norm")
        );
        assert_eq!(
            transactions[0].direction,
            WalletTransactionDirection::Incoming
        );
        assert_eq!(transactions[0].counterparty.as_deref(), Some("EQ-source"));
        assert_eq!(transactions[0].amount, 2_500_000_000);
        assert_eq!(transactions[0].fee, 1_500);
        assert_eq!(transactions[0].created_at, 1_710_000_000_000);
        assert_eq!(transactions[0].status, WalletTxStatus::Confirmed);
        assert_eq!(
            transactions[1].direction,
            WalletTransactionDirection::Outgoing
        );
        assert_eq!(
            transactions[1].counterparty.as_deref(),
            Some("EQ-destination")
        );
        assert_eq!(transactions[1].amount, 1_500_000_000);
        assert_eq!(transactions[1].status, WalletTxStatus::Failed);
    }

    #[test]
    fn refresh_confirms_transaction_by_message() {
        let server = TestServer::new(vec![TestResponse::json(
            200,
            r#"{"transactions":[{"hash":"tx-hash","finalized":true,"description":{"aborted":false,"compute_ph":{"success":true},"action":{"success":true}}}]}"#,
        )]);
        let provider = test_provider(&server);

        let result = provider
            .refresh(TonRefreshRequest {
                account: test_account(),
                tx_ref: "tx-ref".to_string(),
                account_id: "account-1".to_string(),
                message_ref: Some("message-ref".to_string()),
                tx_hash: None,
                valid_until: None,
            })
            .expect("refresh");

        assert_eq!(
            server.requests()[0].path,
            "/api/v3/transactionsByMessage?msg_hash=message-ref&limit=1"
        );
        assert_eq!(result.status, WalletTxStatus::Confirmed);
        assert_eq!(result.tx_hash.as_deref(), Some("tx-hash"));
    }

    #[test]
    fn refresh_keeps_missing_transaction_pending() {
        let server = TestServer::new(vec![TestResponse::json(200, r#"{"transactions":[]}"#)]);
        let provider = test_provider(&server);

        let result = provider
            .refresh(TonRefreshRequest {
                account: test_account(),
                tx_ref: "tx-ref".to_string(),
                account_id: "account-1".to_string(),
                message_ref: Some("message-ref".to_string()),
                tx_hash: None,
                valid_until: None,
            })
            .expect("refresh");

        assert_eq!(result.status, WalletTxStatus::Pending);
        assert_eq!(result.tx_hash, None);
    }

    #[test]
    fn refresh_keeps_non_finalized_transaction_pending() {
        let server = TestServer::new(vec![TestResponse::json(
            200,
            r#"{"transactions":[{"hash":"tx-hash","description":{"aborted":false}}]}"#,
        )]);
        let provider = test_provider(&server);

        let result = provider
            .refresh(TonRefreshRequest {
                account: test_account(),
                tx_ref: "tx-ref".to_string(),
                account_id: "account-1".to_string(),
                message_ref: Some("message-ref".to_string()),
                tx_hash: None,
                valid_until: None,
            })
            .expect("refresh");

        assert_eq!(result.status, WalletTxStatus::Pending);
        assert_eq!(result.tx_hash.as_deref(), Some("tx-hash"));
    }

    #[test]
    fn refresh_falls_back_to_account_transaction_by_hash() {
        let server = TestServer::new(vec![
            TestResponse::json(200, r#"{"transactions":[]}"#),
            TestResponse::json(
                200,
                r#"{"transactions":[{"hash":"tx-hash","finalized":true,"description":{"aborted":false}}]}"#,
            ),
        ]);
        let provider = test_provider(&server);

        let result = provider
            .refresh(TonRefreshRequest {
                account: test_account(),
                tx_ref: "tx-ref".to_string(),
                account_id: "account-1".to_string(),
                message_ref: Some("message-ref".to_string()),
                tx_hash: Some("tx-hash".to_string()),
                valid_until: None,
            })
            .expect("refresh");

        let requests = server.requests();
        assert_eq!(
            requests[0].path,
            "/api/v3/transactionsByMessage?msg_hash=message-ref&limit=1"
        );
        assert_eq!(
            requests[1].path,
            "/api/v3/transactions?account=EQ1&hash=tx-hash&limit=1"
        );
        assert_eq!(result.status, WalletTxStatus::Confirmed);
        assert_eq!(result.tx_hash.as_deref(), Some("tx-hash"));
    }

    #[test]
    fn maps_rate_limit_to_unavailable_and_preserves_diagnostic() {
        let server = TestServer::new(vec![TestResponse::json(
            429,
            r#"{"code":429,"error":"rate limit"}"#,
        )]);
        let provider = test_provider(&server);

        let error = provider.snapshot(&test_account()).expect_err("rate limit");

        assert_eq!(
            error.kind,
            chromvoid_core::wallet::ton::TonProviderErrorKind::Unavailable
        );
        assert_eq!(
            error.message,
            "TON Center walletStates failed with HTTP 429 Too Many Requests / TON code 429: rate limit"
        );
    }

    #[test]
    fn provider_error_detail_is_single_line_and_bounded() {
        let raw = format!(
            "  first line\n{}  ",
            "x".repeat(TON_CENTER_ERROR_DETAIL_LIMIT + 20)
        );

        let detail = sanitize_provider_error_detail(&raw);

        assert!(!detail.contains('\n'));
        assert!(detail.ends_with('…'));
        assert_eq!(detail.chars().count(), TON_CENTER_ERROR_DETAIL_LIMIT + 1);
    }

    #[test]
    fn provider_error_category_distinguishes_rate_limit_and_emulation() {
        assert_eq!(
            provider_error_category(StatusCode::TOO_MANY_REQUESTS, "rate limit"),
            "rate_limited"
        );
        assert_eq!(
            provider_error_category(
                StatusCode::INTERNAL_SERVER_ERROR,
                "LITE_SERVER_UNKNOWN: cannot emulate query",
            ),
            "emulation_failed"
        );
    }

    #[test]
    fn request_gate_waits_between_uncached_calls() {
        let gate = TonCenterRequestGate::new(Duration::from_millis(20), Duration::ZERO);
        let response = || {
            Ok(TonCenterHttpResponse {
                status: StatusCode::OK,
                body: "{}".to_string(),
            })
        };

        gate.run(
            TonCenterRequestPolicy::in_flight_only(
                "first".to_string(),
                TonCenterRequestPriority::Background,
            ),
            response,
        )
        .expect("first request");
        let started = Instant::now();
        gate.run(
            TonCenterRequestPolicy::in_flight_only(
                "second".to_string(),
                TonCenterRequestPriority::Background,
            ),
            response,
        )
        .expect("second request");

        assert!(
            started.elapsed() >= Duration::from_millis(15),
            "second wait should delay near the configured request interval"
        );
    }

    #[test]
    fn request_gate_serializes_uncached_calls_with_different_keys() {
        let gate = Arc::new(TonCenterRequestGate::new(Duration::ZERO, Duration::ZERO));
        let active_requests = Arc::new(AtomicUsize::new(0));
        let max_active_requests = Arc::new(AtomicUsize::new(0));
        let barrier = Arc::new(Barrier::new(2));

        let spawn_request = |key: &'static str| {
            let gate = gate.clone();
            let active_requests = active_requests.clone();
            let max_active_requests = max_active_requests.clone();
            let barrier = barrier.clone();
            thread::spawn(move || {
                barrier.wait();
                gate.run(
                    TonCenterRequestPolicy::cached(
                        key.to_string(),
                        TonCenterRequestPriority::Background,
                    ),
                    || {
                        let active = active_requests.fetch_add(1, Ordering::SeqCst) + 1;
                        max_active_requests.fetch_max(active, Ordering::SeqCst);
                        thread::sleep(Duration::from_millis(30));
                        active_requests.fetch_sub(1, Ordering::SeqCst);
                        Ok(TonCenterHttpResponse {
                            status: StatusCode::OK,
                            body: "{}".to_string(),
                        })
                    },
                )
                .expect("request")
            })
        };

        let first = spawn_request("wallet_state:EQ1");
        let second = spawn_request("tx_by_message:message-ref");

        first.join().expect("first thread");
        second.join().expect("second thread");

        assert_eq!(max_active_requests.load(Ordering::SeqCst), 1);
    }

    #[test]
    fn request_gate_runs_critical_requests_before_background_requests() {
        let gate = Arc::new(TonCenterRequestGate::new(Duration::ZERO, Duration::ZERO));
        let order = Arc::new(Mutex::new(Vec::new()));
        let (active_started_tx, active_started_rx) = mpsc::channel();
        let (release_active_tx, release_active_rx) = mpsc::channel();

        let active = {
            let gate = gate.clone();
            let order = order.clone();
            thread::spawn(move || {
                gate.run(
                    TonCenterRequestPolicy::in_flight_only(
                        "active".to_string(),
                        TonCenterRequestPriority::Interactive,
                    ),
                    || {
                        order.lock().expect("order").push("active");
                        active_started_tx.send(()).expect("active started");
                        release_active_rx.recv().expect("release active");
                        Ok(ok_response())
                    },
                )
                .expect("active request")
            })
        };
        active_started_rx.recv().expect("active request started");

        let background = spawn_ordered_request(
            gate.clone(),
            order.clone(),
            "background",
            TonCenterRequestPriority::Background,
        );
        wait_for_queued_requests(&gate, 1);
        let critical = spawn_ordered_request(
            gate.clone(),
            order.clone(),
            "critical",
            TonCenterRequestPriority::Critical,
        );
        wait_for_queued_requests(&gate, 2);

        release_active_tx.send(()).expect("release active request");
        active.join().expect("active thread");
        background.join().expect("background thread");
        critical.join().expect("critical thread");

        assert_eq!(
            order.lock().expect("order").as_slice(),
            ["active", "critical", "background"]
        );
    }

    #[test]
    fn request_gate_preserves_fifo_order_within_priority() {
        let gate = Arc::new(TonCenterRequestGate::new(Duration::ZERO, Duration::ZERO));
        let order = Arc::new(Mutex::new(Vec::new()));
        let (active_started_tx, active_started_rx) = mpsc::channel();
        let (release_active_tx, release_active_rx) = mpsc::channel();

        let active = {
            let gate = gate.clone();
            thread::spawn(move || {
                gate.run(
                    TonCenterRequestPolicy::in_flight_only(
                        "active".to_string(),
                        TonCenterRequestPriority::Interactive,
                    ),
                    || {
                        active_started_tx.send(()).expect("active started");
                        release_active_rx.recv().expect("release active");
                        Ok(ok_response())
                    },
                )
                .expect("active request")
            })
        };
        active_started_rx.recv().expect("active request started");

        let first = spawn_ordered_request(
            gate.clone(),
            order.clone(),
            "first",
            TonCenterRequestPriority::Reconciliation,
        );
        wait_for_queued_requests(&gate, 1);
        let second = spawn_ordered_request(
            gate.clone(),
            order.clone(),
            "second",
            TonCenterRequestPriority::Reconciliation,
        );
        wait_for_queued_requests(&gate, 2);

        release_active_tx.send(()).expect("release active request");
        active.join().expect("active thread");
        first.join().expect("first thread");
        second.join().expect("second thread");

        assert_eq!(order.lock().expect("order").as_slice(), ["first", "second"]);
    }

    #[test]
    fn request_gate_ages_background_work_without_overtaking_critical_work() {
        let queued_at = Instant::now();
        let now = queued_at + Duration::from_secs(10);
        let background = TonCenterQueuedRequest {
            sequence: 0,
            priority: TonCenterRequestPriority::Background,
            queued_at,
        };
        let critical = TonCenterQueuedRequest {
            sequence: 1,
            priority: TonCenterRequestPriority::Critical,
            queued_at: now,
        };

        assert_eq!(
            effective_priority(&background, now, Duration::from_secs(5)),
            TonCenterRequestPriority::Interactive.rank()
        );
        assert_eq!(
            effective_priority(&critical, now, Duration::from_secs(5)),
            TonCenterRequestPriority::Critical.rank()
        );
    }

    #[test]
    fn request_gate_does_not_cache_failures() {
        let gate = TonCenterRequestGate::new(Duration::ZERO, Duration::from_secs(1));
        let calls = AtomicUsize::new(0);

        for _ in 0..2 {
            let result = gate.run(
                TonCenterRequestPolicy::cached(
                    "wallet_state:EQ1".to_string(),
                    TonCenterRequestPriority::Interactive,
                ),
                || {
                    calls.fetch_add(1, Ordering::SeqCst);
                    Ok(TonCenterHttpResponse {
                        status: StatusCode::TOO_MANY_REQUESTS,
                        body: r#"{"code":429}"#.to_string(),
                    })
                },
            );
            assert_eq!(
                result.expect("HTTP response").status(),
                StatusCode::TOO_MANY_REQUESTS
            );
        }

        assert_eq!(calls.load(Ordering::SeqCst), 2);
    }

    #[test]
    fn request_gate_only_deduplicates_broadcasts_while_in_flight() {
        let gate = Arc::new(TonCenterRequestGate::new(
            Duration::ZERO,
            Duration::from_secs(1),
        ));
        let calls = Arc::new(AtomicUsize::new(0));
        let barrier = Arc::new(Barrier::new(2));

        let spawn_broadcast = || {
            let gate = gate.clone();
            let calls = calls.clone();
            let barrier = barrier.clone();
            thread::spawn(move || {
                barrier.wait();
                gate.run(
                    TonCenterRequestPolicy::in_flight_only(
                        "broadcast:message".to_string(),
                        TonCenterRequestPriority::Critical,
                    ),
                    || {
                        calls.fetch_add(1, Ordering::SeqCst);
                        thread::sleep(Duration::from_millis(30));
                        Ok(ok_response())
                    },
                )
                .expect("broadcast")
            })
        };

        let first = spawn_broadcast();
        let second = spawn_broadcast();
        first.join().expect("first broadcast thread");
        second.join().expect("second broadcast thread");
        assert_eq!(calls.load(Ordering::SeqCst), 1);

        gate.run(
            TonCenterRequestPolicy::in_flight_only(
                "broadcast:message".to_string(),
                TonCenterRequestPriority::Critical,
            ),
            || {
                calls.fetch_add(1, Ordering::SeqCst);
                Ok(ok_response())
            },
        )
        .expect("later broadcast");

        assert_eq!(calls.load(Ordering::SeqCst), 2);
    }

    #[test]
    fn request_gate_recovers_after_request_panic() {
        let gate = TonCenterRequestGate::new(Duration::ZERO, Duration::ZERO);
        let panic = std::panic::catch_unwind(AssertUnwindSafe(|| {
            let _ = gate.run(
                TonCenterRequestPolicy::cached(
                    "wallet_state:EQ1".to_string(),
                    TonCenterRequestPriority::Interactive,
                ),
                || panic!("request panic"),
            );
        }));
        assert!(panic.is_err());

        let response = gate
            .run(
                TonCenterRequestPolicy::cached(
                    "wallet_state:EQ1".to_string(),
                    TonCenterRequestPriority::Interactive,
                ),
                || Ok(ok_response()),
            )
            .expect("request after panic");

        assert_eq!(response.status(), StatusCode::OK);
    }

    #[test]
    fn duplicate_snapshot_requests_share_in_flight_request() {
        let server = TestServer::new(vec![TestResponse::json_delayed(
            200,
            r#"{"wallets":[{"address":"EQ1","balance":"2000000000","seqno":7,"status":"active"}]}"#,
            Duration::from_millis(50),
        )]);
        let provider = Arc::new(test_provider(&server));
        let barrier = Arc::new(Barrier::new(2));

        let first = {
            let provider = provider.clone();
            let barrier = barrier.clone();
            thread::spawn(move || {
                barrier.wait();
                provider.snapshot(&test_account()).expect("first snapshot")
            })
        };
        let second = {
            let provider = provider.clone();
            let barrier = barrier.clone();
            thread::spawn(move || {
                barrier.wait();
                provider.snapshot(&test_account()).expect("second snapshot")
            })
        };

        assert_eq!(first.join().expect("first thread").seqno, 7);
        assert_eq!(second.join().expect("second thread").seqno, 7);
        assert_eq!(server.requests().len(), 1);
    }

    #[test]
    fn duplicate_fee_estimates_share_in_flight_request() {
        let server = TestServer::new(vec![TestResponse::json_delayed(
            200,
            r#"{
                "source_fees": {
                    "in_fwd_fee": "1000000",
                    "storage_fee": "2000000",
                    "gas_fee": "3000000",
                    "fwd_fee": "4000000"
                }
            }"#,
            Duration::from_millis(50),
        )]);
        let provider = Arc::new(test_provider(&server));
        let barrier = Arc::new(Barrier::new(2));

        let spawn_estimate = || {
            let provider = provider.clone();
            let barrier = barrier.clone();
            thread::spawn(move || {
                barrier.wait();
                provider
                    .estimate_transfer_fee(test_fee_request())
                    .expect("fee estimate")
            })
        };
        let first = spawn_estimate();
        let second = spawn_estimate();

        assert_eq!(first.join().expect("first estimate thread"), 11_000_000);
        assert_eq!(second.join().expect("second estimate thread"), 11_000_000);
        assert_eq!(server.requests().len(), 1);
    }

    #[test]
    fn duplicate_refresh_requests_use_debounce_cache() {
        let server = TestServer::new(vec![TestResponse::json(
            200,
            r#"{"transactions":[{"hash":"tx-hash","finalized":true,"description":{"aborted":false}}]}"#,
        )]);
        let provider = test_provider_with_debounce(&server, Duration::from_secs(1));
        let request = || TonRefreshRequest {
            account: test_account(),
            tx_ref: "tx-ref".to_string(),
            account_id: "account-1".to_string(),
            message_ref: Some("message-ref".to_string()),
            tx_hash: None,
            valid_until: None,
        };

        let first = provider.refresh(request()).expect("first refresh");
        let second = provider.refresh(request()).expect("second refresh");

        assert_eq!(first.status, WalletTxStatus::Confirmed);
        assert_eq!(second.status, WalletTxStatus::Confirmed);
        assert_eq!(server.requests().len(), 1);
    }

    fn test_provider(server: &TestServer) -> TonCenterProvider {
        TonCenterProvider::new(TonCenterProviderConfig::test(server.api_base_url()))
            .expect("provider")
    }

    fn test_provider_with_debounce(
        server: &TestServer,
        debounce_interval: Duration,
    ) -> TonCenterProvider {
        let mut config = TonCenterProviderConfig::test(server.api_base_url());
        config.debounce_interval = debounce_interval;
        TonCenterProvider::new(config).expect("provider")
    }

    fn test_account() -> TonProviderAccount {
        TonProviderAccount {
            account_id: "account-1".to_string(),
            wallet_id: "wallet-1".to_string(),
            address: "EQ1".to_string(),
            raw_account: "0:1".to_string(),
        }
    }

    fn test_fee_request() -> TonFeeEstimateRequest {
        TonFeeEstimateRequest {
            account: test_account(),
            body_boc_base64: "body-boc".to_string(),
            init_code_boc_base64: None,
            init_data_boc_base64: None,
        }
    }

    fn ok_response() -> TonCenterHttpResponse {
        TonCenterHttpResponse {
            status: StatusCode::OK,
            body: "{}".to_string(),
        }
    }

    fn spawn_ordered_request(
        gate: Arc<TonCenterRequestGate>,
        order: Arc<Mutex<Vec<&'static str>>>,
        key: &'static str,
        priority: TonCenterRequestPriority,
    ) -> thread::JoinHandle<TonCenterHttpResponse> {
        thread::spawn(move || {
            gate.run(
                TonCenterRequestPolicy::in_flight_only(key.to_string(), priority),
                || {
                    order.lock().expect("order").push(key);
                    Ok(ok_response())
                },
            )
            .expect("ordered request")
        })
    }

    fn wait_for_queued_requests(gate: &TonCenterRequestGate, expected: usize) {
        let deadline = Instant::now() + Duration::from_secs(1);
        loop {
            if gate.queue.lock().expect("request queue").waiting.len() == expected {
                return;
            }
            assert!(
                Instant::now() < deadline,
                "requests did not enter the queue"
            );
            thread::yield_now();
        }
    }

    #[derive(Clone)]
    struct TestResponse {
        status: u16,
        body: &'static str,
        delay: Duration,
    }

    impl TestResponse {
        fn json(status: u16, body: &'static str) -> Self {
            Self {
                status,
                body,
                delay: Duration::ZERO,
            }
        }

        fn json_delayed(status: u16, body: &'static str, delay: Duration) -> Self {
            Self {
                status,
                body,
                delay,
            }
        }
    }

    #[derive(Debug, Clone)]
    struct TestRequest {
        method: String,
        path: String,
        body: String,
    }

    struct TestServer {
        address: std::net::SocketAddr,
        requests: Arc<Mutex<Vec<TestRequest>>>,
    }

    impl TestServer {
        fn new(responses: Vec<TestResponse>) -> Self {
            let listener = TcpListener::bind("127.0.0.1:0").expect("bind test server");
            let address = listener.local_addr().expect("local addr");
            let requests = Arc::new(Mutex::new(Vec::new()));
            let request_log = requests.clone();
            thread::spawn(move || {
                for response in responses {
                    let (mut stream, _) = listener.accept().expect("accept");
                    let request = read_request(&mut stream);
                    request_log.lock().expect("requests").push(request);
                    write_response(&mut stream, response);
                }
            });
            Self { address, requests }
        }

        fn api_base_url(&self) -> Url {
            Url::parse(&format!("http://{}/api/v3/", self.address)).expect("test URL")
        }

        fn requests(&self) -> Vec<TestRequest> {
            self.requests.lock().expect("requests").clone()
        }
    }

    fn read_request(stream: &mut TcpStream) -> TestRequest {
        let mut buffer = [0u8; 8192];
        let mut bytes = Vec::new();
        let mut content_length = 0usize;
        loop {
            let read = stream.read(&mut buffer).expect("read request");
            if read == 0 {
                break;
            }
            bytes.extend_from_slice(&buffer[..read]);
            if let Some(headers_end) = find_headers_end(&bytes) {
                let headers = String::from_utf8_lossy(&bytes[..headers_end]);
                content_length = headers
                    .lines()
                    .find_map(|line| {
                        let (name, value) = line.split_once(':')?;
                        name.eq_ignore_ascii_case("content-length")
                            .then(|| value.trim().parse::<usize>().ok())
                            .flatten()
                    })
                    .unwrap_or(0);
                if bytes.len() >= headers_end + 4 + content_length {
                    break;
                }
            }
        }
        let headers_end = find_headers_end(&bytes).expect("headers end");
        let request_line = String::from_utf8_lossy(&bytes[..headers_end])
            .lines()
            .next()
            .expect("request line")
            .to_string();
        let mut parts = request_line.split_whitespace();
        let method = parts.next().expect("method").to_string();
        let path = parts.next().expect("path").to_string();
        let body_start = headers_end + 4;
        let body_end = body_start + content_length;
        TestRequest {
            method,
            path,
            body: String::from_utf8_lossy(&bytes[body_start..body_end]).to_string(),
        }
    }

    fn find_headers_end(bytes: &[u8]) -> Option<usize> {
        bytes.windows(4).position(|window| window == b"\r\n\r\n")
    }

    fn write_response(stream: &mut TcpStream, response: TestResponse) {
        if !response.delay.is_zero() {
            thread::sleep(response.delay);
        }
        let status_text = match response.status {
            200 => "OK",
            400 => "Bad Request",
            429 => "Too Many Requests",
            500 => "Internal Server Error",
            _ => "OK",
        };
        let body = response.body.as_bytes();
        write!(
            stream,
            "HTTP/1.1 {} {}\r\ncontent-type: application/json\r\ncontent-length: {}\r\nconnection: close\r\n\r\n",
            response.status,
            status_text,
            body.len()
        )
        .expect("write response headers");
        stream.write_all(body).expect("write response body");
        stream.flush().expect("flush response");
    }
}
