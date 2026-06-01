use super::*;

impl RpcRouter {
    pub(in crate::rpc::router) fn handle_wallet_hd_generate_mnemonic(
        &self,
        data: &Value,
    ) -> RpcResponse {
        if let Some(response) = self.wallet_preflight(false) {
            return response;
        }
        let request = match parse::<WalletHdGenerateMnemonicRequest>(data) {
            Ok(request) => request,
            Err(error) => return error.into_rpc_response(),
        };
        if request.word_count != 12 && request.word_count != 24 {
            return invalid_input("word_count must be 12 or 24").into_rpc_response();
        }
        let wordlist = request.wordlist.unwrap_or_else(|| "english".to_string());
        if wordlist != "english" {
            return invalid_input("only english wordlist is supported in v1").into_rpc_response();
        }

        let mut bytes = vec![0u8; request.word_count as usize * 2];
        if let Err(error) = getrandom::getrandom(&mut bytes) {
            return WalletCommandError::internal(format!("Mnemonic entropy failed: {error}"))
                .into_rpc_response();
        }
        let mnemonic = bytes
            .chunks(2)
            .take(request.word_count as usize)
            .map(|chunk| mnemonic_word(u16::from_le_bytes([chunk[0], chunk[1]])))
            .collect();
        RpcResponse::success(WalletHdGenerateMnemonicResponse { mnemonic, wordlist })
    }

    pub(in crate::rpc::router) fn handle_wallet_hd_create(&mut self, data: &Value) -> RpcResponse {
        if let Some(response) = self.wallet_preflight(false) {
            return response;
        }
        if let Some(error) = reject_unsupported_supported_networks(data) {
            return error.into_rpc_response();
        }
        let request = match parse::<WalletHdCreateRequest>(data) {
            Ok(request) => request,
            Err(error) => return error.into_rpc_response(),
        };
        if request.label.trim().is_empty() || request.mnemonic.is_empty() {
            return invalid_input("label and mnemonic are required").into_rpc_response();
        }
        if request.wordlist != "english" {
            return invalid_input("only english wordlist is supported in v1").into_rpc_response();
        }
        if request.supported_networks.is_empty() {
            return invalid_input("supported_networks is required").into_rpc_response();
        }
        if has_duplicate_networks(&request.supported_networks) {
            return invalid_input("supported_networks must not contain duplicates")
                .into_rpc_response();
        }

        let provider = self.wallet_provider.clone();
        self.with_wallet_session_cleaned_after_preflight(|session, storage| {
            let mut uow = begin_wallet_uow(session, storage, "wallet-hd-create");
            ensure_wallet_dirs(&mut uow)?;
            let now = now_ms();
            let wallet_id = new_wallet_id();
            let secret_id = new_secret_id();
            let mnemonic_seed = request.mnemonic.join(" ");
            let secret = SecretBlobV1 {
                secret_id: secret_id.clone(),
                kind: "hd_root".to_string(),
                payload_version: 1,
                payload: SecretPayloadV1::HdRoot {
                    mnemonic_entropy: hash_hex(&[mnemonic_seed.as_bytes()]),
                    wordlist: request.wordlist.clone(),
                    bip39_passphrase: request.bip39_passphrase.clone(),
                    mnemonic: request.mnemonic.clone(),
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
                kind: "hd".to_string(),
                label: request.label.trim().to_string(),
                supported_networks: request.supported_networks.clone(),
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

            let mut accounts = Vec::new();
            for network in &request.supported_networks {
                let account = materialize_hd_account(
                    &mut uow,
                    provider.as_deref(),
                    &wallet_id,
                    *network,
                    0,
                    &mnemonic_seed,
                    now,
                )?;
                accounts.push(account);
            }

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

            Ok(WalletHdCreateResponse {
                wallet_id,
                accounts,
            })
        })
    }
}
