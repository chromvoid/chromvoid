use super::*;

impl RpcRouter {
    pub(in crate::rpc::router) fn handle_wallet_import_create(
        &mut self,
        data: &Value,
    ) -> RpcResponse {
        if let Some(response) = self.wallet_preflight(false) {
            return response;
        }
        if let Some(error) = reject_unsupported_network(data, "network") {
            return error.into_rpc_response();
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

        self.with_wallet_session_cleaned_after_preflight(|session, storage| {
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
                    network: request.network,
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
                supported_networks: vec![request.network],
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

            let address = derive_address(
                request.network,
                &request.private_key,
                imported_derivation_path(request.network),
            );
            let account = WalletAccountMeta {
                account_id: account_id.clone(),
                wallet_id: wallet_id.clone(),
                network: request.network,
                kind: "imported".to_string(),
                account_model: None,
                derivation_profile: None,
                account_index: None,
                label: Some(request.label.trim().to_string()),
                address: Some(address),
                public_key: Some(derive_public_key(
                    &request.private_key,
                    imported_derivation_path(request.network),
                )),
                derivation_path: None,
                current_receive_address: None,
                current_receive_derivation_path: None,
                next_receive_index: None,
                next_change_index: None,
                created_at: now,
                updated_at: now,
            };
            save_account(&mut uow, &account)?;

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
            commit_wallet_uow(uow, session)?;

            Ok(WalletImportCreateResponse {
                wallet_id,
                account_id,
            })
        })
    }
}
