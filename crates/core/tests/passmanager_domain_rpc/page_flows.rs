use super::support::*;
use chromvoid_core::rpc::types::PassmanagerEntryPageResponse;
use serde_json::json;

fn page(
    router: &mut RpcRouter,
    offset: u32,
    limit: u32,
    query: &str,
) -> PassmanagerEntryPageResponse {
    let response = router.handle(&RpcRequest::new(
        "passmanager:entry:page",
        json!({"offset":offset,"limit":limit,"query":query}),
    ));
    assert_rpc_ok(&response);
    serde_json::from_value(response.result().unwrap().clone()).unwrap()
}

#[test]
fn page_requires_vault_and_valid_bounds_and_distinguishes_empty() {
    let (mut router, _tmp) = create_test_router();
    let request = json!({"offset":0,"limit":50,"query":""});
    assert_rpc_error(
        &router.handle(&RpcRequest::new("passmanager:entry:page", request)),
        "VAULT_REQUIRED",
    );
    assert_rpc_ok(&unlock_vault(&mut router, "page-test-vault"));
    assert!(page(&mut router, 0, 50, "").entries.is_empty());
    for data in [
        json!({"offset":0,"limit":0,"query":""}),
        json!({"offset":0,"limit":101,"query":""}),
        json!({"offset":-1,"limit":1,"query":""}),
        json!({"offset":0,"limit":1,"query":"","secret":true}),
        json!({"offset":0,"limit":1,"query":"x".repeat(4097)}),
    ] {
        assert_rpc_error(
            &router.handle(&RpcRequest::new("passmanager:entry:page", data)),
            "EMPTY_PAYLOAD",
        );
    }
}

#[test]
fn pages_cover_catalog_once_search_metadata_and_never_return_secrets() {
    let (mut router, _tmp) = create_test_router();
    assert_rpc_ok(&unlock_vault(&mut router, "page-test-vault"));
    for (id, title, username, urls) in [
        (
            "first",
            "Почта",
            "Алиса",
            json!([{"value":"https://MAIL.example","type":"domain"}]),
        ),
        ("second", "Work", "bob", json!(["https://legacy.example"])),
        ("third", "Personal", "carol", json!([])),
    ] {
        assert_rpc_ok(&router.handle(&RpcRequest::new("passmanager:entry:create", json!({"entry_id":id,"title":title,"username":username,"group_path":"/Team/Nested","urls":urls,"secrets":{"password":"never-return-password","note":"never-return-note"}}))));
    }
    let mut ids = std::collections::BTreeSet::new();
    let mut offset = 0;
    loop {
        let result = page(&mut router, offset, 1, "");
        assert!(result.entries.len() <= 1);
        for entry in &result.entries {
            assert!(ids.insert(entry.id.clone()));
            assert_eq!(entry.group_path, "/Team/Nested");
            assert_eq!(entry.entry_type, "login");
        }
        let wire = serde_json::to_value(&result).unwrap();
        for entry in wire["entries"].as_array().unwrap() {
            let keys: std::collections::BTreeSet<_> = entry
                .as_object()
                .unwrap()
                .keys()
                .map(String::as_str)
                .collect();
            // `website` appears only for entries with a website; `has_codes` only when true.
            let mut expected: std::collections::BTreeSet<_> =
                ["id", "title", "username", "entry_type", "group_path"]
                    .into_iter()
                    .collect();
            if entry["id"] != "third" {
                expected.insert("website");
            }
            assert_eq!(keys, expected);
        }
        match result.next_offset {
            Some(next) => {
                assert!(next > offset);
                offset = next;
            }
            None => break,
        }
    }
    assert_eq!(ids.len(), 3);
    for query in ["ПОЧТА", "АЛИСА", " mail.EXAMPLE "] {
        assert_eq!(page(&mut router, 0, 50, query).entries[0].id, "first");
    }
    assert_eq!(
        page(&mut router, 0, 50, "legacy.example").entries[0].id,
        "second"
    );
    assert!(page(&mut router, 0, 50, "never-return-password")
        .entries
        .is_empty());
    assert!(page(&mut router, 0, 50, "never-return-note")
        .entries
        .is_empty());
    assert_rpc_ok(&router.handle(&RpcRequest::new("vault:lock", json!({}))));
    assert_rpc_error(
        &router.handle(&RpcRequest::new(
            "passmanager:entry:page",
            json!({"offset":0,"limit":1,"query":""}),
        )),
        "VAULT_REQUIRED",
    );
}

#[test]
fn pages_bound_encoded_bytes_without_truncating_metadata() {
    let (mut router, _tmp) = create_test_router();
    assert_rpc_ok(&unlock_vault(&mut router, "page-size-vault"));
    let username = "x".repeat(300_000);
    for id in ["large-one", "large-two"] {
        assert_rpc_ok(&router.handle(&RpcRequest::new(
            "passmanager:entry:create",
            json!({"entry_id":id,"title":id,"username":username}),
        )));
    }
    let first = page(&mut router, 0, 100, "");
    assert_eq!(first.entries.len(), 1);
    assert_eq!(first.entries[0].username.len(), username.len());
    assert!(serde_json::to_vec(&first).unwrap().len() < 512 * 1024);
    let second = page(&mut router, first.next_offset.unwrap(), 100, "");
    assert_eq!(second.entries.len(), 1);
    assert_ne!(first.entries[0].id, second.entries[0].id);
    assert_eq!(second.entries[0].username, username);
    assert!(second.next_offset.is_none());
    assert_rpc_ok(&router.handle(&RpcRequest::new(
        "passmanager:entry:create",
        json!({"entry_id":"oversized","title":"Oversized metadata","username":"z".repeat(600_000)}),
    )));
    assert_rpc_error(
        &router.handle(&RpcRequest::new(
            "passmanager:entry:page",
            json!({"offset":0,"limit":100,"query":"zzz"}),
        )),
        "INTERNAL_ERROR",
    );
}

#[test]
fn catalog_order_is_global_stable_and_composes_with_filters_and_tag_search() {
    let (mut router, _tmp) = create_test_router();
    assert_rpc_ok(&unlock_vault(&mut router, "ordered-catalog"));
    for (id, title, username, created, updated, tags, group) in [
        ("z", "Zulu", "alpha", 10, 30, json!(["Работа"]), "/Team"),
        ("a", "Alpha", "zulu", 30, 10, json!(["Personal"]), "/Team"),
        ("b", "Beta", "beta", 20, 20, json!(["Работа"]), "/Elsewhere"),
    ] {
        assert_rpc_ok(&router.handle(&RpcRequest::new("passmanager:entry:create", json!({
            "entry_id":id,"title":title,"username":username,"created_ts":created,"updated_ts":updated,
            "tags":tags,"group_path":group,"urls":[format!("https://{username}.example")],
            "secrets":{"password":"never-return-secret"}
        }))));
    }
    for (sort, descending, expected) in [
        ("name", false, vec!["a", "b", "z"]),
        ("name", true, vec!["z", "b", "a"]),
        ("username", false, vec!["z", "b", "a"]),
        ("website", true, vec!["a", "b", "z"]),
        ("created", true, vec!["a", "b", "z"]),
        ("modified", true, vec!["z", "b", "a"]),
    ] {
        let mut offset = 0;
        let mut found = Vec::new();
        loop {
            let result = router.handle(&RpcRequest::new(
                "passmanager:entry:page",
                json!({
                    "offset":offset,"limit":1,"query":"","sort":sort,"descending":descending
                }),
            ));
            assert_rpc_ok(&result);
            let wire = result.result().unwrap();
            for entry in wire["entries"].as_array().unwrap() {
                found.push(entry["id"].as_str().unwrap().to_owned());
            }
            if let Some(next) = wire["next_offset"].as_u64() {
                assert!(next > offset);
                offset = next;
            } else {
                break;
            }
        }
        assert_eq!(found, expected, "{sort} descending={descending}");
    }
    let result = router.handle(&RpcRequest::new("passmanager:entry:page", json!({
        "offset":0,"limit":50,"query":"РАБОТА","sort":"name","group_path":"/Team","entry_type":"login"
    })));
    assert_rpc_ok(&result);
    assert_eq!(result.result().unwrap()["entries"][0]["id"], "z");
    assert_eq!(
        result.result().unwrap()["entries"]
            .as_array()
            .unwrap()
            .len(),
        1
    );
    let none = router.handle(&RpcRequest::new(
        "passmanager:entry:page",
        json!({
            "offset":0,"limit":50,"query":"","entry_type":"payment_card"
        }),
    ));
    assert_rpc_ok(&none);
    assert!(none.result().unwrap()["entries"]
        .as_array()
        .unwrap()
        .is_empty());
    for invalid in [json!({"sort":"password"}), json!({"entry_type":"unknown"})] {
        let mut request = json!({"offset":0,"limit":50,"query":""});
        request
            .as_object_mut()
            .unwrap()
            .extend(invalid.as_object().unwrap().clone());
        assert_rpc_error(
            &router.handle(&RpcRequest::new("passmanager:entry:page", request)),
            "EMPTY_PAYLOAD",
        );
    }
}

#[test]
fn quick_filters_cover_all_pages_and_compose_without_exposing_or_mutating_secrets() {
    let (mut router, _tmp) = create_test_router();
    assert_rpc_ok(&unlock_vault(&mut router, "quick-filters-vault"));
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis() as u64;
    for (id, updated, otps, group) in [
        ("a-old", 1, json!([]), "/Team"),
        (
            "b-otp",
            now,
            json!([{"id":"code","secret":"JBSWY3DPEHPK3PXP"}]),
            "/Team/Nested",
        ),
        ("c-ssh", now, json!([]), "/Team"),
        (
            "d-both",
            now,
            json!([{"id":"code","secret":"JBSWY3DPEHPK3PXP"}]),
            "/Elsewhere",
        ),
        ("e-recent", now, json!([]), "/Team"),
    ] {
        assert_rpc_ok(&router.handle(&RpcRequest::new(
            "passmanager:entry:create",
            json!({
                "entry_id":id,"title":id,"updated_ts":updated,"otps":otps,"group_path":group,
                "tags":["Работа"],"secrets":{"password":"never-return-secret"}
            }),
        )));
    }
    for id in ["c-ssh", "d-both"] {
        assert_rpc_ok(&router.handle(&RpcRequest::new(
            "passmanager:ssh:key:update",
            json!({
                "key":{"id":id,"type":"ed25519","fingerprint":"SHA256:synthetic","sourceEntryId":id}
            }),
        )));
    }
    let before = router.handle(&RpcRequest::new("passmanager:root:export", json!({})));
    assert_rpc_ok(&before);
    for sort in [None, Some("name")] {
        for (filters, expected) in [
            (
                json!(["recent"]),
                vec!["b-otp", "c-ssh", "d-both", "e-recent"],
            ),
            (json!(["otp"]), vec!["b-otp", "d-both"]),
            (json!(["ssh"]), vec!["c-ssh", "d-both"]),
            (json!(["recent", "otp", "ssh"]), vec!["d-both"]),
        ] {
            let mut found = Vec::new();
            let mut offset = 0;
            loop {
                let result = router.handle(&RpcRequest::new(
                    "passmanager:entry:page",
                    json!({
                        "offset":offset,"limit":1,"query":"","sort":sort,"quick_filters":filters
                    }),
                ));
                assert_rpc_ok(&result);
                let page: PassmanagerEntryPageResponse =
                    serde_json::from_value(result.result().unwrap().clone()).unwrap();
                found.extend(page.entries.into_iter().map(|entry| entry.id));
                if let Some(next) = page.next_offset {
                    assert!(next > offset);
                    offset = next;
                } else {
                    break;
                }
            }
            found.sort();
            assert_eq!(found, expected);
        }
    }
    let result = router.handle(&RpcRequest::new("passmanager:entry:page", json!({
        "offset":0,"limit":50,"query":"B-OTP","group_path":"/Team","tag_key":"работа",
        "entry_type":"login","sort":"modified","descending":true,"quick_filters":["otp","recent"]
    })));
    assert_rpc_ok(&result);
    assert_eq!(
        result.result().unwrap()["entries"],
        json!([{
            "has_codes":true,"id":"b-otp","title":"b-otp","username":"","group_path":"/Team/Nested","entry_type":"login"
        }])
    );
    for invalid in [
        json!(["favorites"]),
        json!(["otp", "otp"]),
        json!("otp"),
        json!([false]),
        json!(["recent", "otp", "ssh", "recent"]),
    ] {
        assert_rpc_error(
            &router.handle(&RpcRequest::new(
                "passmanager:entry:page",
                json!({
                    "offset":0,"limit":50,"query":"","quick_filters":invalid
                }),
            )),
            "EMPTY_PAYLOAD",
        );
    }
    let after = router.handle(&RpcRequest::new("passmanager:root:export", json!({})));
    assert_rpc_ok(&after);
    assert_eq!(
        before.result().unwrap()["root"]["entries"],
        after.result().unwrap()["root"]["entries"]
    );
    assert_eq!(
        before.result().unwrap()["root"]["sshKeys"],
        after.result().unwrap()["root"]["sshKeys"]
    );
    assert_rpc_ok(&router.handle(&RpcRequest::new("vault:lock", json!({}))));
    assert_rpc_error(
        &router.handle(&RpcRequest::new(
            "passmanager:entry:page",
            json!({
                "offset":0,"limit":50,"query":"","quick_filters":["recent"]
            }),
        )),
        "VAULT_REQUIRED",
    );
}

#[test]
fn recent_filter_preserves_imported_timestamp_units() {
    let (mut router, _tmp) = create_test_router();
    assert_rpc_ok(&unlock_vault(&mut router, "recent-units-vault"));
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis() as u64;
    for (id, timestamp) in [
        ("seconds", now / 1000),
        ("millis", now),
        ("micros", now * 1000),
        ("nanos", now * 1_000_000),
        ("old", (now - 15 * 24 * 60 * 60 * 1000) / 1000),
    ] {
        assert_rpc_ok(&router.handle(&RpcRequest::new(
            "passmanager:entry:create",
            json!({
                "entry_id":id,"title":id,"updated_ts":timestamp
            }),
        )));
    }
    let result = router.handle(&RpcRequest::new(
        "passmanager:entry:page",
        json!({
            "offset":0,"limit":50,"query":"","sort":"name","quick_filters":["recent"]
        }),
    ));
    assert_rpc_ok(&result);
    let page: PassmanagerEntryPageResponse =
        serde_json::from_value(result.result().unwrap().clone()).unwrap();
    assert_eq!(
        page.entries
            .into_iter()
            .map(|entry| entry.id)
            .collect::<Vec<_>>(),
        ["micros", "millis", "nanos", "seconds"]
    );
}

#[test]
fn grouping_orders_the_whole_catalog_and_keeps_page_boundaries_inside_sections() {
    let (mut router, _tmp) = create_test_router();
    assert_rpc_ok(&unlock_vault(&mut router, "grouped-catalog"));
    const ANCHOR: u64 = 1_800_000_000_000;
    const DAY: u64 = 86_400_000;
    for (id, age, urls, otps, group) in [
        (
            "z",
            DAY / 2,
            json!(["https://www.example.com/path"]),
            json!([{"id":"code","secret":"JBSWY3DPEHPK3PXP"}]),
            "/Team",
        ),
        (
            "a",
            DAY / 4,
            json!(["http://EXAMPLE.com/another"]),
            json!([]),
            "/Team/Nested",
        ),
        (
            "b",
            DAY + DAY / 2,
            json!(["alpha.example"]),
            json!([]),
            "/Team",
        ),
        (
            "c",
            DAY * 4,
            json!([{"match":"regex","value":".*private.*"},{"match":"host","value":"www.example.com"}]),
            json!([]),
            "/Team",
        ),
        ("d", DAY * 20, json!([]), json!([]), "/Elsewhere"),
        (
            "e",
            DAY * 60,
            json!(["https://zebra.example"]),
            json!([]),
            "/Team",
        ),
        ("f", DAY * 400, json!([]), json!([]), "/Team"),
    ] {
        assert_rpc_ok(&router.handle(&RpcRequest::new("passmanager:entry:create", json!({
            "entry_id":id,"title":id,"updated_ts":ANCHOR-age,"urls":urls,"otps":otps,"group_path":group,
            "tags":["Работа"],"secrets":{"password":"never-return-password"}
        }))));
    }
    for (mode, descending, expected) in [
        (
            "website",
            false,
            vec![
                ("b", "alpha.example"),
                ("a", "example.com"),
                ("c", "example.com"),
                ("z", "example.com"),
                ("e", "zebra.example"),
                ("d", ""),
                ("f", ""),
            ],
        ),
        (
            "website",
            true,
            vec![
                ("b", "alpha.example"),
                ("z", "example.com"),
                ("c", "example.com"),
                ("a", "example.com"),
                ("e", "zebra.example"),
                ("f", ""),
                ("d", ""),
            ],
        ),
        (
            "modified",
            false,
            vec![
                ("a", "today"),
                ("z", "today"),
                ("b", "yesterday"),
                ("c", "week"),
                ("d", "month"),
                ("e", "year"),
                ("f", "older"),
            ],
        ),
        (
            "security",
            false,
            vec![
                ("z", "otp"),
                ("a", "basic"),
                ("b", "basic"),
                ("c", "basic"),
                ("d", "basic"),
                ("e", "basic"),
                ("f", "basic"),
            ],
        ),
    ] {
        let mut offset = 0;
        let mut found = Vec::new();
        loop {
            let result = router.handle(&RpcRequest::new(
                "passmanager:entry:page",
                json!({
                    "offset":offset,"limit":2,"query":"","sort":"name","descending":descending,
                    "group_by":mode,"grouping_time":if mode == "modified" {Some(ANCHOR)} else {None}
                }),
            ));
            assert_rpc_ok(&result);
            let page: PassmanagerEntryPageResponse =
                serde_json::from_value(result.result().unwrap().clone()).unwrap();
            found.extend(
                page.entries
                    .into_iter()
                    .map(|entry| (entry.id, entry.group_key.unwrap())),
            );
            if let Some(next) = page.next_offset {
                assert!(next > offset);
                offset = next;
            } else {
                break;
            }
        }
        assert_eq!(
            found,
            expected
                .into_iter()
                .map(|(id, key)| (id.to_owned(), key.to_owned()))
                .collect::<Vec<_>>(),
            "{mode} descending={descending}"
        );
    }
    let filtered = router.handle(&RpcRequest::new(
        "passmanager:entry:page",
        json!({
            "offset":0,"limit":2,"query":"Z","sort":"name","group_by":"website",
            "group_path":"/Team","tag_key":"работа","quick_filters":["otp"]
        }),
    ));
    assert_rpc_ok(&filtered);
    assert_eq!(
        filtered.result().unwrap()["entries"],
        json!([{
            "has_codes":true,"website":"example.com",
            "id":"z","title":"z","username":"","entry_type":"login","group_path":"/Team","group_key":"example.com"
        }])
    );
    for invalid in [
        json!({"group_by":"password"}),
        json!({"group_by":"modified"}),
        json!({"group_by":"modified","grouping_time":0}),
        json!({"group_by":"website","grouping_time":ANCHOR}),
        json!({"grouping_time":ANCHOR}),
    ] {
        let mut request = json!({"offset":0,"limit":50,"query":""});
        request
            .as_object_mut()
            .unwrap()
            .extend(invalid.as_object().unwrap().clone());
        assert_rpc_error(
            &router.handle(&RpcRequest::new("passmanager:entry:page", request)),
            "EMPTY_PAYLOAD",
        );
    }
    // A caller may group without choosing a within-group sort; all entries still appear once.
    let grouped = router.handle(&RpcRequest::new(
        "passmanager:entry:page",
        json!({
            "offset":0,"limit":50,"query":"","group_by":"security"
        }),
    ));
    assert_rpc_ok(&grouped);
    let page: PassmanagerEntryPageResponse =
        serde_json::from_value(grouped.result().unwrap().clone()).unwrap();
    assert_eq!(page.entries.first().unwrap().id, "z");
    assert_eq!(page.entries.len(), 7);
    assert!(page.entries[1..]
        .iter()
        .all(|entry| entry.group_key.as_deref() == Some("basic")));
}

#[test]
fn sorted_pages_carry_icon_website_codes_and_the_total() {
    let (mut router, _tmp) = create_test_router();
    assert_rpc_ok(&unlock_vault(&mut router, "page-test-vault"));
    let put = router.handle(&RpcRequest::new(
        "passmanager:icon:put",
        json!({"content_base64": PNG_ICON_A_BASE64, "mime_type": "image/png"}),
    ));
    assert_rpc_ok(&put);
    let icon_ref = put.result().unwrap()["icon_ref"]
        .as_str()
        .unwrap()
        .to_owned();
    assert_rpc_ok(&router.handle(&RpcRequest::new("passmanager:entry:create", json!({"entry_id":"mail","title":"Mail","username":"alice","group_path":"/","urls":["https://www.Mail.example/login"],"otps":[{"id":"otp","type":"totp"}],"icon_ref":icon_ref,"secrets":{"password":"synthetic"}}))));
    assert_rpc_ok(&router.handle(&RpcRequest::new("passmanager:entry:create", json!({"entry_id":"bare","title":"Bare","username":"","group_path":"/","secrets":{"password":"synthetic"}}))));

    let sorted = |router: &mut RpcRouter, query: &str| -> PassmanagerEntryPageResponse {
        let response = router.handle(&RpcRequest::new(
            "passmanager:entry:page",
            json!({"offset":0,"limit":50,"query":query,"sort":"name"}),
        ));
        assert_rpc_ok(&response);
        serde_json::from_value(response.result().unwrap().clone()).unwrap()
    };
    let all = sorted(&mut router, "");
    assert_eq!(all.total_count, Some(2));
    let by_id = |id: &str| all.entries.iter().find(|e| e.id == id).unwrap().clone();
    let mail = by_id("mail");
    assert_eq!(mail.website.as_deref(), Some("mail.example"));
    assert_eq!(mail.has_codes, Some(true));
    assert_eq!(mail.icon_ref.as_deref(), Some(icon_ref.as_str()));
    let bare = by_id("bare");
    assert_eq!(bare.website, None);
    assert_eq!(bare.has_codes, None);
    assert_eq!(bare.icon_ref, None);

    let filtered = sorted(&mut router, "mail");
    assert_eq!(filtered.total_count, Some(1));
    assert_eq!(filtered.entries.len(), 1);
    // Catalog order stops reading at the page, so no total is known there.
    assert_eq!(page(&mut router, 0, 1, "").total_count, None);
}
