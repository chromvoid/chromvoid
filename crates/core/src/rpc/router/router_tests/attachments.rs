use super::fixtures::*;
use super::*;
use crate::markdown::{MarkdownContent, MarkdownTarget};
use crate::rpc::types::CatalogAttachmentResponse;
use serde_json::json;

fn prepare(router: &mut RpcRouter, folder: &str, name: &str) -> CatalogAttachmentResponse {
    let response = router.handle(&RpcRequest::new(
        "catalog:attachment:prepare",
        json!({
            "folder_path":folder, "file_name":name, "mime_type":"image/png"
        }),
    ));
    assert!(response.is_ok(), "{response:?}");
    serde_json::from_value(response.result().unwrap().clone()).unwrap()
}

#[test]
fn attachments_prepare_nested_folder_and_roundtrip_escaped_links_without_writing_files() {
    let (mut router, _temp) = create_test_router();
    unlock_test_router(&mut router);
    let first = prepare(
        &mut router,
        " /Заметки//Фото 100% (дом)/ ",
        "Поездка [1]_!.png",
    );
    assert_eq!(first.parent_path, "/Заметки/Фото 100% (дом)");
    assert!(first.name.starts_with("Поездка--1-_-"));
    assert!(first.name.ends_with(".png"));
    assert!(router
        .session_mut()
        .unwrap()
        .catalog()
        .find_by_path(&first.parent_path)
        .unwrap()
        .is_dir());
    assert!(router
        .session_mut()
        .unwrap()
        .catalog()
        .find_by_path(&first.path)
        .is_none());
    let parsed = crate::markdown::parse(&first.markdown).unwrap();
    let targets: Vec<_> = parsed
        .nodes
        .iter()
        .filter_map(|node| {
            if let MarkdownContent::Image { target, .. } = &node.content {
                Some(target)
            } else {
                None
            }
        })
        .collect();
    assert_eq!(
        targets,
        vec![&MarkdownTarget::Catalog {
            path: first.path.clone()
        }]
    );
    let second = prepare(&mut router, &first.parent_path, "Поездка [1]_!.png");
    assert_ne!(first.name, second.name);
    // Normal create-only upload owns the final write; preparation is not a file reservation.
    let upload = RpcRequest::new(
        "catalog:upload",
        json!({
            "parent_path":first.parent_path, "name":first.name, "mime_type":first.mime_type,
            "size":3, "offset":0, "finish":true, "create_only":true
        }),
    );
    let RpcReply::Json(written) =
        router.handle_with_stream(&upload, Some(RpcInputStream::from_bytes(vec![1, 2, 3])))
    else {
        panic!("upload")
    };
    assert!(written.is_ok(), "{written:?}");
    let RpcReply::Json(collision) =
        router.handle_with_stream(&upload, Some(RpcInputStream::from_bytes(vec![9, 9, 9])))
    else {
        panic!("collision")
    };
    assert!(!collision.is_ok());
    let node = router
        .session_mut()
        .unwrap()
        .catalog()
        .find_by_path(&first.path)
        .unwrap();
    assert_eq!(node.size, 3);
}

#[test]
fn attachments_reject_invalid_and_system_destinations_and_nonimages_without_catalog_changes() {
    let (mut router, _temp) = create_test_router();
    let locked = router.handle(&RpcRequest::new(
        "catalog:attachment:prepare",
        json!({
            "folder_path":"/attachments", "file_name":"a.png", "mime_type":"image/png"
        }),
    ));
    assert!(!locked.is_ok());
    unlock_test_router(&mut router);
    for folder in [
        "/",
        "relative",
        "/created/../bad",
        "/created/./bad",
        "/created/\\bad",
        "/created/\nbad",
        "/.passmanager/images",
        "/.wallet/images",
    ] {
        let result = router.handle(&RpcRequest::new(
            "catalog:attachment:prepare",
            json!({
                "folder_path":folder,"file_name":"a.png","mime_type":"image/png"
            }),
        ));
        assert!(!result.is_ok(), "{folder}: {result:?}");
    }
    let result = router.handle(&RpcRequest::new(
        "catalog:attachment:prepare",
        json!({
            "folder_path":"/created", "file_name":"a.txt", "mime_type":"text/plain"
        }),
    ));
    assert!(!result.is_ok());
    let listed = router.handle(&RpcRequest::new("catalog:list", json!({"path":"/"})));
    assert_eq!(listed.result().unwrap()["items"], json!([]));
}

#[test]
fn attachments_do_not_replace_a_file_on_the_folder_path_and_support_extensionless_images() {
    let (mut router, _temp) = create_test_router();
    unlock_test_router(&mut router);
    prepare_test_image(&mut router, "existing", 2);
    let result = router.handle(&RpcRequest::new(
        "catalog:attachment:prepare",
        json!({
            "folder_path":"/existing/child", "file_name":"a.png", "mime_type":"image/png"
        }),
    ));
    assert!(!result.is_ok());
    let existing = router
        .session_mut()
        .unwrap()
        .catalog()
        .find_by_path("/existing")
        .unwrap();
    assert!(existing.is_file());
    assert_eq!(existing.size, 2);
    let image = prepare(&mut router, "/attachments", "clipboard");
    assert!(image.name.starts_with("clipboard-"));
    assert!(image.name.ends_with(".png"));
}
