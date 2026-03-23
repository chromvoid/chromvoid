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
