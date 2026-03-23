//! Tests for deep catalog hierarchies and complex tree operations

mod test_helpers;

use test_helpers::*;

#[test]
fn test_deep_hierarchy_50_levels() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "test");

    let depth = 50;
    let mut current_path = String::from("/");

    for i in 0..depth {
        let name = format!("level{}", i);
        let response = create_dir_at(&mut router, &current_path, &name);
        assert_rpc_ok(&response);

        if current_path == "/" {
            current_path = format!("/{}", name);
        } else {
            current_path = format!("{}/{}", current_path, name);
        }
    }

    let response = list_dir(&mut router, &current_path);
    assert_rpc_ok(&response);

    let items = get_items(&response);
    assert!(items.is_empty(), "deepest level should be empty");
}

#[test]
fn test_wide_directory_100_children() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "test");

    let child_count = 100;

    for i in 0..child_count {
        let response = create_dir(&mut router, &format!("dir_{:03}", i));
        assert_rpc_ok(&response);
    }

    let items = get_items(&list_dir(&mut router, "/"));
    assert_eq!(items.len(), child_count);
}

#[test]
fn test_list_deep_path() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "test");

    create_dir(&mut router, "a");
    create_dir_at(&mut router, "/a", "b");
    create_dir_at(&mut router, "/a/b", "c");
    create_dir_at(&mut router, "/a/b/c", "d");
    create_dir_at(&mut router, "/a/b/c/d", "e");

    for path in ["/a", "/a/b", "/a/b/c", "/a/b/c/d", "/a/b/c/d/e"] {
        let response = list_dir(&mut router, path);
        assert_rpc_ok(&response);
    }
}

#[test]
fn test_delete_deep_tree() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "test");

    let root_response = create_dir(&mut router, "root");
    let root_id = get_node_id(&root_response);

    create_dir_at(&mut router, "/root", "child1");
    create_dir_at(&mut router, "/root/child1", "grandchild1");
    create_dir_at(&mut router, "/root/child1", "grandchild2");
    create_dir_at(&mut router, "/root", "child2");
    create_dir_at(&mut router, "/root/child2", "grandchild3");

    let response = delete_node(&mut router, root_id);
    assert_rpc_ok(&response);

    for path in ["/root", "/root/child1", "/root/child2"] {
        let response = list_dir(&mut router, path);
        assert_rpc_error(&response, "NODE_NOT_FOUND");
    }
}

#[test]
fn test_move_deep_subtree_preserves_structure() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "test");

    create_dir(&mut router, "source");
    create_dir_at(&mut router, "/source", "level1");
    create_dir_at(&mut router, "/source/level1", "level2");
    create_dir_at(&mut router, "/source/level1/level2", "level3");
    create_dir_at(&mut router, "/source/level1/level2/level3", "level4");

    create_dir(&mut router, "dest");

    let source_items = get_items(&list_dir(&mut router, "/source"));
    let level1_id = find_item_by_name(&source_items, "level1")
        .unwrap()
        .get("node_id")
        .unwrap()
        .as_u64()
        .unwrap();

    let response = move_node(&mut router, level1_id, "/dest");
    assert_rpc_ok(&response);

    for path in [
        "/dest/level1",
        "/dest/level1/level2",
        "/dest/level1/level2/level3",
        "/dest/level1/level2/level3/level4",
    ] {
        let response = list_dir(&mut router, path);
        assert_rpc_ok(&response);
    }

    let source_items = get_items(&list_dir(&mut router, "/source"));
    assert!(source_items.is_empty());
}

#[test]
fn test_path_with_trailing_slash() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "test");

    create_dir(&mut router, "folder");

    let response1 = list_dir(&mut router, "/folder");
    let response2 = list_dir(&mut router, "/folder/");

    assert_rpc_ok(&response1);
    assert_rpc_ok(&response2);
}

#[test]
fn test_complex_tree_operations() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "test");

    create_dir(&mut router, "projects");
    create_dir_at(&mut router, "/projects", "frontend");
    create_dir_at(&mut router, "/projects", "backend");
    create_dir_at(&mut router, "/projects/frontend", "src");
    create_dir_at(&mut router, "/projects/frontend", "tests");
    create_dir_at(&mut router, "/projects/backend", "api");
    create_dir_at(&mut router, "/projects/backend", "models");

    create_dir(&mut router, "archive");

    let frontend_items = get_items(&list_dir(&mut router, "/projects/frontend"));
    let src_id = find_item_by_name(&frontend_items, "src")
        .unwrap()
        .get("node_id")
        .unwrap()
        .as_u64()
        .unwrap();

    let response = move_node(&mut router, src_id, "/projects/backend");
    assert_rpc_ok(&response);

    let backend_items = get_items(&list_dir(&mut router, "/projects/backend"));
    let names = get_item_names(&backend_items);
    assert!(names.contains(&"src".to_string()));
    assert!(names.contains(&"api".to_string()));
    assert!(names.contains(&"models".to_string()));
}

#[test]
fn test_sibling_operations() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "test");

    let ids: Vec<u64> = (1..=5)
        .map(|i| {
            let response = create_dir(&mut router, &format!("sibling_{}", i));
            get_node_id(&response)
        })
        .collect();

    let response = rename_node(&mut router, ids[0], "renamed_sibling");
    assert_rpc_ok(&response);

    let response = delete_node(&mut router, ids[4]);
    assert_rpc_ok(&response);

    let items = get_items(&list_dir(&mut router, "/"));
    assert_eq!(items.len(), 4);

    let names = get_item_names(&items);
    assert!(names.contains(&"renamed_sibling".to_string()));
    assert!(names.contains(&"sibling_2".to_string()));
}

#[test]
fn test_tree_node_counts() {
    let (mut router, _temp_dir) = create_test_router();
    unlock_vault(&mut router, "test");

    create_dir(&mut router, "a");
    create_dir_at(&mut router, "/a", "b1");
    create_dir_at(&mut router, "/a", "b2");
    create_dir_at(&mut router, "/a/b1", "c1");
    create_dir_at(&mut router, "/a/b1", "c2");
    create_dir_at(&mut router, "/a/b1", "c3");

    let root_items = get_items(&list_dir(&mut router, "/"));
    assert_eq!(root_items.len(), 1);

    let a_items = get_items(&list_dir(&mut router, "/a"));
    assert_eq!(a_items.len(), 2);

    let b1_items = get_items(&list_dir(&mut router, "/a/b1"));
    assert_eq!(b1_items.len(), 3);
}
