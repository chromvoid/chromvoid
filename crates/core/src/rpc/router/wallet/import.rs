use super::*;

impl RpcRouter {
    pub(in crate::rpc::router) fn handle_wallet_import_create(
        &mut self,
        data: &Value,
    ) -> RpcResponse {
        if let Some(response) = self.wallet_preflight() {
            return response;
        }
        let request = match parse::<WalletImportCreateRequest>(data) {
            Ok(request) => request,
            Err(error) => return error.into_rpc_response(),
        };
        if request.label.trim().is_empty()
            || request.private_key.trim().is_empty()
            || request.curve.trim().is_empty()
            || request.encoding.trim().is_empty()
        {
            return invalid_input("label, curve, encoding and private_key are required")
                .into_rpc_response();
        }
        let profile = match self
            .wallet_chain_registry
            .enabled_profile(&request.network, &self.wallet_runtime_config)
        {
            Ok(profile) => profile,
            Err(error) => return WalletCommandError::from(error).into_rpc_response(),
        };
        let canonical_request = WalletImportCreateRequest {
            label: request.label.trim().to_string(),
            network: request.network.clone(),
            curve: request.curve.clone(),
            private_key: request.private_key.clone(),
            encoding: request.encoding.clone(),
            client_request_id: None,
        };
        let idempotency_digest = match payload_digest(&canonical_request) {
            Ok(digest) => digest,
            Err(error) => return error.into_rpc_response(),
        };

        self.with_wallet_session_cleaned_after_preflight(|session, storage| {
            if let Some(client_request_id) = request.client_request_id.as_deref() {
                if let Some(record) = load_idempotency_record(session, storage, client_request_id)?
                {
                    if record.command != "wallet:import:create"
                        || record.payload_digest != idempotency_digest
                    {
                        return Err(WalletCommandError::invalid_input(
                            "client_request_id payload mismatch",
                        ));
                    }
                    return serde_json::from_value(record.result_ref).map_err(|error| {
                        WalletCommandError::internal(format!(
                            "wallet idempotency result parse failed: {error}"
                        ))
                    });
                }
            }
            let mut uow = begin_wallet_uow(session, storage, "wallet-import-create");
            ensure_wallet_dirs(&mut uow)?;
            let now = now_ms();
            let wallet_id = new_wallet_id();
            let account_id = new_account_id();
            let secret_id = new_secret_id();
            let secret = SecretBlobV1 {
                secret_id: secret_id.clone(),
                kind: "imported_key".to_string(),
                payload_version: 1,
                payload: SecretPayloadV1::ImportedKey {
                    network: request.network.clone(),
                    curve: request.curve.clone(),
                    private_key: request.private_key.clone(),
                    encoding: request.encoding.clone(),
                },
            };
            write_json(
                &mut uow,
                &secret_path(&secret_id),
                &secret_filename(&secret_id),
                &secret,
                SECRET_MIME,
            )?;

            let wallet = WalletMetaV1 {
                wallet_id: wallet_id.clone(),
                kind: "imported".to_string(),
                label: request.label.trim().to_string(),
                wallet_mode: "imported".to_string(),
                mnemonic_standard: "imported".to_string(),
                supported_networks: vec![request.network.clone()],
                bitcoin_discovery_pending: Some(false),
                account_discovery_pending: Vec::new(),
                secret_ref: secret_id,
                created_at: now,
                updated_at: now,
            };
            ensure_wallet_wallet_dirs(&mut uow, &wallet_id)?;
            write_json(
                &mut uow,
                &format!("{WALLET_ROOT}/wallets/{wallet_id}/meta.json"),
                "meta.json",
                &wallet,
                JSON_MIME,
            )?;

            let materialization = profile
                .materialize_imported_account(WalletImportedAccountMaterializeInput {
                    wallet_id: wallet_id.clone(),
                    account_id: account_id.clone(),
                    network: request.network.clone(),
                    label: request.label.trim().to_string(),
                    curve: request.curve.clone(),
                    private_key: request.private_key.clone(),
                    encoding: request.encoding.clone(),
                    now,
                })
                .map_err(WalletCommandError::from)?;
            let account = materialize_profile_account(&mut uow, materialization, &wallet)?;

            let mut index = load_index(session, storage)?;
            if !index.wallet_ids.contains(&wallet_id) {
                index.wallet_ids.push(wallet_id.clone());
            }
            index.updated_at = now;
            if index.created_at == 0 {
                index.created_at = now;
            }
            index.schema_version = WALLET_SCHEMA_VERSION;
            save_index(&mut uow, &index)?;
            let response = WalletImportCreateResponse {
                wallet_id,
                account_id: account.account_id().to_string(),
            };
            if let Some(client_request_id) = request.client_request_id.as_deref() {
                save_idempotency_record(
                    &mut uow,
                    &WalletOperationIdempotencyRecordV1 {
                        client_request_id: client_request_id.to_string(),
                        command: "wallet:import:create".to_string(),
                        payload_digest: idempotency_digest,
                        result_ref: serde_json::to_value(&response).map_err(|error| {
                            WalletCommandError::internal(format!(
                                "wallet idempotency result serialization failed: {error}"
                            ))
                        })?,
                        created_at: now,
                    },
                )?;
            }
            commit_wallet_uow(uow, session)?;

            Ok(response)
        })
    }
}
