use crate::error::ErrorCode;

use super::state::RpcRouter;

#[derive(Debug, Clone)]
pub(in crate::rpc::router) struct PlainBlobReadError {
    message: String,
    code: Option<String>,
}

pub(in crate::rpc::router) type PlainBlobReadResult<T> = Result<T, PlainBlobReadError>;

impl PlainBlobReadError {
    pub(in crate::rpc::router) fn new(message: impl Into<String>, code: Option<ErrorCode>) -> Self {
        Self {
            message: message.into(),
            code: code.map(String::from),
        }
    }

    pub(in crate::rpc::router) fn internal(message: impl Into<String>) -> Self {
        Self::new(message, Some(ErrorCode::InternalError))
    }

    pub(in crate::rpc::router) fn message(&self) -> &str {
        &self.message
    }

    pub(in crate::rpc::router) fn code(&self) -> Option<&str> {
        self.code.as_deref()
    }

    pub(in crate::rpc::router) fn into_parts(self) -> (String, Option<String>) {
        let message = self.message().to_string();
        let code = self.code().map(str::to_string);
        (message, code)
    }
}

impl RpcRouter {
    pub(super) fn read_file_plain(
        &self,
        vault_key: &[u8; crate::types::KEY_SIZE],
        node_id: u64,
    ) -> PlainBlobReadResult<Vec<u8>> {
        let mut out: Vec<u8> = Vec::new();
        for index in 0u32.. {
            let chunk_name = self.file_data_chunk_name(vault_key, node_id, index)?;
            let encrypted = match self.storage.read_chunk(&chunk_name) {
                Ok(data) => data,
                Err(_) => {
                    // No chunks yet (empty file) or end of chunk sequence.
                    break;
                }
            };

            let plaintext =
                match crate::crypto::decrypt(&encrypted, vault_key, chunk_name.as_bytes()) {
                    Ok(data) => data,
                    Err(error) => {
                        return Err(PlainBlobReadError::internal(format!(
                            "Decryption failed: {error}"
                        )))
                    }
                };
            out.extend_from_slice(&plaintext);
        }
        Ok(out)
    }

    fn file_data_chunk_name(
        &self,
        vault_key: &[u8; crate::types::KEY_SIZE],
        node_id: u64,
        part_index: u32,
    ) -> PlainBlobReadResult<String> {
        let node_id32: u32 = node_id
            .try_into()
            .map_err(|_| PlainBlobReadError::internal("Invalid node_id"))?;
        Ok(crate::crypto::blob_chunk_name(
            vault_key, node_id32, part_index,
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::PlainBlobReadError;

    #[test]
    fn plain_blob_read_error_parts_preserve_internal_mapping() {
        let error = PlainBlobReadError::internal("Invalid node_id");

        assert_eq!(error.message(), "Invalid node_id");
        assert_eq!(error.code(), Some("INTERNAL_ERROR"));

        let (message, code) = error.into_parts();
        assert_eq!(message, "Invalid node_id");
        assert_eq!(code.as_deref(), Some("INTERNAL_ERROR"));
    }
}
