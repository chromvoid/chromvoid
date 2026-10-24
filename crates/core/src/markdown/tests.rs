use super::*;

#[test]
fn preview_preserves_structure_and_visible_unsupported_content() {
    let source = "# План **дня**\n\n> Quote with *emphasis* and ~~old~~.\n\n3. third\n4. fourth\n\n| A | B |\n| :- | -: |\n| one | two |\n\n```swift\nprint(\"hello\")\n```\n\n<script>alert(1)</script>\n";
    let document = parse(source).unwrap();
    assert!(document.nodes.iter().any(|n| n.content
        == MarkdownContent::Heading {
            level: 1,
            anchor: "план-дня".into()
        }));
    assert!(document
        .nodes
        .iter()
        .any(|n| n.content == MarkdownContent::List { first: Some(3) }));
    assert!(document.nodes.iter().any(|n| n.content
        == MarkdownContent::Table {
            alignments: vec![MarkdownAlignment::Left, MarkdownAlignment::Right]
        }));
    assert!(document.nodes.iter().any(|n| n.content
        == MarkdownContent::CodeBlock {
            language: "swift".into()
        }));
    assert!(document.nodes.iter().any(|n| matches!(&n.content, MarkdownContent::Literal { text } if text == "<script>alert(1)</script>\n")));
    for (id, node) in document.nodes.iter().enumerate() {
        assert!(source.get(node.start as usize..node.end as usize).is_some());
        assert!(node
            .children
            .iter()
            .all(|child| *child as usize > id && (*child as usize) < document.nodes.len()));
    }
    let restored: MarkdownDocument =
        serde_json::from_slice(&serde_json::to_vec(&document).unwrap()).unwrap();
    assert_eq!(restored.nodes.len(), document.nodes.len());
}

#[test]
fn headings_keep_web_normalization_and_duplicate_suffixes() {
    let source = "# Café!\n# Café!\n# Раздел 2\n# !!!\nTitle **bold**\n----------\n";
    let doc = parse(source).unwrap();
    let anchors: Vec<_> = doc
        .nodes
        .iter()
        .filter_map(|n| {
            if let MarkdownContent::Heading { anchor, .. } = &n.content {
                Some(anchor.as_str())
            } else {
                None
            }
        })
        .collect();
    assert_eq!(
        anchors,
        ["cafe", "cafe-1", "раздел-2", "section", "title-bold"]
    );
}

#[test]
fn tasks_only_change_the_reviewed_marker_preserving_unicode_crlf_and_code() {
    let source = "Привет 😀\r\n\r\n- [ ] задача\r\n  - [X] другая\r\n\r\n```\r\n- [ ] code\r\n```\r\n`[ ] inline`\r\n";
    let doc = parse(source).unwrap();
    let tasks: Vec<_> = doc
        .nodes
        .iter()
        .filter(|n| matches!(n.content, MarkdownContent::Task { .. }))
        .collect();
    assert_eq!(tasks.len(), 2);
    let changed = toggle_task(source, &doc.source_digest, tasks[0].start, false).unwrap();
    assert_eq!(changed, source.replacen("- [ ] задача", "- [x] задача", 1));
    assert_eq!(
        toggle_task(&changed, &doc.source_digest, tasks[1].start, true),
        Err(MarkdownError::StaleTask)
    );
    assert_eq!(
        toggle_task(source, &doc.source_digest, tasks[0].start, true),
        Err(MarkdownError::StaleTask)
    );
    assert_eq!(
        toggle_task(
            source,
            &doc.source_digest,
            source.find("[ ] code").unwrap() as u32,
            false
        ),
        Err(MarkdownError::StaleTask)
    );
    assert_eq!(
        toggle_task(source, &doc.source_digest, tasks[1].start, true).unwrap(),
        source.replace("[X] другая", "[ ] другая")
    );
}

#[test]
fn links_preserve_catalog_note_anchor_and_external_boundaries() {
    let source = "[file](/Docs/file.pdf) [note](../Caf%C3%A9.md#Résumé) [[Journal|Today]] [local](#Раздел%202) [web](https://example.com) ![vault](/Images/photo.png) ![remote](https://example.com/a.png) [bad](javascript:alert) [escaped](%6Aavascript:alert)";
    let doc = parse(source).unwrap();
    let targets: Vec<_> = doc
        .nodes
        .iter()
        .filter_map(|n| match &n.content {
            MarkdownContent::Link { target, .. } | MarkdownContent::Image { target, .. } => {
                Some(target)
            }
            _ => None,
        })
        .collect();
    assert_eq!(
        targets,
        vec![
            &MarkdownTarget::Catalog {
                path: "/Docs/file.pdf".into()
            },
            &MarkdownTarget::Note {
                path: "../Café.md".into(),
                anchor: Some("resume".into()),
                wiki: false
            },
            &MarkdownTarget::Note {
                path: "Journal".into(),
                anchor: None,
                wiki: true
            },
            &MarkdownTarget::Anchor {
                anchor: "раздел-2".into()
            },
            &MarkdownTarget::External {
                url: "https://example.com".into()
            },
            &MarkdownTarget::Catalog {
                path: "/Images/photo.png".into()
            },
            &MarkdownTarget::Blocked {
                raw: "https://example.com/a.png".into()
            },
            &MarkdownTarget::Blocked {
                raw: "javascript:alert".into()
            },
            &MarkdownTarget::Blocked {
                raw: "%6Aavascript:alert".into()
            },
        ]
    );
    assert!(doc.nodes.iter().any(|n| n.content
        == MarkdownContent::Text {
            text: "Today".into()
        }));
}

#[test]
fn preview_limits_fail_explicitly_without_truncating_source() {
    assert!(parse(&"a".repeat(MAX_DOCUMENT_BYTES)).is_ok());
    assert!(matches!(
        parse(&"a".repeat(MAX_DOCUMENT_BYTES + 1)),
        Err(MarkdownError::TooLarge)
    ));
    assert!(matches!(
        parse(&"x\n\n".repeat(MAX_NODES)),
        Err(MarkdownError::TooComplex)
    ));
    assert!(matches!(
        parse(&format!("{} text", "> ".repeat(MAX_DEPTH))),
        Err(MarkdownError::TooComplex)
    ));
    let empty = parse("").unwrap();
    assert!(empty.nodes.is_empty() && empty.roots.is_empty());
}

#[test]
fn bare_links_are_actionable_without_linkifying_code_or_nesting_links() {
    let doc = parse("Visit https://example.com, example.org and alice@example.com.\n\n`https://code.example`\n\n```\nhttps://fence.example\n```\n[https://label.example](https://target.example)\n").unwrap();
    let urls: Vec<_> = doc
        .nodes
        .iter()
        .filter_map(|n| match &n.content {
            MarkdownContent::Link {
                target: MarkdownTarget::External { url },
                ..
            } => Some(url.as_str()),
            _ => None,
        })
        .collect();
    assert_eq!(
        urls,
        [
            "https://example.com",
            "http://example.org",
            "mailto:alice@example.com",
            "https://target.example"
        ]
    );
}
