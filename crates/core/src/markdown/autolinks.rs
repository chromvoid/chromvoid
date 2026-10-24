//! Bare URLs/emails, matching the existing preview's linkify behavior. Never runs
//! inside code, explicit links or images; opening remains an explicit UI action.
use super::*;
use linkify::{LinkFinder, LinkKind};
use std::sync::OnceLock;

pub(super) fn append(
    document: &mut MarkdownDocument,
    parent: Option<u32>,
    text: &str,
    source_range: Range<usize>,
    source: &str,
) -> Result<(), MarkdownError> {
    static FINDER: OnceLock<LinkFinder> = OnceLock::new();
    let finder = FINDER.get_or_init(|| {
        let mut finder = LinkFinder::new();
        finder.url_must_have_scheme(false);
        finder
    });
    let exact_source_range = &source[source_range.clone()] == text;
    for span in finder.spans(text) {
        // Entity/escape decoding can change byte lengths. Keep the parser's enclosing
        // source range in that case; only task nodes expose actionable byte offsets.
        let range = if exact_source_range {
            source_range.start + span.start()..source_range.start + span.end()
        } else {
            source_range.clone()
        };
        let text = span.as_str().to_owned();
        let target = span.kind().map(|kind| {
            let href = match kind {
                LinkKind::Email => format!("mailto:{text}"),
                _ if text.contains("://") => text.clone(),
                _ => format!("http://{text}"),
            };
            links::target(&href, false, false)
        });
        let parent = if let Some(target) = target {
            Some(push(
                document,
                parent,
                range.clone(),
                MarkdownContent::Link {
                    target,
                    title: String::new(),
                },
            )?)
        } else {
            parent
        };
        push(document, parent, range, MarkdownContent::Text { text })?;
    }
    Ok(())
}

fn push(
    document: &mut MarkdownDocument,
    parent: Option<u32>,
    range: Range<usize>,
    content: MarkdownContent,
) -> Result<u32, MarkdownError> {
    if document.nodes.len() >= MAX_NODES {
        return Err(MarkdownError::TooComplex);
    }
    let id = document.nodes.len() as u32;
    document.nodes.push(MarkdownNode {
        start: range.start as u32,
        end: range.end as u32,
        children: vec![],
        content,
    });
    if let Some(parent) = parent {
        document.nodes[parent as usize].children.push(id);
    } else {
        document.roots.push(id);
    }
    Ok(id)
}
