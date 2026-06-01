use super::*;

impl RpcRouter {
    pub(in crate::rpc::router) fn handle_wallet_backup_export(
        &mut self,
        data: &Value,
    ) -> RpcResponse {
        if let Some(response) = self.wallet_preflight(false) {
            return response;
        }
        let request = match parse::<WalletBackupExportRequest>(data) {
            Ok(request) => request,
            Err(error) => return error.into_rpc_response(),
        };
        if let Err(error) = self.verify_master_password(&request.master_password) {
            return RpcResponse::error(
                error.message().to_string(),
                Some(ErrorCode::ExportReauthFailed),
            );
        }
        self.with_wallet_session_cleaned_after_preflight(|session, storage| {
            let wallet = load_wallet(session, storage, &request.wallet_id)?;
            if wallet.kind != "hd" {
                return Err(WalletCommandError::unsupported_export_kind(
                    "Only HD wallet export is supported",
                ));
            }
            let secret = load_secret(session, storage, &wallet.secret_ref)?;
            match secret.payload {
                SecretPayloadV1::HdRoot {
                    mnemonic,
                    wordlist,
                    bip39_passphrase,
                    ..
                } => Ok(WalletBackupExportResponse {
                    wallet_id: wallet.wallet_id,
                    export_kind: "mnemonic".to_string(),
                    mnemonic,
                    wordlist,
                    bip39_passphrase,
                }),
                _ => Err(WalletCommandError::unsupported_export_kind(
                    "Only HD wallet export is supported",
                )),
            }
        })
    }
}
