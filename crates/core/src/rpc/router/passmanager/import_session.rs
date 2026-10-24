//! Bounded RPC ingress over the same Core preparation and reviewed transaction as native clients.
use super::super::{
    session_lifecycle::{now_ms, ExpiringSessionMeta},
    state::RpcRouter,
};
use crate::{
    credential_import::{
        CredentialImportMode, PreparedCredentialImport, MAX_IMPORT_DOCUMENT_BYTES,
        MAX_IMPORT_RPC_CHUNK_BYTES,
    },
    error::ErrorCode,
    rpc::{helpers::clear_rpc_strings, types::*},
};
use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde::de::DeserializeOwned;
use serde_json::Value;
use zeroize::Zeroizing;

enum ImportState {
    Receiving {
        bytes: Zeroizing<Vec<u8>>,
        expected: u32,
        mode: CredentialImportMode,
    },
    Ready(PreparedCredentialImport),
}

pub(in crate::rpc::router) struct CredentialImportSession {
    id: String,
    meta: ExpiringSessionMeta,
    state: ImportState,
}

fn invalid(message: &'static str) -> RpcResponse {
    RpcResponse::error(message, Some(ErrorCode::EmptyPayload))
}

fn parse<T: DeserializeOwned>(data: &Value) -> Result<T, RpcResponse> {
    T::deserialize(data).map_err(|_| invalid("Invalid credential import request"))
}

impl RpcRouter {
    pub(in crate::rpc::router) fn clear_credential_import(&mut self) {
        self.long_running_sessions.credential_import = None;
    }

    fn expire_credential_import(&mut self) {
        if self
            .long_running_sessions
            .credential_import
            .as_ref()
            .is_some_and(|session| {
                session.meta.is_idle_expired(
                    now_ms(),
                    self.long_running_sessions.ttls.credential_import_ms,
                )
            })
        {
            self.clear_credential_import();
        }
    }

    fn take_credential_import(&mut self, id: &str) -> Result<CredentialImportSession, RpcResponse> {
        if self
            .long_running_sessions
            .credential_import
            .as_ref()
            .is_some_and(|session| session.id == id)
        {
            Ok(self
                .long_running_sessions
                .credential_import
                .take()
                .expect("matched import"))
        } else {
            Err(RpcResponse::error(
                "Import is no longer available; select the file again",
                Some(ErrorCode::NodeNotFound),
            ))
        }
    }

    pub(in crate::rpc::router) fn handle_passmanager_import(
        &mut self,
        command: &str,
        data: &Value,
    ) -> RpcResponse {
        if command == "passmanager:import:limits" {
            return RpcResponse::success(CredentialImportLimits {
                max_input_bytes: MAX_IMPORT_DOCUMENT_BYTES,
                max_chunk_bytes: MAX_IMPORT_RPC_CHUNK_BYTES,
            });
        }
        if self.session.is_none() {
            self.clear_credential_import();
            return RpcResponse::error("Vault not unlocked", Some(ErrorCode::VaultRequired));
        }
        self.expire_credential_import();
        let result = match command {
            "passmanager:import:start" => self.start_credential_import(data),
            "passmanager:import:append" => self.append_credential_import(data),
            "passmanager:import:review" => self.review_credential_import(data),
            "passmanager:import:commit" => self.commit_credential_import(data),
            "passmanager:import:cancel" => self.cancel_credential_import(data),
            _ => Err(RpcResponse::error(
                "Unknown import command",
                Some(ErrorCode::UnknownCommand),
            )),
        };
        match result {
            Ok(response) | Err(response) => response,
        }
    }

    fn start_credential_import(&mut self, data: &Value) -> Result<RpcResponse, RpcResponse> {
        let request: CredentialImportStartRequest = parse(data)?;
        if request.byte_count == 0 {
            return Err(invalid("Import file is empty"));
        }
        if request.byte_count > MAX_IMPORT_DOCUMENT_BYTES {
            return Err(RpcResponse::error(
                "Import file exceeds the size limit",
                Some(ErrorCode::CredentialImportTooLarge),
            ));
        }
        if self.long_running_sessions.credential_import.is_some() {
            return Err(RpcResponse::error(
                "Another credential import is active",
                Some(ErrorCode::CredentialImportBusy),
            ));
        }
        let mut random = [0_u8; 32];
        getrandom::getrandom(&mut random).map_err(|_| {
            RpcResponse::error(
                "Cannot create import session",
                Some(ErrorCode::InternalError),
            )
        })?;
        let id = STANDARD.encode(random);
        self.long_running_sessions.credential_import = Some(CredentialImportSession {
            id: id.clone(),
            meta: ExpiringSessionMeta::new(now_ms()),
            state: ImportState::Receiving {
                bytes: Zeroizing::new(Vec::with_capacity(request.byte_count as usize)),
                expected: request.byte_count,
                mode: request.mode,
            },
        });
        Ok(RpcResponse::success(CredentialImportStarted {
            import_id: id,
        }))
    }

    fn append_credential_import(&mut self, data: &Value) -> Result<RpcResponse, RpcResponse> {
        let id = crate::rpc::request_parse::required_str(data, "import_id")?;
        let mut import = self.take_credential_import(id)?;
        let encoded = crate::rpc::request_parse::required_str(data, "chunk_base64")?;
        if encoded.len() > (MAX_IMPORT_RPC_CHUNK_BYTES as usize).div_ceil(3) * 4 {
            return Err(RpcResponse::error(
                "Import chunk exceeds the size limit",
                Some(ErrorCode::CredentialImportTooLarge),
            ));
        }
        let request: CredentialImportAppendRequest = parse(data)?;
        let encoded = Zeroizing::new(request.chunk_base64);
        let ImportState::Receiving {
            bytes, expected, ..
        } = &mut import.state
        else {
            return Err(invalid("Import no longer accepts file data"));
        };
        let max_chunk = MAX_IMPORT_RPC_CHUNK_BYTES as usize;
        let chunk = Zeroizing::new(
            STANDARD
                .decode(encoded.as_bytes())
                .map_err(|_| invalid("Invalid import chunk"))?,
        );
        if chunk.len() > max_chunk {
            return Err(RpcResponse::error(
                "Import chunk exceeds the size limit",
                Some(ErrorCode::CredentialImportTooLarge),
            ));
        }
        if chunk.is_empty() {
            return Err(invalid("Invalid import chunk size"));
        }
        if request.offset as usize != bytes.len()
            || chunk.len() > (*expected as usize).saturating_sub(bytes.len())
        {
            return Err(RpcResponse::error(
                "Import file length or offset changed",
                Some(ErrorCode::InvalidOffset),
            ));
        }
        bytes.extend_from_slice(&chunk);
        let received_bytes = bytes.len() as u32;
        import.meta.touch(now_ms());
        self.long_running_sessions.credential_import = Some(import);
        Ok(RpcResponse::success(CredentialImportReceived {
            received_bytes,
        }))
    }

    fn review_credential_import(&mut self, data: &Value) -> Result<RpcResponse, RpcResponse> {
        let request: CredentialImportReviewRequest = parse(data)?;
        let password = request.source_password.map(Zeroizing::new);
        let mut import = self.take_credential_import(&request.import_id)?;
        let ImportState::Receiving {
            bytes,
            expected,
            mode,
        } = import.state
        else {
            return Err(invalid("Import has already been reviewed"));
        };
        if bytes.len() != expected as usize {
            return Err(invalid("Import file is incomplete"));
        }
        let prepared =
            self.prepare_credential_import(&bytes, mode, password.as_deref().map(String::as_str))?;
        let response = RpcResponse::success(prepared.preview());
        import.state = ImportState::Ready(prepared);
        import.meta.touch(now_ms());
        self.long_running_sessions.credential_import = Some(import);
        Ok(response)
    }

    fn commit_credential_import(&mut self, data: &Value) -> Result<RpcResponse, RpcResponse> {
        let request: CredentialImportCommitRequest = parse(data)?;
        if !request.confirm {
            return Err(RpcResponse::error(
                "Confirm the reviewed import first",
                Some(ErrorCode::ConfirmRequired),
            ));
        }
        let import = self.take_credential_import(&request.import_id)?;
        let ImportState::Ready(prepared) = import.state else {
            return Err(invalid("Review the file before importing"));
        };
        let mut request = prepared.into_commit_request();
        let response = self.handle_passmanager_root_import(&request.data);
        clear_rpc_strings(&mut request.data);
        Ok(response)
    }

    fn cancel_credential_import(&mut self, data: &Value) -> Result<RpcResponse, RpcResponse> {
        let request: CredentialImportIdRequest = parse(data)?;
        if self
            .long_running_sessions
            .credential_import
            .as_ref()
            .is_some_and(|session| session.id == request.import_id)
        {
            self.clear_credential_import();
        }
        Ok(RpcResponse::success(Value::Null))
    }
}
