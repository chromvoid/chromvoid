use super::secrets::ensure_english_wordlist;
use super::*;

impl RpcRouter {
    pub(in crate::rpc::router) fn handle_wallet_transaction_quote(
        &mut self,
        data: &Value,
    ) -> RpcResponse {
        const QUOTE_TTL_MS: u64 = 30_000;

        if let Some(response) = self.wallet_preflight() {
            return response;
        }
        if let Some(error) = ton_prepare_boundary_error(data) {
            return error.into_rpc_response();
        }
        if has_disallowed_fee_policy_fields(data) {
            return invalid_input("fee_policy accepts only tier").into_rpc_response();
        }
        let request = match parse::<WalletTransactionQuoteRequest>(data) {
            Ok(request) => request,
            Err(error) => return error.into_rpc_response(),
        };
        if request.outputs.is_empty() {
            return invalid_input("outputs are required").into_rpc_response();
        }
        let max_output_index = request.max_output_index as usize;
        if max_output_index >= request.outputs.len() {
            return invalid_input("max output index is out of range").into_rpc_response();
        }
        if request.outputs.iter().enumerate().any(|(index, output)| {
            output.address.trim().is_empty()
                || (index != max_output_index && output.amount.is_none())
        }) {
            return invalid_input("quote outputs require addresses and non-target amounts")
                .into_rpc_response();
        }
        let profile = match self
            .wallet_chain_registry
            .enabled_profile(&request.network, &self.wallet_runtime_config)
        {
            Ok(profile) => profile,
            Err(error) => return WalletCommandError::from(error).into_rpc_response(),
        };

        self.with_wallet_read_session_after_preflight(|session, storage| {
            let account = load_account_by_id(session, storage, &request.account_id)?;
            if account.network() != &request.network {
                return Err(WalletCommandError::unsupported_chain(
                    "account network mismatch",
                ));
            }
            if has_unresolved_broadcast(session, storage, account.account_id())? {
                return Err(WalletCommandError::broadcast_unknown(
                    "Account has an unresolved broadcast outcome",
                ));
            }
            let wallet = load_wallet(session, storage, account.wallet_id())?;
            let secret = load_secret(session, storage, &wallet.secret_ref)?.payload;
            ensure_english_wordlist(&secret)?;
            let wallet_accounts = load_accounts(session, storage, Some(account.wallet_id()))?;
            let mut allocated_addresses = Vec::new();
            for wallet_account in &wallet_accounts {
                if wallet_account.network() == account.network() {
                    allocated_addresses.extend(load_account_addresses(
                        session,
                        storage,
                        wallet_account.wallet_id(),
                        wallet_account.account_id(),
                    )?);
                }
            }
            let now = now_ms();
            let live_preparations =
                load_live_preparations(session, storage, &wallet.wallet_id, &request.network, now)?;
            let outputs = request
                .outputs
                .iter()
                .map(|output| crate::rpc::types::WalletTransactionOutput {
                    address: output.address.trim().to_string(),
                    amount: output.amount.clone().unwrap_or_else(|| "1".to_string()),
                    comment: output.comment.clone(),
                })
                .collect::<Vec<_>>();
            let max = profile
                .prepare(crate::wallet::WalletPrepareInput {
                    account: account.clone(),
                    wallet_accounts: wallet_accounts.clone(),
                    allocated_addresses: allocated_addresses.clone(),
                    live_preparations: live_preparations.clone(),
                    secret: Some(secret.clone()),
                    outputs: outputs.clone(),
                    fee_tier: request.fee_policy.tier.clone(),
                    maximize_output_index: Some(max_output_index),
                    now,
                })
                .map_err(WalletCommandError::from)?;
            let current_preview = if request.outputs.iter().all(|output| output.amount.is_some()) {
                validate_outputs(&outputs)?;
                match profile.prepare(crate::wallet::WalletPrepareInput {
                    account: account.clone(),
                    wallet_accounts,
                    allocated_addresses,
                    live_preparations,
                    secret: Some(secret),
                    outputs,
                    fee_tier: request.fee_policy.tier,
                    maximize_output_index: None,
                    now,
                }) {
                    Ok(current) => Some(current.preview),
                    Err(error)
                        if error.code == crate::wallet::WalletChainErrorCode::InsufficientFunds =>
                    {
                        None
                    }
                    Err(error) => return Err(WalletCommandError::from(error)),
                }
            } else {
                None
            };
            let max_amount = max.preview.outputs[max_output_index].amount.clone();
            let spendable = max.preview.total_debit.clone();
            Ok(WalletTransactionQuoteResponse {
                account_id: account.account_id().to_string(),
                network: request.network,
                spendable,
                current_preview,
                max_preview: max.preview,
                max_amount,
                quoted_at: now,
                expires_at: now.saturating_add(QUOTE_TTL_MS),
            })
        })
    }

    pub(in crate::rpc::router) fn handle_wallet_transaction_prepare(
        &mut self,
        data: &Value,
    ) -> RpcResponse {
        if let Some(response) = self.wallet_preflight() {
            return response;
        }
        if let Some(error) = ton_prepare_boundary_error(data) {
            return error.into_rpc_response();
        }
        if has_disallowed_prepare_fields(data) {
            return invalid_input("wallet:transaction:prepare accepts only high-level v1 intent")
                .into_rpc_response();
        }
        if has_disallowed_fee_policy_fields(data) {
            return invalid_input("fee_policy accepts only tier").into_rpc_response();
        }
        let request = match parse::<WalletTransactionPrepareRequest>(data) {
            Ok(request) => request,
            Err(error) => return error.into_rpc_response(),
        };
        if request.outputs.is_empty() {
            return invalid_input("outputs are required").into_rpc_response();
        }
        if request
            .maximize_output_index
            .is_some_and(|index| index as usize >= request.outputs.len())
        {
            return invalid_input("max output index is out of range").into_rpc_response();
        }
        if let Err(error) = validate_outputs(&request.outputs) {
            return error.into_rpc_response();
        }
        let profile = match self
            .wallet_chain_registry
            .enabled_profile(&request.network, &self.wallet_runtime_config)
        {
            Ok(profile) => profile,
            Err(error) => return WalletCommandError::from(error).into_rpc_response(),
        };

        self.with_wallet_session_cleaned_after_preflight(|session, storage| {
            cleanup_expired_preparations(session, storage)?;
            let account = load_account_by_id(session, storage, &request.account_id)?;
            if account.network() != &request.network {
                return Err(WalletCommandError::unsupported_chain(
                    "account network mismatch",
                ));
            }
            if has_unresolved_broadcast(session, storage, account.account_id())? {
                return Err(WalletCommandError::broadcast_unknown(
                    "Account has an unresolved broadcast outcome",
                ));
            }
            let wallet = load_wallet(session, storage, account.wallet_id())?;
            let secret = load_secret(session, storage, &wallet.secret_ref)?;
            ensure_english_wordlist(&secret.payload)?;
            let wallet_accounts = load_accounts(session, storage, Some(account.wallet_id()))?;
            let mut allocated_addresses = Vec::new();
            for wallet_account in &wallet_accounts {
                if wallet_account.network() == account.network() {
                    allocated_addresses.extend(load_account_addresses(
                        session,
                        storage,
                        wallet_account.wallet_id(),
                        wallet_account.account_id(),
                    )?);
                }
            }
            let now = now_ms();
            let live_preparations =
                load_live_preparations(session, storage, &wallet.wallet_id, &request.network, now)?;
            let prepared = profile
                .prepare(crate::wallet::WalletPrepareInput {
                    account: account.clone(),
                    wallet_accounts,
                    allocated_addresses,
                    live_preparations,
                    secret: Some(secret.payload),
                    outputs: request.outputs.clone(),
                    fee_tier: request.fee_policy.tier.clone(),
                    maximize_output_index: request
                        .maximize_output_index
                        .map(|index| index as usize),
                    now,
                })
                .map_err(WalletCommandError::from)?;
            let warning_codes = prepared
                .preview
                .warnings
                .iter()
                .map(|warning| warning.code.clone())
                .collect();
            let record = create_preparation(
                session,
                storage,
                PreparedTransactionInput {
                    wallet_id: wallet.wallet_id.clone(),
                    account_id: account.account_id().to_string(),
                    network: request.network.clone(),
                    outputs: request.outputs.clone(),
                    fee_tier: request.fee_policy.tier.clone(),
                    canonical_payload: prepared.canonical_payload,
                    warning_codes,
                    provider_snapshot: prepared.provider_snapshot,
                    preview: prepared.preview.clone(),
                    materializations: prepared.materializations,
                    valid_until: prepared.valid_until,
                    now,
                },
            )?;
            Ok(WalletTransactionPrepareResponse {
                preparation_id: record.preparation_id,
                wallet_id: wallet.wallet_id,
                account_id: account.account_id().to_string(),
                network: request.network,
                preview: prepared.preview,
                expires_at: record.expires_at,
            })
        })
    }

    pub(in crate::rpc::router) fn handle_wallet_transaction_confirm(
        &mut self,
        data: &Value,
    ) -> RpcResponse {
        if let Some(response) = self.wallet_preflight() {
            return response;
        }
        let request = match parse::<WalletTransactionConfirmRequest>(data) {
            Ok(request) => request,
            Err(error) => return error.into_rpc_response(),
        };
        let registry = self.wallet_chain_registry.clone();
        let config = self.wallet_runtime_config.clone();
        let storage = self.storage.clone();

        let loaded = {
            let Some(session) = self.session.as_mut() else {
                return RpcResponse::error("Vault not unlocked", Some(ErrorCode::VaultRequired));
            };
            if let Err(error) = cleanup_expired_preparations(session, &storage) {
                return error.into_rpc_response();
            }
            let record =
                match load_confirmable_preparation(session, &storage, &request.preparation_id) {
                    Ok(record) => record,
                    Err(error) => return error.into_rpc_response(),
                };
            if let Some(tx_ref) = record.tx_ref.as_deref() {
                let entry = match load_transaction(session, &storage, tx_ref) {
                    Ok(entry) => entry,
                    Err(error) => return error.into_rpc_response(),
                };
                let status = confirm_status_from_entry(&entry);
                return RpcResponse::success(WalletTransactionConfirmResponse {
                    tx_ref: entry.tx_ref,
                    network: entry.network,
                    status,
                    tx_hash: entry.tx_hash,
                });
            } else {
                if record.state != PreparationStateV1::Ready {
                    return WalletCommandError::preparation_stale("Preparation is no longer ready")
                        .into_rpc_response();
                }
                let mut accepted = request.accepted_warnings.clone();
                let mut expected = record.warning_codes.clone();
                accepted.sort();
                expected.sort();
                if accepted != expected {
                    return WalletCommandError::preparation_stale("Preparation warnings changed")
                        .into_rpc_response();
                }
                let account = match load_account_by_id(session, &storage, &record.account_id) {
                    Ok(account) => account,
                    Err(error) => return error.into_rpc_response(),
                };
                let wallet = match load_wallet(session, &storage, account.wallet_id()) {
                    Ok(wallet) => wallet,
                    Err(error) => return error.into_rpc_response(),
                };
                let profile = match registry
                    .enabled_profile(&record.network, &config)
                    .map_err(WalletCommandError::from)
                {
                    Ok(profile) => profile,
                    Err(error) => return error.into_rpc_response(),
                };
                WalletConfirmLoaded::Ready {
                    record,
                    account,
                    wallet,
                    profile,
                }
            }
        };

        let WalletConfirmLoaded::Ready {
            record,
            account,
            wallet,
            profile,
        } = loaded;
        if let Err(error) = self.verify_wallet_confirm_authorization(
            &request,
            &wallet.wallet_id,
            account.account_id(),
            &record.network,
        ) {
            return error.into_rpc_response();
        }

        let signed = {
            let Some(session) = self.session.as_mut() else {
                return RpcResponse::error("Vault not unlocked", Some(ErrorCode::VaultRequired));
            };
            let secret = match load_secret(session, &storage, &record.payload_ref) {
                Ok(secret) => secret,
                Err(error) => return error.into_rpc_response(),
            };
            let canonical_payload = match secret.payload {
                SecretPayloadV1::PreparedPayload { canonical_payload } => canonical_payload,
                _ => {
                    return WalletCommandError::internal("Invalid preparation payload")
                        .into_rpc_response()
                }
            };
            let signing_secret_blob = match load_secret(session, &storage, &wallet.secret_ref) {
                Ok(secret) => secret,
                Err(error) => return error.into_rpc_response(),
            };
            if let Err(error) = ensure_english_wordlist(&signing_secret_blob.payload) {
                return error.into_rpc_response();
            }
            let signing_secret = match super::secrets::reconcile_wallet_secret(
                session,
                &storage,
                &profile,
                &account,
                signing_secret_blob,
            ) {
                Ok(secret) => secret,
                Err(error) => return error.into_rpc_response(),
            };
            match profile.sign_prepared(crate::wallet::WalletSignInput {
                account: account.clone(),
                preparation_id: record.preparation_id.clone(),
                canonical_payload: zeroize::Zeroizing::new(canonical_payload),
                provider_snapshot: record.provider_snapshot.clone(),
                signing_secret,
            }) {
                Ok(signed) => signed,
                Err(error) => return WalletCommandError::from(error).into_rpc_response(),
            }
        };

        let tx_ref = new_tx_ref();
        let confirm_attempt_id = new_preparation_id();
        let artifact_secret_id = new_secret_id();
        let now = now_ms();
        let amount = match sum_outputs(&record.canonical_intent.outputs) {
            Ok(amount) => amount.to_string(),
            Err(error) => return error.into_rpc_response(),
        };
        let entry = WalletTransactionEntry {
            tx_ref: tx_ref.clone(),
            wallet_id: record.wallet_id.clone(),
            account_id: record.account_id.clone(),
            network: record.network.clone(),
            status: WalletTxStatus::Broadcasting.as_str().to_string(),
            tx_hash: signed.tx_hash.clone(),
            message_ref: signed.message_ref.clone(),
            broadcast_artifact_ref: Some(tx_ref.clone()),
            amount_unit: profile.amount_unit().to_string(),
            amount,
            fee: record.preview.estimated_fee.clone(),
            direction: Some(crate::rpc::types::WalletTransactionDirection::Outgoing),
            counterparty: record
                .canonical_intent
                .outputs
                .first()
                .map(|output| output.address.clone()),
            valid_until: record.preview.ton.as_ref().map(|ton| ton.valid_until),
            created_at: now,
            updated_at: now,
        };
        let artifact = BroadcastArtifactV2 {
            tx_ref: tx_ref.clone(),
            wallet_id: record.wallet_id.clone(),
            account_id: record.account_id.clone(),
            network: record.network.clone(),
            artifact_ref: artifact_secret_id.clone(),
            artifact_digest: hash_hex(&[signed.signed_artifact.as_bytes()]),
            tx_hash: signed.tx_hash.clone(),
            message_ref: signed.message_ref.clone(),
            submit_attempts: Vec::new(),
            expires_at: ton_valid_until_ms(&record).unwrap_or(record.expires_at),
            created_at: now,
        };
        {
            let Some(session) = self.session.as_mut() else {
                return RpcResponse::error("Vault not unlocked", Some(ErrorCode::VaultRequired));
            };
            let result = (|| -> WalletResult<()> {
                let mut uow = begin_wallet_uow(session, &storage, "wallet-transaction-confirm");
                let artifact_secret = SecretBlobV1 {
                    secret_id: artifact_secret_id.clone(),
                    kind: "broadcast_artifact".to_string(),
                    payload_version: 2,
                    payload: SecretPayloadV1::BroadcastArtifact {
                        signed_artifact: signed.signed_artifact.to_string(),
                        tx_hash: signed.tx_hash.clone(),
                        message_ref: signed.message_ref.clone(),
                        submit_metadata: signed.submit_metadata.clone(),
                    },
                };
                write_json(
                    &mut uow,
                    &secret_path(&artifact_secret_id),
                    &secret_filename(&artifact_secret_id),
                    &artifact_secret,
                    SECRET_MIME,
                )?;
                write_json(
                    &mut uow,
                    &broadcast_artifact_path(&tx_ref),
                    &format!("{tx_ref}.json"),
                    &artifact,
                    JSON_MIME,
                )?;
                write_json(
                    &mut uow,
                    &tx_path(&tx_ref),
                    &format!("{tx_ref}.json"),
                    &entry,
                    JSON_MIME,
                )?;
                stage_mark_preparation_in_flight(
                    &mut uow,
                    &record,
                    &tx_ref,
                    &confirm_attempt_id,
                    now,
                )?;
                stage_supersede_ready_sibling_preparations(
                    &mut uow, session, &storage, &record, &tx_ref, now,
                )?;
                commit_wallet_uow(uow, session)
            })();
            if let Err(error) = result {
                return error.into_rpc_response();
            }
        }

        result_response(submit_signed_and_persist(
            {
                let Some(session) = self.session.as_mut() else {
                    return RpcResponse::error(
                        "Vault not unlocked",
                        Some(ErrorCode::VaultRequired),
                    );
                };
                session
            },
            &storage,
            profile.as_ref(),
            account,
            &record,
            entry,
            signed,
            true,
        ))
    }

    pub(in crate::rpc::router) fn handle_wallet_transaction_cancel(
        &mut self,
        data: &Value,
    ) -> RpcResponse {
        if let Some(response) = self.wallet_preflight() {
            return response;
        }
        let request = match parse::<WalletTransactionCancelRequest>(data) {
            Ok(request) => request,
            Err(error) => return error.into_rpc_response(),
        };
        self.with_wallet_session_cleaned(|session, storage| {
            cancel_preparation(session, storage, &request.preparation_id)?;
            Ok(WalletTransactionCancelResponse { cancelled: true })
        })
    }

    pub(in crate::rpc::router) fn handle_wallet_transaction_rebroadcast(
        &mut self,
        data: &Value,
    ) -> RpcResponse {
        if let Some(response) = self.wallet_preflight() {
            return response;
        }
        let request = match parse::<WalletTransactionRebroadcastRequest>(data) {
            Ok(request) => request,
            Err(error) => return error.into_rpc_response(),
        };
        if request.master_password.is_empty() {
            return invalid_input("master_password required").into_rpc_response();
        }
        if let Err(error) = self.verify_wallet_rebroadcast_master_password(&request.master_password)
        {
            return error.into_rpc_response();
        }
        let registry = self.wallet_chain_registry.clone();
        let config = self.wallet_runtime_config.clone();
        self.with_wallet_session_cleaned_after_preflight(|session, storage| {
            let entry = load_transaction(session, storage, &request.tx_ref)?;
            if entry.status != WalletTxStatus::Broadcasting.as_str()
                && entry.status != WalletTxStatus::BroadcastUnknown.as_str()
            {
                return Err(WalletCommandError::invalid_input(
                    "transaction is not eligible for exact rebroadcast",
                ));
            }
            let artifact_ref = entry
                .broadcast_artifact_ref
                .as_deref()
                .unwrap_or(entry.tx_ref.as_str());
            let artifact = load_broadcast_artifact(session, storage, artifact_ref)?;
            if artifact.tx_ref != entry.tx_ref || artifact.expires_at <= now_ms() {
                return Err(WalletCommandError::broadcast_unknown(
                    "broadcast artifact is unavailable or expired",
                ));
            }
            let signed = load_signed_broadcast_artifact_from_record(session, storage, artifact)?;
            let record = load_preparation_by_tx_ref(session, storage, &entry.tx_ref)?;
            let account = load_account_by_id(session, storage, &entry.account_id)?;
            let profile = registry
                .enabled_profile(&entry.network, &config)
                .map_err(WalletCommandError::from)?;
            submit_signed_and_persist(
                session,
                storage,
                profile.as_ref(),
                account,
                &record,
                entry.clone(),
                signed,
                false,
            )?;
            let updated = load_transaction(session, storage, &entry.tx_ref)?;
            Ok(WalletTransactionRebroadcastResponse {
                tx_ref: updated.tx_ref,
                network: updated.network,
                status: updated.status,
                tx_hash: updated.tx_hash,
                updated_at: updated.updated_at,
            })
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
        self.with_wallet_read_session_cleaned(|session, storage| {
            let mut transactions = load_transactions(session, storage)?;
            if let Some(wallet_id) = request.wallet_id.as_deref() {
                transactions.retain(|entry| entry.wallet_id == wallet_id);
            }
            if let Some(account_id) = request.account_id.as_deref() {
                if let Some(wallet_id) = request.wallet_id.as_deref() {
                    let account = load_account_by_id(session, storage, account_id)?;
                    if account.wallet_id() != wallet_id {
                        return Err(WalletCommandError::invalid_input(
                            "account_id does not belong to wallet_id",
                        ));
                    }
                }
                transactions.retain(|entry| entry.account_id == account_id);
            }
            if let Some(status) = request.status.as_deref() {
                transactions.retain(|entry| entry.status == status);
            }
            transactions.sort_by(|a, b| {
                b.created_at
                    .cmp(&a.created_at)
                    .then_with(|| b.tx_ref.cmp(&a.tx_ref))
            });
            if let Some(cursor) = request.cursor.as_deref() {
                let (cursor_created_at, cursor_tx_ref) = parse_tx_list_cursor(cursor)?;
                transactions.retain(|entry| {
                    entry.created_at < cursor_created_at
                        || (entry.created_at == cursor_created_at
                            && entry.tx_ref.as_str() < cursor_tx_ref.as_str())
                });
            }
            let limit = request.limit.unwrap_or(50).min(200);
            let next_cursor = if limit > 0 && transactions.len() > limit as usize {
                transactions.get(limit as usize - 1).map(tx_list_cursor)
            } else {
                None
            };
            transactions.truncate(limit as usize);
            Ok(WalletTransactionsListResponse {
                transactions,
                next_cursor,
            })
        })
    }

    pub(in crate::rpc::router) fn handle_wallet_transactions_refresh(
        &mut self,
        data: &Value,
    ) -> RpcResponse {
        if let Some(response) = self.wallet_preflight() {
            return response;
        }
        let request = match parse::<WalletTransactionsRefreshRequest>(data) {
            Ok(request) => request,
            Err(error) => return error.into_rpc_response(),
        };
        let registry = self.wallet_chain_registry.clone();
        let config = self.wallet_runtime_config.clone();
        self.with_wallet_session_cleaned_after_preflight(|session, storage| {
            let mut entry = load_transaction(session, storage, &request.tx_ref)?;
            let account = load_account_by_id(session, storage, &entry.account_id)?;
            let profile = registry
                .enabled_profile(&entry.network, &config)
                .map_err(WalletCommandError::from)?;
            let submit_metadata = entry.broadcast_artifact_ref.as_deref().and_then(|tx_ref| {
                load_broadcast_artifact_submit_metadata(session, storage, tx_ref)
            });
            let output = profile
                .refresh(crate::wallet::WalletRefreshInput {
                    account,
                    transaction: entry.clone(),
                    submit_metadata,
                    now: now_ms(),
                })
                .map_err(WalletCommandError::from)?;
            let evidence = merge_reconciliation_evidence(
                load_reconciliation_evidence(session, storage, &entry.tx_ref)?,
                &entry.tx_ref,
                output.observations,
            );
            entry.status = reduce_reconciliation_status(&entry.status, &evidence.observations)
                .as_str()
                .to_string();
            if output.tx_hash.is_some() {
                entry.tx_hash = output.tx_hash;
            }
            entry.updated_at = now_ms();
            let mut uow = begin_wallet_uow(session, storage, "wallet-transactions-refresh");
            write_json(
                &mut uow,
                &tx_path(&entry.tx_ref),
                &format!("{}.json", entry.tx_ref),
                &entry,
                JSON_MIME,
            )?;
            save_reconciliation_evidence(&mut uow, &evidence)?;
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

fn merge_reconciliation_evidence(
    existing: Option<WalletReconciliationEvidenceV1>,
    tx_ref: &str,
    observations: Vec<WalletProviderObservationV1>,
) -> WalletReconciliationEvidenceV1 {
    let mut merged = existing
        .map(|evidence| evidence.observations)
        .unwrap_or_default();
    for observation in observations {
        merged.retain(|current| {
            current.source_id != observation.source_id
                || current.independence_group != observation.independence_group
        });
        merged.push(observation);
    }
    merged.sort_by(|left, right| {
        left.independence_group
            .cmp(&right.independence_group)
            .then_with(|| left.source_id.cmp(&right.source_id))
    });
    WalletReconciliationEvidenceV1 {
        tx_ref: tx_ref.to_string(),
        observations: merged,
        evaluated_at: now_ms(),
    }
}

fn reduce_reconciliation_status(
    current_status: &str,
    observations: &[WalletProviderObservationV1],
) -> WalletTxStatus {
    if observations
        .iter()
        .any(|observation| observation.outcome == WalletProviderObservationOutcomeV1::Confirmed)
    {
        return WalletTxStatus::Confirmed;
    }
    if observations
        .iter()
        .any(|observation| observation.outcome == WalletProviderObservationOutcomeV1::Failed)
    {
        return WalletTxStatus::Failed;
    }
    if observations
        .iter()
        .any(|observation| observation.outcome == WalletProviderObservationOutcomeV1::Pending)
    {
        return WalletTxStatus::Pending;
    }
    let negative_groups = observations
        .iter()
        .filter(|observation| observation.outcome == WalletProviderObservationOutcomeV1::NotFound)
        .map(|observation| observation.independence_group.as_str())
        .collect::<std::collections::BTreeSet<_>>();
    if negative_groups.len() >= 2 {
        return WalletTxStatus::Failed;
    }
    match current_status {
        "confirmed" => WalletTxStatus::Confirmed,
        "failed" => WalletTxStatus::Failed,
        "pending" => WalletTxStatus::Pending,
        _ => WalletTxStatus::BroadcastUnknown,
    }
}

enum WalletConfirmLoaded {
    Ready {
        record: PreparationRecordV1,
        account: WalletAccountMeta,
        wallet: WalletMetaV1,
        profile: std::sync::Arc<dyn crate::wallet::WalletChainProfile>,
    },
}

fn has_unresolved_broadcast(
    session: &VaultSession,
    storage: &Storage,
    account_id: &str,
) -> WalletResult<bool> {
    let transactions = load_transactions(session, storage)?;
    Ok(transactions.iter().any(|entry| {
        entry.account_id == account_id
            && (entry.status == WalletTxStatus::Broadcasting.as_str()
                || entry.status == WalletConfirmStatus::BroadcastUnknown.as_str())
    }))
}

fn confirm_status_from_entry(entry: &WalletTransactionEntry) -> WalletConfirmStatus {
    if entry.status == WalletConfirmStatus::BroadcastUnknown.as_str()
        || entry.status == WalletTxStatus::Broadcasting.as_str()
    {
        WalletConfirmStatus::BroadcastUnknown
    } else {
        WalletConfirmStatus::Pending
    }
}

fn tx_list_cursor(entry: &WalletTransactionEntry) -> String {
    format!("{}:{}", entry.created_at, entry.tx_ref)
}

fn parse_tx_list_cursor(cursor: &str) -> WalletResult<(u64, String)> {
    let Some((created_at, tx_ref)) = cursor.split_once(':') else {
        return Err(WalletCommandError::invalid_input(
            "invalid transactions cursor",
        ));
    };
    if tx_ref.is_empty() {
        return Err(WalletCommandError::invalid_input(
            "invalid transactions cursor",
        ));
    }
    let created_at = created_at
        .parse::<u64>()
        .map_err(|_| WalletCommandError::invalid_input("invalid transactions cursor"))?;
    Ok((created_at, tx_ref.to_string()))
}

/// Chain-specific submit metadata (e.g. the Solana blockhash validity window) recorded with the
/// write-ahead broadcast artifact. Absent for artifacts written without metadata.
fn load_broadcast_artifact_submit_metadata(
    session: &VaultSession,
    storage: &Storage,
    tx_ref: &str,
) -> Option<Value> {
    let artifact = load_broadcast_artifact(session, storage, tx_ref).ok()?;
    match load_secret(session, storage, &artifact.artifact_ref)
        .ok()?
        .payload
    {
        SecretPayloadV1::BroadcastArtifact {
            submit_metadata, ..
        } => submit_metadata,
        _ => None,
    }
}

fn ton_valid_until_ms(record: &PreparationRecordV1) -> Option<u64> {
    record
        .preview
        .ton
        .as_ref()
        .map(|ton| u64::from(ton.valid_until).saturating_mul(1000))
}

fn submit_signed_and_persist(
    session: &mut VaultSession,
    storage: &Storage,
    profile: &dyn crate::wallet::WalletChainProfile,
    account: WalletAccountMeta,
    record: &PreparationRecordV1,
    entry: WalletTransactionEntry,
    signed: crate::wallet::WalletSignedArtifact,
    allow_rejection_terminal: bool,
) -> WalletResult<WalletTransactionConfirmResponse> {
    record_broadcast_submit_attempt(session, storage, &entry.tx_ref)?;
    match profile.submit_signed(crate::wallet::WalletSubmitInput {
        account,
        preparation_id: record.preparation_id.clone(),
        signed_artifact: signed,
    }) {
        Ok(outcome) => persist_submit_output(session, storage, record, entry, outcome),
        Err(error) => persist_submit_error(
            session,
            storage,
            record,
            entry,
            error,
            allow_rejection_terminal,
        ),
    }
}

fn record_broadcast_submit_attempt(
    session: &mut VaultSession,
    storage: &Storage,
    tx_ref: &str,
) -> WalletResult<()> {
    let mut artifact = load_broadcast_artifact(session, storage, tx_ref)?;
    artifact.submit_attempts.push(BroadcastSubmitAttemptV1 {
        attempted_at: now_ms(),
        outcome: "started".to_string(),
    });
    let mut uow = begin_wallet_uow(session, storage, "wallet-broadcast-submit-attempt");
    write_json(
        &mut uow,
        &broadcast_artifact_path(tx_ref),
        &format!("{tx_ref}.json"),
        &artifact,
        JSON_MIME,
    )?;
    commit_wallet_uow(uow, session)
}

fn persist_submit_output(
    session: &mut VaultSession,
    storage: &Storage,
    record: &PreparationRecordV1,
    mut entry: WalletTransactionEntry,
    outcome: crate::wallet::WalletSubmitOutput,
) -> WalletResult<WalletTransactionConfirmResponse> {
    entry.status = outcome.status.as_str().to_string();
    if outcome.tx_hash.is_some() {
        entry.tx_hash = outcome.tx_hash.clone();
    }
    if outcome.message_ref.is_some() {
        entry.message_ref = outcome.message_ref.clone();
    }
    entry.updated_at = now_ms();
    let mut uow = begin_wallet_uow(session, storage, "wallet-transaction-confirm-submit");
    write_json(
        &mut uow,
        &tx_path(&entry.tx_ref),
        &format!("{}.json", entry.tx_ref),
        &entry,
        JSON_MIME,
    )?;
    stage_mark_preparation_consumed(&mut uow, record, &entry.tx_ref, entry.updated_at)?;
    commit_wallet_uow(uow, session)?;
    Ok(WalletTransactionConfirmResponse {
        tx_ref: entry.tx_ref,
        network: record.network.clone(),
        status: outcome.status,
        tx_hash: entry.tx_hash,
    })
}

fn persist_submit_error(
    session: &mut VaultSession,
    storage: &Storage,
    record: &PreparationRecordV1,
    mut entry: WalletTransactionEntry,
    error: crate::wallet::WalletChainError,
    allow_rejection_terminal: bool,
) -> WalletResult<WalletTransactionConfirmResponse> {
    match error.code {
        crate::wallet::WalletChainErrorCode::ProviderUnavailable => {
            entry.status = WalletTxStatus::Broadcasting.as_str().to_string();
            entry.updated_at = now_ms();
            let mut uow =
                begin_wallet_uow(session, storage, "wallet-transaction-submit-unavailable");
            write_json(
                &mut uow,
                &tx_path(&entry.tx_ref),
                &format!("{}.json", entry.tx_ref),
                &entry,
                JSON_MIME,
            )?;
            commit_wallet_uow(uow, session)?;
            Err(WalletCommandError::from(error))
        }
        crate::wallet::WalletChainErrorCode::BroadcastUnknown => {
            let outcome = crate::wallet::WalletSubmitOutput {
                status: WalletConfirmStatus::BroadcastUnknown,
                tx_hash: entry.tx_hash.clone(),
                message_ref: entry.message_ref.clone(),
            };
            persist_submit_output(session, storage, record, entry, outcome)
        }
        crate::wallet::WalletChainErrorCode::BroadcastRejected => {
            if allow_rejection_terminal {
                mark_submit_failed(session, storage, record, entry)?;
                Err(WalletCommandError::from(error))
            } else {
                persist_submit_output(
                    session,
                    storage,
                    record,
                    entry,
                    crate::wallet::WalletSubmitOutput {
                        status: WalletConfirmStatus::BroadcastUnknown,
                        tx_hash: None,
                        message_ref: None,
                    },
                )
            }
        }
        _ => persist_submit_output(
            session,
            storage,
            record,
            entry,
            crate::wallet::WalletSubmitOutput {
                status: WalletConfirmStatus::BroadcastUnknown,
                tx_hash: None,
                message_ref: None,
            },
        ),
    }
}

fn mark_submit_failed(
    session: &mut VaultSession,
    storage: &Storage,
    record: &PreparationRecordV1,
    mut entry: WalletTransactionEntry,
) -> WalletResult<()> {
    entry.status = WalletTxStatus::Failed.as_str().to_string();
    entry.updated_at = now_ms();
    let mut uow = begin_wallet_uow(session, storage, "wallet-transaction-submit-failed");
    write_json(
        &mut uow,
        &tx_path(&entry.tx_ref),
        &format!("{}.json", entry.tx_ref),
        &entry,
        JSON_MIME,
    )?;
    stage_mark_preparation_consumed(&mut uow, record, &entry.tx_ref, entry.updated_at)?;
    commit_wallet_uow(uow, session)
}

#[cfg(test)]
fn mark_write_ahead_broadcast_unknown(
    session: &mut VaultSession,
    storage: &Storage,
    record: &PreparationRecordV1,
    mut entry: WalletTransactionEntry,
) -> WalletResult<WalletTransactionConfirmResponse> {
    entry.status = WalletConfirmStatus::BroadcastUnknown.as_str().to_string();
    entry.updated_at = now_ms();
    let mut uow = begin_wallet_uow(session, storage, "wallet-transaction-write-ahead-unknown");
    write_json(
        &mut uow,
        &tx_path(&entry.tx_ref),
        &format!("{}.json", entry.tx_ref),
        &entry,
        JSON_MIME,
    )?;
    stage_mark_preparation_consumed(&mut uow, record, &entry.tx_ref, entry.updated_at)?;
    commit_wallet_uow(uow, session)?;
    Ok(WalletTransactionConfirmResponse {
        tx_ref: entry.tx_ref,
        network: record.network.clone(),
        status: WalletConfirmStatus::BroadcastUnknown,
        tx_hash: entry.tx_hash,
    })
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use tempfile::TempDir;

    use super::*;
    use crate::crypto::keystore::InMemoryKeystore;
    use crate::rpc::router::wallet::preparations::load_preparation;
    use crate::rpc::types::{RpcRequest, WalletFeeTier, WalletPreview, WalletTransactionOutput};
    use crate::rpc::RpcRouter;
    use crate::storage::Storage;

    fn setup_router() -> (RpcRouter, Storage, TempDir) {
        let temp_dir = TempDir::new().expect("temp dir");
        let storage = Storage::new(temp_dir.path()).expect("storage");
        let keystore = Arc::new(InMemoryKeystore::new());
        let mut router = RpcRouter::new(storage.clone()).with_keystore(keystore);
        let response = router.handle(&RpcRequest::new(
            "vault:unlock",
            serde_json::json!({"password": "pw"}),
        ));
        assert!(response.is_ok(), "{response:?}");
        (router, storage, temp_dir)
    }

    fn fixture_record() -> PreparationRecordV1 {
        PreparationRecordV1 {
            preparation_id: "prep-fixture".to_string(),
            wallet_id: "wallet-fixture".to_string(),
            account_id: "account-fixture".to_string(),
            network: WalletNetwork::from("testchain"),
            canonical_intent: PreparedIntentV1 {
                outputs: vec![WalletTransactionOutput {
                    address: "recipient".to_string(),
                    amount: "1000".to_string(),
                    comment: None,
                }],
                fee_tier: WalletFeeTier::Standard,
            },
            payload_ref: "payload-fixture".to_string(),
            warning_codes: Vec::new(),
            provider_snapshot: None,
            preview: WalletPreview {
                amount_unit: "testunit".to_string(),
                outputs: Vec::new(),
                estimated_fee: "1".to_string(),
                total_debit: "1001".to_string(),
                warnings: Vec::new(),
                ton: None,
                ethereum: None,
                solana: None,
            },
            state: PreparationStateV1::InFlight,
            consumed_at: Some(1),
            confirm_attempt_id: Some("confirm-fixture".to_string()),
            tx_ref: Some("tx-fixture".to_string()),
            superseded_at: None,
            superseded_by_tx_ref: None,
            expires_at: now_ms() + PREPARATION_TTL_MS,
            created_at: 1,
        }
    }

    fn fixture_entry() -> WalletTransactionEntry {
        WalletTransactionEntry {
            tx_ref: "tx-fixture".to_string(),
            wallet_id: "wallet-fixture".to_string(),
            account_id: "account-fixture".to_string(),
            network: WalletNetwork::from("testchain"),
            status: WalletTxStatus::Broadcasting.as_str().to_string(),
            tx_hash: Some("tx-hash-fixture".to_string()),
            message_ref: None,
            broadcast_artifact_ref: Some("tx-fixture".to_string()),
            amount_unit: "testunit".to_string(),
            amount: "1000".to_string(),
            fee: "1".to_string(),
            direction: Some(crate::rpc::types::WalletTransactionDirection::Outgoing),
            counterparty: None,
            valid_until: None,
            created_at: 1,
            updated_at: 1,
        }
    }

    fn write_write_ahead_fixture(
        session: &mut VaultSession,
        storage: &Storage,
        record: &PreparationRecordV1,
        entry: &WalletTransactionEntry,
    ) {
        let mut uow = begin_wallet_uow(session, storage, "wallet-missing-artifact-fixture");
        ensure_wallet_dirs(&mut uow).expect("wallet dirs");
        write_json(
            &mut uow,
            &preparation_path(&record.preparation_id),
            &format!("{}.json", record.preparation_id),
            record,
            JSON_MIME,
        )
        .expect("preparation");
        write_json(
            &mut uow,
            &tx_path(&entry.tx_ref),
            &format!("{}.json", entry.tx_ref),
            entry,
            JSON_MIME,
        )
        .expect("transaction");
        commit_wallet_uow(uow, session).expect("commit");
    }

    #[test]
    fn missing_broadcast_artifact_marks_write_ahead_unknown_without_submit() {
        let (mut router, storage, _temp_dir) = setup_router();
        let session = router.session.as_mut().expect("session");
        let record = fixture_record();
        let entry = fixture_entry();
        write_write_ahead_fixture(session, &storage, &record, &entry);

        assert!(load_broadcast_artifact(session, &storage, "tx-fixture").is_err());
        let response = mark_write_ahead_broadcast_unknown(session, &storage, &record, entry)
            .expect("broadcast unknown response");

        assert_eq!(response.tx_ref, "tx-fixture");
        assert_eq!(response.status, WalletConfirmStatus::BroadcastUnknown);
        let tx = load_transaction(session, &storage, "tx-fixture").expect("tx");
        assert_eq!(tx.status, WalletConfirmStatus::BroadcastUnknown.as_str());
        let preparation = load_preparation(session, &storage, "prep-fixture").expect("prep");
        assert_eq!(preparation.state, PreparationStateV1::Consumed);
    }

    fn observation(
        group: &str,
        outcome: WalletProviderObservationOutcomeV1,
    ) -> WalletProviderObservationV1 {
        WalletProviderObservationV1 {
            source_id: format!("{group}:source"),
            independence_group: group.to_string(),
            observed_at: 1,
            outcome,
            block_ref: None,
            confirmations: None,
            reason: None,
        }
    }

    #[test]
    fn single_negative_observation_keeps_broadcast_unknown() {
        let status = reduce_reconciliation_status(
            WalletTxStatus::BroadcastUnknown.as_str(),
            &[observation(
                "provider-a",
                WalletProviderObservationOutcomeV1::NotFound,
            )],
        );
        assert_eq!(status, WalletTxStatus::BroadcastUnknown);
    }

    #[test]
    fn independent_negative_quorum_marks_failed() {
        let status = reduce_reconciliation_status(
            WalletTxStatus::BroadcastUnknown.as_str(),
            &[
                observation("provider-a", WalletProviderObservationOutcomeV1::NotFound),
                observation("provider-b", WalletProviderObservationOutcomeV1::NotFound),
            ],
        );
        assert_eq!(status, WalletTxStatus::Failed);
    }
}
