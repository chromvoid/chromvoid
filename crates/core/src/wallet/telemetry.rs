use crate::rpc::types::WalletNetwork;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum WalletTelemetryMetric {
    WalletCommandTotal,
    WalletStatusTotal,
    WalletPrepareDurationMs,
    WalletConfirmDurationMs,
    WalletExportTotal,
    WalletPreparationExpiredTotal,
}

impl WalletTelemetryMetric {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::WalletCommandTotal => "wallet_command_total",
            Self::WalletStatusTotal => "wallet_status_total",
            Self::WalletPrepareDurationMs => "wallet_prepare_duration_ms",
            Self::WalletConfirmDurationMs => "wallet_confirm_duration_ms",
            Self::WalletExportTotal => "wallet_export_total",
            Self::WalletPreparationExpiredTotal => "wallet_preparation_expired_total",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WalletTelemetryEvent {
    pub metric: WalletTelemetryMetric,
    pub wallet_command: String,
    pub status: String,
    pub error_code: Option<String>,
    pub network: Option<WalletNetwork>,
    pub duration_ms: Option<u64>,
}

impl WalletTelemetryEvent {
    pub fn new(
        metric: WalletTelemetryMetric,
        wallet_command: impl Into<String>,
        status: impl Into<String>,
    ) -> Self {
        Self {
            metric,
            wallet_command: wallet_command.into(),
            status: status.into(),
            error_code: None,
            network: None,
            duration_ms: None,
        }
    }

    pub fn with_error_code(mut self, error_code: Option<String>) -> Self {
        self.error_code = error_code;
        self
    }

    pub fn with_network(mut self, network: Option<WalletNetwork>) -> Self {
        self.network = network;
        self
    }

    pub fn with_duration_ms(mut self, duration_ms: Option<u64>) -> Self {
        self.duration_ms = duration_ms;
        self
    }
}

pub trait WalletTelemetrySink: Send + Sync {
    fn record(&self, event: WalletTelemetryEvent);
}

#[derive(Debug, Default)]
pub struct NoopWalletTelemetrySink;

impl WalletTelemetrySink for NoopWalletTelemetrySink {
    fn record(&self, _event: WalletTelemetryEvent) {}
}
