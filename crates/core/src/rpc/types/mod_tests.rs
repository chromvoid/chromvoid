use super::*;

#[test]
fn test_request_serialization() {
    let request = RpcRequest::new("ping", serde_json::json!({}));

    let json = serde_json::to_string(&request).expect("should serialize");

    assert!(json.contains("\"v\":1"));
    assert!(json.contains("\"command\":\"ping\""));
}

#[test]
fn test_success_response() {
    let response = RpcResponse::success(serde_json::json!({"pong": true}));

    assert!(response.is_ok());

    let json = serde_json::to_string(&response).expect("should serialize");
    assert!(json.contains("\"ok\":true"));
    assert!(json.contains("\"pong\":true"));
}

#[test]
fn test_error_response() {
    let response = RpcResponse::error("Not found", Some("NODE_NOT_FOUND"));

    assert!(!response.is_ok());

    let json = serde_json::to_string(&response).expect("should serialize");
    assert!(json.contains("\"ok\":false"));
    assert!(json.contains("\"error\":\"Not found\""));
    assert!(json.contains("\"code\":\"NODE_NOT_FOUND\""));
}

#[test]
fn test_error_response_without_code() {
    let response = RpcResponse::error("Something went wrong", None::<String>);

    let json = serde_json::to_string(&response).expect("should serialize");
    assert!(!json.contains("\"code\""));
}

#[test]
fn rpc_types_include_lazy_catalog_contracts() {
    let command = RpcCommand::CatalogFolderBatch {
        pages: vec![CatalogFolderPageRequest {
            path: "/docs".to_string(),
            offset: 0,
            limit: Some(200),
            expected_version: Some(7),
            sort: Some(CatalogFolderSort {
                by: "name".to_string(),
                direction: "asc".to_string(),
            }),
            filter: Some(CatalogFolderFilter {
                query: Some("report".to_string()),
                include_hidden: Some(false),
                file_types: vec!["documents".to_string()],
            }),
        }],
    };

    let json = serde_json::to_value(command).expect("command serializes");
    assert_eq!(
        json.get("command").and_then(|value| value.as_str()),
        Some("catalog:folder:batch")
    );
    assert_eq!(
        json.pointer("/data/pages/0/expected_version")
            .and_then(|value| value.as_u64()),
        Some(7)
    );

    let result = RpcCommandResult::CatalogSyncManifest(CatalogSyncManifestResponse {
        root_version: 3,
        format: "manifest".to_string(),
        manifest_budget_bytes: CATALOG_MANIFEST_BUDGET_BYTES,
        shards: Vec::new(),
        root_summaries: Vec::new(),
        eager_data: serde_json::json!({}),
    });
    let json = serde_json::to_value(result).expect("result serializes");
    assert_eq!(
        json.get("command").and_then(|value| value.as_str()),
        Some("catalog:sync:manifest")
    );
}
