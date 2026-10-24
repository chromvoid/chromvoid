use bip39::{Language, Mnemonic};
use zeroize::Zeroizing;

use crate::wallet::rotation_mnemonic::validate_rotation_mnemonic;
use crate::wallet::ton_mnemonic::validate_ton_native_mnemonic;
use crate::wallet::{HdRootRecoveryMaterialV2, WalletRoot};

use super::secrets::reconcile_wallet_secret;
use super::store::load_accounts;

use super::*;

impl RpcRouter {
    pub(in crate::rpc::router) fn handle_wallet_backup_export(
        &mut self,
        data: &Value,
    ) -> RpcResponse {
        if let Some(response) = self.wallet_preflight() {
            return response;
        }
        let request = match parse::<WalletBackupExportRequest>(data) {
            Ok(request) => request,
            Err(error) => return error.into_rpc_response(),
        };
        if let Err(error) = self.verify_wallet_export_master_password(&request.master_password) {
            return error.into_rpc_response();
        }
        let registry = self.wallet_chain_registry.clone();
        let config = self.wallet_runtime_config.clone();
        self.with_wallet_session_cleaned_after_preflight(|session, storage| {
            let wallet = load_wallet(session, storage, &request.wallet_id)?;
            if wallet.kind != "hd" {
                return Err(WalletCommandError::unsupported_export_kind(
                    "Only HD wallet export is supported",
                ));
            }
            let secret = load_secret(session, storage, &wallet.secret_ref)?;
            let payload = if wallet.mnemonic_standard == ROTATION_MNEMONIC_STANDARD {
                // Promote a confirmed key rotation before revealing the phrase.
                let account = load_accounts(session, storage, Some(&wallet.wallet_id))?
                    .into_iter()
                    .find(|account| account.network().as_str() == "ton");
                match account {
                    Some(account) => {
                        let profile = registry
                            .enabled_profile(account.network(), &config)
                            .map_err(WalletCommandError::from)?;
                        reconcile_wallet_secret(session, storage, &profile, &account, secret)?
                    }
                    None => secret.payload,
                }
            } else {
                secret.payload
            };
            let (SecretPayloadV1::HdRootV2 { wordlist, recovery }, Some((root, _))) =
                (&payload, payload.wallet_root())
            else {
                return Err(WalletCommandError::unsupported_export_kind(
                    "Only HD wallet export is supported",
                ));
            };
            if wordlist != BIP39_ENGLISH_WORDLIST {
                return Err(WalletCommandError::unsupported_export_kind(
                    "Unsupported HD wordlist",
                ));
            }
            let (mnemonic, mnemonic_standard, bip39_passphrase) = match (root, recovery) {
                (WalletRoot::TonNative { words }, _) => {
                    validate_ton_native_mnemonic(&words).map_err(WalletCommandError::from)?;
                    (words.to_vec(), TON_NATIVE_MNEMONIC_STANDARD, None)
                }
                (
                    WalletRoot::Bip39 { passphrase, .. },
                    HdRootRecoveryMaterialV2::Rotation { mnemonic_words, .. },
                ) => {
                    // Export the persisted TEP-0003 phrase, including its current signing half.
                    validate_rotation_mnemonic(mnemonic_words).map_err(WalletCommandError::from)?;
                    (
                        mnemonic_words.clone(),
                        ROTATION_MNEMONIC_STANDARD,
                        passphrase.map(|value| value.to_string()),
                    )
                }
                (
                    WalletRoot::Bip39 {
                        entropy,
                        passphrase,
                    },
                    _,
                ) => {
                    let entropy =
                        Zeroizing::new(parse_hex(&entropy).map_err(WalletCommandError::from)?);
                    let mnemonic = Mnemonic::from_entropy_in(Language::English, &entropy).map_err(
                        |error| {
                            WalletCommandError::internal(format!(
                                "Mnemonic reconstruction failed: {error}"
                            ))
                        },
                    )?;
                    (
                        mnemonic.words().map(str::to_string).collect(),
                        BIP39_MNEMONIC_STANDARD,
                        passphrase.map(|value| value.to_string()),
                    )
                }
            };
            Ok(WalletBackupExportResponse {
                wallet_id: wallet.wallet_id,
                export_kind: "mnemonic".to_string(),
                mnemonic,
                wordlist: wordlist.clone(),
                wallet_mode: wallet.wallet_mode,
                mnemonic_standard: mnemonic_standard.to_string(),
                bip39_passphrase,
            })
        })
    }
}
