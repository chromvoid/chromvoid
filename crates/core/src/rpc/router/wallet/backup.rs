use bip39::{Language, Mnemonic};
use zeroize::Zeroizing;

use crate::wallet::ton_mnemonic::validate_ton_native_mnemonic;

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
        self.with_wallet_session_cleaned_after_preflight(|session, storage| {
            let wallet = load_wallet(session, storage, &request.wallet_id)?;
            if wallet.kind != "hd" {
                return Err(WalletCommandError::unsupported_export_kind(
                    "Only HD wallet export is supported",
                ));
            }
            let secret = load_secret(session, storage, &wallet.secret_ref)?;
            let payload =
                ensure_ton_native_secret_words_for_wallet(session, storage, &wallet, secret)?;
            match payload.hd_root_material() {
                Some(root) => {
                    let crate::wallet::HdRootMaterial {
                        mnemonic_standard,
                        mnemonic_entropy,
                        wordlist,
                        mnemonic_words,
                        bip39_passphrase,
                    } = root;
                    if wordlist != BIP39_ENGLISH_WORDLIST {
                        return Err(WalletCommandError::unsupported_export_kind(
                            "Unsupported HD wordlist",
                        ));
                    }
                    let mnemonic = if mnemonic_standard == TON_NATIVE_MNEMONIC_STANDARD {
                        let Some(words) = mnemonic_words else {
                            return Err(WalletCommandError::invalid_input(
                                "TON-native wallet requires repair",
                            ));
                        };
                        validate_ton_native_mnemonic(&words).map_err(WalletCommandError::from)?;
                        words
                    } else {
                        let entropy = Zeroizing::new(
                            parse_hex(&mnemonic_entropy).map_err(WalletCommandError::from)?,
                        );
                        let mnemonic = Mnemonic::from_entropy_in(Language::English, &entropy)
                            .map_err(|error| {
                                WalletCommandError::internal(format!(
                                    "Mnemonic reconstruction failed: {error}"
                                ))
                            })?;
                        mnemonic.words().map(str::to_string).collect()
                    };
                    Ok(WalletBackupExportResponse {
                        wallet_id: wallet.wallet_id,
                        export_kind: "mnemonic".to_string(),
                        mnemonic,
                        wordlist,
                        wallet_mode: wallet.wallet_mode,
                        mnemonic_standard,
                        bip39_passphrase,
                    })
                }
                None => Err(WalletCommandError::unsupported_export_kind(
                    "Only HD wallet export is supported",
                )),
            }
        })
    }
}
