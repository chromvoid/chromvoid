//! `restore:local:validate` handler — verifies a backup directory layout.

use crate::rpc::{RpcResponse, RpcRouter};

use super::material::{derive_backup_key_for_validation, RestoreLocalMaterialInput};
use super::validation::{
    validate_restore_directory, validate_restore_payload, RestoreDirectoryValidationRequest,
    RestorePayloadValidationRequest, RestoreValidationRequestError,
};

pub(in crate::rpc::router::restore) fn handle_restore_local_validate(
    router: &mut RpcRouter,
    data: &serde_json::Value,
) -> RpcResponse {
    let request = match RestoreDirectoryValidationRequest::from_data(data) {
        Ok(request) => request,
        Err(error) => return error.into_rpc_response(),
    };
    RpcResponse::success(validate_restore_directory(router, request).into_value())
}

pub(in crate::rpc::router::restore) fn handle_restore_local_validate_payload(
    router: &mut RpcRouter,
    data: &serde_json::Value,
) -> RpcResponse {
    let request = match RestorePayloadValidationRequest::from_data(data) {
        Ok(request) => request,
        Err(RestoreValidationRequestError::Command(error)) => return error.into_rpc_response(),
        Err(RestoreValidationRequestError::Report(report)) => {
            return RpcResponse::success(report.into_value())
        }
    };
    RpcResponse::success(validate_restore_payload(router, request).into_value())
}

pub(in crate::rpc::router::restore) fn handle_restore_local_validate_master_material(
    router: &mut RpcRouter,
    data: &serde_json::Value,
) -> RpcResponse {
    let input = RestoreLocalMaterialInput::from_data(&[], data);
    match derive_backup_key_for_validation(router, &input) {
        Ok(_) => RpcResponse::success(serde_json::json!({
            "valid": true,
            "warnings": [],
        })),
        Err(warning) => RpcResponse::success(serde_json::json!({
            "valid": false,
            "warnings": [warning],
        })),
    }
}
