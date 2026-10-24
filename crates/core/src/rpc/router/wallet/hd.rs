use bip39::{Language, Mnemonic};
use zeroize::Zeroizing;

use super::super::state::WalletMnemonicDraft;
use crate::wallet::rotation_mnemonic::{
    generate_rotation_half, normalize_rotation_words, validate_rotation_mnemonic,
};
use crate::wallet::ton_mnemonic::{
    generate_ton_native_mnemonic, normalize_ton_native_words, validate_ton_native_mnemonic,
};

use super::*;

impl RpcRouter {
    pub(in crate::rpc::router) fn handle_wallet_hd_generate_mnemonic(
        &mut self,
        data: &Value,
    ) -> RpcResponse {
        if let Some(response) = self.wallet_preflight() {
            return response;
        }
        let request = match parse::<WalletHdGenerateMnemonicRequest>(data) {
            Ok(request) => request,
            Err(error) => return error.into_rpc_response(),
        };
        let Some(wallet_mode) = request.wallet_mode.as_deref() else {
            return invalid_input("wallet_mode is required").into_rpc_response();
        };
        let Some(mnemonic_standard) = request.mnemonic_standard.as_deref() else {
            return invalid_input("mnemonic_standard is required").into_rpc_response();
        };
        if let Err(error) =
            validate_wallet_mode_and_standard(wallet_mode, mnemonic_standard, request.word_count)
        {
            return error.into_rpc_response();
        }
        let wordlist = request
            .wordlist
            .unwrap_or_else(|| BIP39_ENGLISH_WORDLIST.to_string());
        if wordlist != BIP39_ENGLISH_WORDLIST {
            return invalid_input("only english wordlist is supported in v1").into_rpc_response();
        }

        let mnemonic = if mnemonic_standard == TON_NATIVE_MNEMONIC_STANDARD {
            match generate_ton_native_mnemonic() {
                Ok(words) => words,
                Err(error) => return WalletCommandError::from(error).into_rpc_response(),
            }
        } else if mnemonic_standard == ROTATION_MNEMONIC_STANDARD {
            // A new rotation wallet starts in its initial form: one 12-word anchor half.
            match generate_rotation_half() {
                Ok(words) => words,
                Err(error) => return WalletCommandError::from(error).into_rpc_response(),
            }
        } else {
            match Mnemonic::generate_in(Language::English, request.word_count as usize) {
                Ok(mnemonic) => mnemonic.words().map(str::to_string).collect(),
                Err(error) => {
                    return WalletCommandError::internal(format!(
                        "Mnemonic generation failed: {error}"
                    ))
                    .into_rpc_response()
                }
            }
        };
        let expires_at = now_ms().saturating_add(MNEMONIC_DRAFT_TTL_MS);
        let mnemonic_draft_id = new_mnemonic_draft_id();
        self.prune_expired_mnemonic_drafts(now_ms());
        self.wallet_mnemonic_drafts.insert(
            mnemonic_draft_id.clone(),
            WalletMnemonicDraft {
                wallet_mode: wallet_mode.to_string(),
                mnemonic_standard: mnemonic_standard.to_string(),
                wordlist: wordlist.clone(),
                mnemonic: mnemonic.clone(),
                expires_at,
            },
        );
        RpcResponse::success(WalletHdGenerateMnemonicResponse {
            mnemonic_draft_id,
            mnemonic,
            wordlist,
            wallet_mode: wallet_mode.to_string(),
            mnemonic_standard: mnemonic_standard.to_string(),
            expires_at,
        })
    }

    pub(in crate::rpc::router) fn handle_wallet_hd_create(&mut self, data: &Value) -> RpcResponse {
        if let Some(response) = self.wallet_preflight() {
            return response;
        }
        let request = match parse::<WalletHdCreateRequest>(data) {
            Ok(request) => request,
            Err(error) => return error.into_rpc_response(),
        };
        let label = request.label.trim().to_string();
        if label.is_empty() {
            return invalid_input("label is required").into_rpc_response();
        }
        let Some(wallet_mode) = request.wallet_mode.as_deref() else {
            return invalid_input("wallet_mode is required").into_rpc_response();
        };
        let Some(mnemonic_standard) = request.mnemonic_standard.as_deref() else {
            return invalid_input("mnemonic_standard is required").into_rpc_response();
        };
        if let Err(error) = validate_wallet_mode_networks(wallet_mode, mnemonic_standard, &request)
        {
            return error.into_rpc_response();
        }
        if request.wordlist != BIP39_ENGLISH_WORDLIST {
            return invalid_input("only english wordlist is supported in v1").into_rpc_response();
        }
        if request.supported_networks.is_empty() {
            return invalid_input("supported_networks is required").into_rpc_response();
        }
        if has_duplicate_networks(&request.supported_networks) {
            return invalid_input("supported_networks must not contain duplicates")
                .into_rpc_response();
        }
        let mnemonic_source_count = usize::from(
            request
                .mnemonic
                .as_ref()
                .is_some_and(|mnemonic| !mnemonic.is_empty()),
        ) + usize::from(
            request
                .mnemonic_draft_id
                .as_deref()
                .is_some_and(|draft_id| !draft_id.trim().is_empty()),
        );
        if request.mnemonic.as_ref().is_some_and(Vec::is_empty) {
            return invalid_input("mnemonic must not be empty").into_rpc_response();
        }
        if mnemonic_source_count != 1 {
            return invalid_input("exactly one mnemonic source is required").into_rpc_response();
        }
        let canonical_request = serde_json::json!({
            "label": label,
            "wallet_mode": wallet_mode,
            "mnemonic": request.mnemonic.clone(),
            "mnemonic_draft_id": request.mnemonic_draft_id.clone(),
            "wordlist": request.wordlist.clone(),
            "mnemonic_standard": mnemonic_standard,
            "bip39_passphrase": request.bip39_passphrase.clone(),
            "supported_networks": request.supported_networks.clone(),
        });
        let idempotency_digest = match payload_digest(&canonical_request) {
            Ok(digest) => digest,
            Err(error) => return error.into_rpc_response(),
        };
        let registry = self.wallet_chain_registry.clone();
        let config = self.wallet_runtime_config.clone();
        let mut profiles = Vec::with_capacity(request.supported_networks.len());
        for network in &request.supported_networks {
            let profile = match registry.enabled_profile(network, &config) {
                Ok(profile) => profile,
                Err(error) => return WalletCommandError::from(error).into_rpc_response(),
            };
            profiles.push((network.clone(), profile));
        }

        let storage = self.storage.clone();
        let existing_idempotent_response = {
            let Some(session) = self.session.as_mut() else {
                return RpcResponse::error("Vault not unlocked", Some(ErrorCode::VaultRequired));
            };
            if let Err(error) = cleanup_expired_preparations(session, &storage) {
                return error.into_rpc_response();
            }
            if let Some(client_request_id) = request.client_request_id.as_deref() {
                let record = match load_idempotency_record(session, &storage, client_request_id) {
                    Ok(record) => record,
                    Err(error) => return error.into_rpc_response(),
                };
                if let Some(record) = record {
                    if record.command != "wallet:hd:create"
                        || record.payload_digest != idempotency_digest
                    {
                        return WalletCommandError::invalid_input(
                            "client_request_id payload mismatch",
                        )
                        .into_rpc_response();
                    }
                    let response =
                        match serde_json::from_value::<WalletHdCreateResponse>(record.result_ref) {
                            Ok(response) => response,
                            Err(error) => {
                                return WalletCommandError::internal(format!(
                                    "wallet idempotency result parse failed: {error}"
                                ))
                                .into_rpc_response()
                            }
                        };
                    return RpcResponse::success(response);
                }
            }
            None::<WalletHdCreateResponse>
        };
        if let Some(response) = existing_idempotent_response {
            return RpcResponse::success(response);
        }

        let mnemonic = match self.resolve_hd_create_mnemonic(
            request.mnemonic.as_ref(),
            request.mnemonic_draft_id.as_deref(),
            wallet_mode,
            mnemonic_standard,
            &request.wordlist,
        ) {
            Ok(mnemonic) => mnemonic,
            Err(error) => return error.into_rpc_response(),
        };
        let (mnemonic_entropy, mnemonic_words) =
            match mnemonic_secret_material(mnemonic_standard, &mnemonic) {
                Ok(material) => material,
                Err(error) => return error.into_rpc_response(),
            };

        let result = {
            let Some(session) = self.session.as_mut() else {
                return RpcResponse::error("Vault not unlocked", Some(ErrorCode::VaultRequired));
            };
            (|| -> WalletResult<WalletHdCreateResponse> {
                let mut uow = begin_wallet_uow(session, &storage, "wallet-hd-create");
                ensure_wallet_dirs(&mut uow)?;
                let now = now_ms();
                let wallet_id = new_wallet_id();
                let secret_id = new_secret_id();
                let secret = SecretBlobV1 {
                    secret_id: secret_id.clone(),
                    kind: "hd_root".to_string(),
                    payload_version: 2,
                    payload: SecretPayloadV1::hd_root_v2(
                        mnemonic_standard,
                        mnemonic_entropy.to_string(),
                        request.wordlist.clone(),
                        mnemonic_words.clone(),
                        request.bip39_passphrase.clone(),
                    ),
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
                    label: label.clone(),
                    wallet_mode: wallet_mode.to_string(),
                    mnemonic_standard: mnemonic_standard.to_string(),
                    supported_networks: request.supported_networks.clone(),
                    bitcoin_discovery_pending: Some(
                        request.mnemonic.is_some()
                            && request
                                .supported_networks
                                .iter()
                                .any(|network| network.as_str() == "bitcoin"),
                    ),
                    // A restored phrase may already own derived accounts beyond index 0 on
                    // account-based networks; they are discovered lazily (SPEC-217 FR-016).
                    account_discovery_pending: if request.mnemonic.is_some() {
                        profiles
                            .iter()
                            .filter(|(network, profile)| {
                                network.as_str() != "bitcoin"
                                    && profile.supports_restore_discovery()
                            })
                            .map(|(network, _)| network.clone())
                            .collect()
                    } else {
                        Vec::new()
                    },
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
                for (network, profile) in profiles {
                    let materialization = profile
                        .materialize_hd_account(hd_account_input(
                            &wallet,
                            &secret.payload,
                            network,
                            0,
                            now,
                        )?)
                        .map_err(WalletCommandError::from)?;
                    let account = materialize_profile_account(&mut uow, materialization, &wallet)?;
                    // A restored Bitcoin account gets its address from discovery instead.
                    let account = if wallet.bitcoin_discovery_pending == Some(true) {
                        account
                    } else {
                        allocate_first_receive_address(
                            &mut uow,
                            profile.as_ref(),
                            account,
                            &secret.payload,
                            now,
                        )?
                    };
                    accounts.push(account);
                }

                let mut index = load_index(session, &storage)?;
                if !index.wallet_ids.contains(&wallet_id) {
                    index.wallet_ids.push(wallet_id.clone());
                }
                index.updated_at = now;
                if index.created_at == 0 {
                    index.created_at = now;
                }
                index.schema_version = WALLET_SCHEMA_VERSION;
                save_index(&mut uow, &index)?;
                let response = WalletHdCreateResponse {
                    wallet_id,
                    accounts,
                };
                if let Some(client_request_id) = request.client_request_id.as_deref() {
                    save_idempotency_record(
                        &mut uow,
                        &WalletOperationIdempotencyRecordV1 {
                            client_request_id: client_request_id.to_string(),
                            command: "wallet:hd:create".to_string(),
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
            })()
        };

        match result {
            Ok(response) => {
                if let Some(draft_id) = request.mnemonic_draft_id.as_deref() {
                    self.wallet_mnemonic_drafts.remove(draft_id);
                }
                RpcResponse::success(response)
            }
            Err(error) => error.into_rpc_response(),
        }
    }

    fn prune_expired_mnemonic_drafts(&mut self, now: u64) {
        self.wallet_mnemonic_drafts
            .retain(|_, draft| draft.expires_at > now);
    }

    fn resolve_hd_create_mnemonic(
        &mut self,
        mnemonic: Option<&Vec<String>>,
        mnemonic_draft_id: Option<&str>,
        wallet_mode: &str,
        mnemonic_standard: &str,
        wordlist: &str,
    ) -> WalletResult<Vec<String>> {
        let now = now_ms();
        self.prune_expired_mnemonic_drafts(now);
        if let Some(mnemonic) = mnemonic {
            return Ok(mnemonic.clone());
        }
        let draft_id = mnemonic_draft_id
            .map(str::trim)
            .filter(|draft_id| !draft_id.is_empty())
            .ok_or_else(|| WalletCommandError::invalid_input("mnemonic_draft_id is required"))?;
        let Some(draft) = self.wallet_mnemonic_drafts.get(draft_id) else {
            return Err(WalletCommandError::invalid_input(
                "mnemonic_draft_id is invalid or expired",
            ));
        };
        if draft.wallet_mode != wallet_mode
            || draft.mnemonic_standard != mnemonic_standard
            || draft.wordlist != wordlist
        {
            return Err(WalletCommandError::invalid_input(
                "mnemonic_draft_id does not match wallet_mode, mnemonic_standard or wordlist",
            ));
        }
        Ok(draft.mnemonic.clone())
    }
}

/// New wallets have exactly one shape: the universal rotation root (`multichain` +
/// `rotation`, 12 words). Every other mode/standard combination is a restore-only path.
fn validate_wallet_mode_and_standard(
    wallet_mode: &str,
    mnemonic_standard: &str,
    word_count: u8,
) -> WalletResult<()> {
    if wallet_mode != MULTICHAIN_WALLET_MODE || mnemonic_standard != ROTATION_MNEMONIC_STANDARD {
        return Err(WalletCommandError::invalid_input(
            "new wallets use the universal profile: wallet_mode=multichain, mnemonic_standard=rotation",
        ));
    }
    if word_count != 12 {
        return Err(WalletCommandError::invalid_input(
            "word_count must be 12 for a new universal wallet",
        ));
    }
    Ok(())
}

fn validate_wallet_mode_networks(
    wallet_mode: &str,
    mnemonic_standard: &str,
    request: &WalletHdCreateRequest,
) -> WalletResult<()> {
    match wallet_mode {
        MULTICHAIN_WALLET_MODE => {
            if mnemonic_standard != BIP39_MNEMONIC_STANDARD
                && mnemonic_standard != ROTATION_MNEMONIC_STANDARD
            {
                return Err(WalletCommandError::invalid_input(
                    "multichain wallet_mode requires mnemonic_standard=bip39 or rotation",
                ));
            }
            // A rotation root behaves like any multichain wallet: the 12 anchor words open every
            // network, and a BIP39 passphrase is an optional extra for the non-TON accounts.
        }
        TON_ONLY_WALLET_MODE => {
            if mnemonic_standard != TON_NATIVE_MNEMONIC_STANDARD
                && mnemonic_standard != ROTATION_MNEMONIC_STANDARD
            {
                return Err(WalletCommandError::invalid_input(
                    "ton_only wallet_mode requires mnemonic_standard=ton_native or rotation",
                ));
            }
            if request
                .bip39_passphrase
                .as_deref()
                .is_some_and(|passphrase| !passphrase.is_empty())
            {
                return Err(WalletCommandError::invalid_input(
                    "bip39_passphrase is allowed only for multichain wallets",
                ));
            }
            if request.supported_networks.len() != 1
                || request.supported_networks[0].as_str() != "ton"
            {
                return Err(WalletCommandError::invalid_input(
                    "ton_only wallet_mode supports only supported_networks=[\"ton\"]",
                ));
            }
        }
        _ => return Err(WalletCommandError::invalid_input("unsupported wallet_mode")),
    }
    Ok(())
}

fn mnemonic_secret_material(
    mnemonic_standard: &str,
    mnemonic: &[String],
) -> WalletResult<(Zeroizing<String>, Option<Vec<String>>)> {
    if mnemonic_standard == TON_NATIVE_MNEMONIC_STANDARD {
        if mnemonic.len() != 24 {
            return Err(WalletCommandError::invalid_input(
                "ton_native mnemonic must contain 24 words",
            ));
        }
        let words = normalize_ton_native_words(mnemonic);
        validate_ton_native_mnemonic(&words).map_err(WalletCommandError::from)?;
        return Ok((Zeroizing::new(String::new()), Some(words)));
    }
    if mnemonic_standard == ROTATION_MNEMONIC_STANDARD {
        let words = normalize_rotation_words(mnemonic);
        validate_rotation_mnemonic(&words).map_err(WalletCommandError::from)?;
        let anchor_entropy = crate::wallet::rotation_anchor_entropy_hex(&words);
        return Ok((Zeroizing::new(anchor_entropy), Some(words)));
    }
    if mnemonic_standard != BIP39_MNEMONIC_STANDARD {
        return Err(WalletCommandError::invalid_input(
            "unsupported mnemonic_standard",
        ));
    }
    if mnemonic.len() != 12 && mnemonic.len() != 24 {
        return Err(WalletCommandError::invalid_input(
            "bip39 mnemonic must contain 12 or 24 words",
        ));
    }
    let phrase = Zeroizing::new(mnemonic.join(" "));
    let mnemonic = Mnemonic::parse_in_normalized(Language::English, phrase.as_str())
        .map_err(|error| WalletCommandError::invalid_input(format!("invalid mnemonic: {error}")))?;
    Ok((Zeroizing::new(hex_string(&mnemonic.to_entropy())), None))
}
