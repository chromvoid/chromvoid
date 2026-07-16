use super::*;

impl RpcRouter {
    pub(in crate::rpc::router) fn observe_wallet_rpc_response(
        &self,
        command: &str,
        started_at: std::time::Instant,
        response: RpcResponse,
    ) -> RpcResponse {
        let duration_ms = started_at.elapsed().as_millis() as u64;
        let (status, error_code) = match &response {
            RpcResponse::Success { .. } => ("success".to_string(), None),
            RpcResponse::Error { code, .. } => ("error".to_string(), code.clone()),
        };
        let network = wallet_response_network(&response);
        self.record_wallet_telemetry(
            WalletTelemetryEvent::new(
                WalletTelemetryMetric::WalletCommandTotal,
                command,
                status.clone(),
            )
            .with_error_code(error_code.clone())
            .with_network(network.clone()),
        );
        match command {
            "wallet:status" => self.record_wallet_telemetry(
                WalletTelemetryEvent::new(
                    WalletTelemetryMetric::WalletStatusTotal,
                    command,
                    status.clone(),
                )
                .with_error_code(error_code.clone())
                .with_network(network.clone()),
            ),
            "wallet:transaction:prepare" => self.record_wallet_telemetry(
                WalletTelemetryEvent::new(
                    WalletTelemetryMetric::WalletPrepareDurationMs,
                    command,
                    status.clone(),
                )
                .with_error_code(error_code.clone())
                .with_network(network.clone())
                .with_duration_ms(Some(duration_ms)),
            ),
            "wallet:transaction:confirm" => self.record_wallet_telemetry(
                WalletTelemetryEvent::new(
                    WalletTelemetryMetric::WalletConfirmDurationMs,
                    command,
                    status.clone(),
                )
                .with_error_code(error_code.clone())
                .with_network(network.clone())
                .with_duration_ms(Some(duration_ms)),
            ),
            "wallet:backup:export" => self.record_wallet_telemetry(
                WalletTelemetryEvent::new(
                    WalletTelemetryMetric::WalletExportTotal,
                    command,
                    status.clone(),
                )
                .with_error_code(error_code.clone())
                .with_network(network.clone()),
            ),
            _ => {}
        }
        if error_code.as_deref() == Some("PREPARATION_EXPIRED") {
            self.record_wallet_telemetry(
                WalletTelemetryEvent::new(
                    WalletTelemetryMetric::WalletPreparationExpiredTotal,
                    command,
                    status,
                )
                .with_error_code(error_code)
                .with_network(network),
            );
        }
        response
    }

    pub(super) fn record_wallet_telemetry(&self, event: WalletTelemetryEvent) {
        emit_wallet_telemetry(self.wallet_telemetry_sink.as_ref(), event);
    }

    pub(super) fn with_wallet_read_session_cleaned<T, F>(&mut self, f: F) -> RpcResponse
    where
        T: Serialize,
        F: FnOnce(&mut VaultSession, &Storage) -> WalletResult<T>,
    {
        if let Some(response) = self.wallet_read_preflight() {
            return response;
        }
        self.with_wallet_session_cleaned_after_preflight(f)
    }

    pub(super) fn with_wallet_session_cleaned<T, F>(&mut self, f: F) -> RpcResponse
    where
        T: Serialize,
        F: FnOnce(&mut VaultSession, &Storage) -> WalletResult<T>,
    {
        if let Some(response) = self.wallet_preflight() {
            return response;
        }
        self.with_wallet_session_cleaned_after_preflight(f)
    }

    pub(super) fn with_wallet_session_cleaned_after_preflight<T, F>(&mut self, f: F) -> RpcResponse
    where
        T: Serialize,
        F: FnOnce(&mut VaultSession, &Storage) -> WalletResult<T>,
    {
        let storage = self.storage.clone();
        let telemetry = self.wallet_telemetry_sink.clone();
        self.with_session_mut(|session| {
            match cleanup_expired_preparations(session, &storage) {
                Ok(expired_count) => {
                    for _ in 0..expired_count {
                        emit_wallet_telemetry(
                            telemetry.as_ref(),
                            WalletTelemetryEvent::new(
                                WalletTelemetryMetric::WalletPreparationExpiredTotal,
                                "wallet:preparation:cleanup",
                                "success",
                            ),
                        );
                    }
                }
                Err(error) => {
                    emit_wallet_telemetry(
                        telemetry.as_ref(),
                        WalletTelemetryEvent::new(
                            WalletTelemetryMetric::WalletPreparationExpiredTotal,
                            "wallet:preparation:cleanup",
                            "error",
                        )
                        .with_error_code(error.code().map(str::to_string)),
                    );
                    return error.into_rpc_response();
                }
            }
            result_response(f(session, &storage))
        })
    }

    pub(super) fn with_wallet_read_session_after_preflight<T, F>(&self, f: F) -> RpcResponse
    where
        T: Serialize,
        F: FnOnce(&VaultSession, &Storage) -> WalletResult<T>,
    {
        let storage = self.storage.clone();
        self.with_session(|session| result_response(f(session, &storage)))
    }

    pub(in crate::rpc::router) fn recover_wallet_preparations_best_effort(&mut self) {
        let storage = self.storage.clone();
        let Some(session) = self.session.as_mut() else {
            return;
        };
        match cleanup_expired_preparations(session, &storage) {
            Ok(expired_count) => {
                for _ in 0..expired_count {
                    self.record_wallet_telemetry(WalletTelemetryEvent::new(
                        WalletTelemetryMetric::WalletPreparationExpiredTotal,
                        "wallet:preparation:cleanup",
                        "success",
                    ));
                }
            }
            Err(error) => {
                self.record_wallet_telemetry(
                    WalletTelemetryEvent::new(
                        WalletTelemetryMetric::WalletPreparationExpiredTotal,
                        "wallet:preparation:cleanup",
                        "error",
                    )
                    .with_error_code(error.code().map(str::to_string)),
                );
                tracing::warn!(
                    message = error.message(),
                    code = error.code(),
                    "wallet:expired_preparation_cleanup_failed"
                );
            }
        }
    }

    pub(super) fn wallet_disabled_reason(&self) -> &'static str {
        "Wallet domain disabled"
    }

    pub(super) fn wallet_read_preflight(&self) -> Option<RpcResponse> {
        if self.session.is_none() {
            return Some(RpcResponse::error(
                "Vault not unlocked",
                Some(ErrorCode::VaultRequired),
            ));
        }
        None
    }

    pub(super) fn wallet_preflight(&self) -> Option<RpcResponse> {
        if self.session.is_none() {
            return Some(RpcResponse::error(
                "Vault not unlocked",
                Some(ErrorCode::VaultRequired),
            ));
        }
        if !self.wallet_runtime_config.wallet_enabled {
            return Some(RpcResponse::error(
                self.wallet_disabled_reason(),
                Some(ErrorCode::WalletDisabled),
            ));
        }
        None
    }
}

fn wallet_response_network(response: &RpcResponse) -> Option<WalletNetwork> {
    let RpcResponse::Success { result, .. } = response else {
        return None;
    };
    result
        .get("network")
        .and_then(serde_json::Value::as_str)
        .map(WalletNetwork::from)
}

fn emit_wallet_telemetry(
    sink: &dyn crate::wallet::WalletTelemetrySink,
    event: WalletTelemetryEvent,
) {
    tracing::info!(
        spec_id = "SPEC-217",
        metric = event.metric.as_str(),
        wallet_command = event.wallet_command.as_str(),
        status = event.status.as_str(),
        error_code = event.error_code.as_deref(),
        network = event.network.as_ref().map(WalletNetwork::as_str),
        duration_ms = event.duration_ms,
        "wallet_telemetry"
    );
    sink.record(event);
}
