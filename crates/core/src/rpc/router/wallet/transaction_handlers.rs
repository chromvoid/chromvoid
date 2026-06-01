use super::*;

impl RpcRouter {
    pub(in crate::rpc::router) fn handle_wallet_transaction_prepare(
        &mut self,
        data: &Value,
    ) -> RpcResponse {
        if let Some(response) = self.wallet_preflight(false) {
            return response;
        }
        if has_disallowed_prepare_fields(data) {
            return invalid_input("wallet:transaction:prepare accepts only high-level v1 intent")
                .into_rpc_response();
        }
        if let Some(error) = reject_unsupported_network(data, "network") {
            return error.into_rpc_response();
        }
        let provider = match self.wallet_provider.clone() {
            Some(provider) => provider,
            None => return provider_unavailable().into_rpc_response(),
        };
        let request = match parse::<WalletTransactionPrepareRequest>(data) {
            Ok(request) => request,
            Err(error) => return error.into_rpc_response(),
        };
        if request.outputs.is_empty() {
            return invalid_input("outputs are required").into_rpc_response();
        }
        if request.network == WalletNetwork::Ethereum && request.outputs.len() != 1 {
            return invalid_input("ethereum v1 supports exactly one output").into_rpc_response();
        }
        if let Err(error) = validate_outputs(&request.outputs) {
            return error.into_rpc_response();
        }

        self.with_wallet_session_cleaned_after_preflight(|session, storage| {
            let account = load_account_by_id(session, storage, &request.account_id)?;
            if account.network != request.network {
                return Err(WalletCommandError::unsupported_chain(
                    "account network mismatch",
                ));
            }
            let wallet = load_wallet(session, storage, &account.wallet_id)?;
            let now = now_ms();
            let (preview, preconditions, payload) = match request.network {
                WalletNetwork::Bitcoin => prepare_bitcoin(
                    session,
                    storage,
                    provider.as_ref(),
                    &account,
                    &request.outputs,
                    &request.fee_policy.tier,
                )?,
                WalletNetwork::Ethereum => prepare_ethereum(
                    provider.as_ref(),
                    &account,
                    &request.outputs,
                    &request.fee_policy.tier,
                )?,
            };
            let warning_codes = preview
                .warnings
                .iter()
                .map(|warning| warning.code.clone())
                .collect();
            let record = create_preparation(
                session,
                storage,
                PreparedTransactionInput {
                    wallet_id: wallet.wallet_id.clone(),
                    account_id: account.account_id.clone(),
                    network: request.network,
                    outputs: request.outputs.clone(),
                    fee_tier: request.fee_policy.tier.clone(),
                    canonical_payload: payload,
                    warning_codes,
                    preconditions,
                    preview: preview.clone(),
                    now,
                },
            )?;
            Ok(WalletTransactionPrepareResponse {
                preparation_id: record.preparation_id,
                wallet_id: wallet.wallet_id,
                account_id: account.account_id,
                network: request.network,
                preview,
                expires_at: record.expires_at,
            })
        })
    }

    pub(in crate::rpc::router) fn handle_wallet_transaction_confirm(
        &mut self,
        data: &Value,
    ) -> RpcResponse {
        if let Some(response) = self.wallet_preflight(true) {
            return response;
        }
        let provider = match self.wallet_provider.clone() {
            Some(provider) => provider,
            None => return provider_unavailable().into_rpc_response(),
        };
        let request = match parse::<WalletTransactionConfirmRequest>(data) {
            Ok(request) => request,
            Err(error) => return error.into_rpc_response(),
        };
        self.with_wallet_session_cleaned_after_preflight(|session, storage| {
            let record = load_active_preparation(session, storage, &request.preparation_id)?;
            let mut accepted = request.accepted_warnings.clone();
            let mut expected = record.warning_codes.clone();
            accepted.sort();
            expected.sort();
            if accepted != expected {
                return Err(WalletCommandError::preparation_stale(
                    "Preparation warnings changed",
                ));
            }
            let account = load_account_by_id(session, storage, &record.account_id)?;
            revalidate_preconditions(provider.as_ref(), &account, &record)?;
            let secret = load_secret(session, storage, &record.payload_ref)?;
            let canonical_payload = match secret.payload {
                SecretPayloadV1::PreparedPayload { canonical_payload } => canonical_payload,
                _ => return Err(WalletCommandError::internal("Invalid preparation payload")),
            };
            let signed_payload = hash_hex(&[
                b"signed-wallet-payload-v1",
                canonical_payload.as_bytes(),
                record.preparation_id.as_bytes(),
            ]);
            let tx_hash = hash_hex(&[
                b"tx-hash-v1",
                record.network.as_str().as_bytes(),
                signed_payload.as_bytes(),
            ]);
            let outcome = match record.network {
                WalletNetwork::Bitcoin => provider
                    .bitcoin_broadcast(&tx_hash, &signed_payload)
                    .map_err(provider_error)?,
                WalletNetwork::Ethereum => provider
                    .ethereum_broadcast(&tx_hash, &signed_payload)
                    .map_err(provider_error)?,
            };
            let status = match outcome {
                WalletBroadcastOutcome::Accepted => "pending".to_string(),
                WalletBroadcastOutcome::Unknown => "broadcast_unknown".to_string(),
                WalletBroadcastOutcome::Rejected(message) => {
                    return Err(WalletCommandError::broadcast_rejected(message))
                }
            };
            let tx_ref = new_tx_ref();
            let now = now_ms();
            let amount = sum_outputs(&record.canonical_intent.outputs)?.to_string();
            let entry = WalletTransactionEntry {
                tx_ref: tx_ref.clone(),
                wallet_id: record.wallet_id.clone(),
                account_id: record.account_id.clone(),
                network: record.network,
                status: status.clone(),
                tx_hash: tx_hash.clone(),
                amount_unit: record.network.amount_unit().to_string(),
                amount,
                fee: record.preview.estimated_fee.clone(),
                created_at: now,
                updated_at: now,
            };
            let mut uow = begin_wallet_uow(session, storage, "wallet-transaction-confirm");
            write_json(
                &mut uow,
                &tx_path(&tx_ref),
                &format!("{tx_ref}.json"),
                &entry,
                JSON_MIME,
            )?;
            stage_complete_preparation(&mut uow, &record)?;
            commit_wallet_uow(uow, session)?;
            Ok(WalletTransactionConfirmResponse {
                tx_ref,
                network: record.network,
                status,
                tx_hash,
            })
        })
    }

    pub(in crate::rpc::router) fn handle_wallet_transaction_cancel(
        &mut self,
        data: &Value,
    ) -> RpcResponse {
        let request = match parse::<WalletTransactionCancelRequest>(data) {
            Ok(request) => request,
            Err(error) => return error.into_rpc_response(),
        };
        self.with_wallet_session_cleaned(false, |session, storage| {
            cancel_preparation(session, storage, &request.preparation_id)?;
            Ok(WalletTransactionCancelResponse { cancelled: true })
        })
    }

    pub(in crate::rpc::router) fn handle_wallet_transactions_list(
        &mut self,
        data: &Value,
    ) -> RpcResponse {
        let request = match parse::<WalletTransactionsListRequest>(data) {
            Ok(request) => request,
            Err(error) => return error.into_rpc_response(),
        };
        self.with_wallet_session_cleaned(false, |session, storage| {
            let mut transactions = load_transactions(session, storage)?;
            if let Some(wallet_id) = request.wallet_id.as_deref() {
                transactions.retain(|entry| entry.wallet_id == wallet_id);
            }
            if let Some(status) = request.status.as_deref() {
                transactions.retain(|entry| entry.status == status);
            }
            transactions.sort_by(|a, b| b.created_at.cmp(&a.created_at));
            if let Some(limit) = request.limit {
                transactions.truncate(limit as usize);
            }
            Ok(WalletTransactionsListResponse { transactions })
        })
    }

    pub(in crate::rpc::router) fn handle_wallet_transactions_refresh(
        &mut self,
        data: &Value,
    ) -> RpcResponse {
        if let Some(response) = self.wallet_preflight(false) {
            return response;
        }
        let provider = match self.wallet_provider.clone() {
            Some(provider) => provider,
            None => return provider_unavailable().into_rpc_response(),
        };
        let request = match parse::<WalletTransactionsRefreshRequest>(data) {
            Ok(request) => request,
            Err(error) => return error.into_rpc_response(),
        };
        self.with_wallet_session_cleaned_after_preflight(|session, storage| {
            let mut entry = load_transaction(session, storage, &request.tx_ref)?;
            let status = match entry.network {
                WalletNetwork::Bitcoin => provider
                    .bitcoin_transaction_status(&entry.tx_hash)
                    .map_err(provider_error)?,
                WalletNetwork::Ethereum => provider
                    .ethereum_transaction_status(&entry.tx_hash)
                    .map_err(provider_error)?,
            };
            entry.status = status.as_str().to_string();
            entry.updated_at = now_ms();
            let mut uow = begin_wallet_uow(session, storage, "wallet-transactions-refresh");
            write_json(
                &mut uow,
                &tx_path(&entry.tx_ref),
                &format!("{}.json", entry.tx_ref),
                &entry,
                JSON_MIME,
            )?;
            commit_wallet_uow(uow, session)?;
            Ok(WalletTransactionsRefreshResponse {
                tx_ref: entry.tx_ref,
                network: entry.network,
                status: entry.status,
                tx_hash: entry.tx_hash,
                updated_at: entry.updated_at,
            })
        })
    }
}
