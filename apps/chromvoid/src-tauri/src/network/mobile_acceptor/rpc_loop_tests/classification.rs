use super::*;

#[test]
fn full_upload_stream_commands_are_accumulated_before_core_dispatch() {
    assert!(is_full_upload_stream_command("catalog:file:replace"));
    assert!(is_full_upload_stream_command("catalog:derivative:write"));
    assert!(!is_full_upload_stream_command("catalog:upload"));
    assert!(!is_full_upload_stream_command("catalog:secret:write"));
}

#[test]
fn download_stream_commands_include_range_downloads() {
    assert!(is_download_stream_command("catalog:download"));
    assert!(is_download_stream_command("catalog:downloadRange"));
    assert!(is_download_stream_command("catalog:secret:read"));
    assert!(is_download_stream_command("catalog:derivative:read"));
    assert!(is_download_stream_command("vault:export:download"));
    assert!(!is_download_stream_command("catalog:folder:batch"));
}
