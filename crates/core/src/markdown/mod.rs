//! Shared, storage-independent Markdown semantics. Never renders HTML, opens links,
//! reads a vault or retains a document. Callers own transient state and revocation.
mod autolinks;
mod links;
mod types;
pub use types::*;

use pulldown_cmark::{Alignment, CodeBlockKind, Event, LinkType, Options, Parser, Tag};
use sha2::{Digest, Sha256};
use std::{collections::HashMap, ops::Range};

/// Shared UTF8 source budget for native document reads, edits and parsing.
pub const MAX_DOCUMENT_BYTES: usize = 1024 * 1024;
const MAX_NODES: usize = 20_000;
const MAX_DEPTH: usize = 128;

#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum MarkdownError {
    #[error("Document exceeds the editor byte limit")]
    TooLarge,
    #[error("Document is too complex for preview; its source remains editable")]
    TooComplex,
    #[error("This Markdown extension cannot be previewed")]
    UnsupportedContent,
    #[error("The task marker no longer matches the reviewed document")]
    StaleTask,
}

fn source_digest(source: &str) -> String {
    format!("{:x}", Sha256::digest(source.as_bytes()))
}

pub fn parse(source: &str) -> Result<MarkdownDocument, MarkdownError> {
    if source.len() > MAX_DOCUMENT_BYTES {
        return Err(MarkdownError::TooLarge);
    }
    let options = Options::ENABLE_TABLES
        | Options::ENABLE_STRIKETHROUGH
        | Options::ENABLE_TASKLISTS
        | Options::ENABLE_WIKILINKS;
    let mut document = MarkdownDocument {
        source_digest: source_digest(source),
        roots: vec![],
        nodes: vec![],
    };
    let mut parents = Vec::<u32>::new();
    let mut headings = HashMap::<String, usize>::new();
    for (event, range) in Parser::new_ext(source, options).into_offset_iter() {
        if let Event::End(_) = event {
            if let Some(id) = parents.pop() {
                finish_heading(&mut document, id, source, &mut headings);
            }
            continue;
        }
        if document.nodes.len() >= MAX_NODES || parents.len() >= MAX_DEPTH {
            return Err(MarkdownError::TooComplex);
        }
        let container = matches!(&event, Event::Start(_));
        let content = match event {
            Event::Start(tag) => container_content(tag)?,
            Event::Text(text) => {
                if !parents.iter().any(|id| {
                    matches!(
                        document.nodes[*id as usize].content,
                        MarkdownContent::CodeBlock { .. }
                            | MarkdownContent::Link { .. }
                            | MarkdownContent::Image { .. }
                    )
                }) {
                    autolinks::append(
                        &mut document,
                        parents.last().copied(),
                        &text,
                        range,
                        source,
                    )?;
                    continue;
                }
                MarkdownContent::Text {
                    text: text.into_string(),
                }
            }
            Event::Code(text) => MarkdownContent::Code {
                text: text.into_string(),
            },
            Event::Html(text) | Event::InlineHtml(text) => MarkdownContent::Literal {
                text: text.into_string(),
            },
            Event::SoftBreak => MarkdownContent::SoftBreak,
            Event::HardBreak => MarkdownContent::HardBreak,
            Event::Rule => MarkdownContent::Rule,
            Event::TaskListMarker(checked) => MarkdownContent::Task { checked },
            _ => return Err(MarkdownError::UnsupportedContent),
        };
        let id = document.nodes.len() as u32;
        let node = MarkdownNode {
            start: range.start as u32,
            end: range.end as u32,
            children: vec![],
            content,
        };
        document.nodes.push(node);
        match parents.last() {
            Some(parent) => document.nodes[*parent as usize].children.push(id),
            None => document.roots.push(id),
        }
        if container {
            parents.push(id);
        }
    }
    Ok(document)
}

fn container_content(tag: Tag<'_>) -> Result<MarkdownContent, MarkdownError> {
    Ok(match tag {
        Tag::Paragraph | Tag::HtmlBlock => MarkdownContent::Paragraph,
        Tag::Heading { level, .. } => MarkdownContent::Heading {
            level: level as u8,
            anchor: String::new(),
        },
        Tag::BlockQuote(_) => MarkdownContent::Quote,
        Tag::CodeBlock(kind) => MarkdownContent::CodeBlock {
            language: match kind {
                CodeBlockKind::Fenced(language) => language.into_string(),
                CodeBlockKind::Indented => String::new(),
            },
        },
        Tag::List(first) => MarkdownContent::List { first },
        Tag::Item => MarkdownContent::Item,
        Tag::Table(alignments) => MarkdownContent::Table {
            alignments: alignments
                .into_iter()
                .map(|a| match a {
                    Alignment::None => MarkdownAlignment::None,
                    Alignment::Left => MarkdownAlignment::Left,
                    Alignment::Center => MarkdownAlignment::Center,
                    Alignment::Right => MarkdownAlignment::Right,
                })
                .collect(),
        },
        Tag::TableHead => MarkdownContent::TableHead,
        Tag::TableRow => MarkdownContent::TableRow,
        Tag::TableCell => MarkdownContent::TableCell,
        Tag::Emphasis => MarkdownContent::Emphasis,
        Tag::Strong => MarkdownContent::Strong,
        Tag::Strikethrough => MarkdownContent::Strikethrough,
        Tag::Link {
            link_type,
            dest_url,
            title,
            ..
        } => MarkdownContent::Link {
            target: links::target(
                &dest_url,
                matches!(link_type, LinkType::WikiLink { .. }),
                false,
            ),
            title: title.into_string(),
        },
        Tag::Image {
            dest_url, title, ..
        } => MarkdownContent::Image {
            target: links::target(&dest_url, false, true),
            title: title.into_string(),
        },
        _ => return Err(MarkdownError::UnsupportedContent),
    })
}

fn finish_heading(
    document: &mut MarkdownDocument,
    id: u32,
    source: &str,
    counts: &mut HashMap<String, usize>,
) {
    let node = &document.nodes[id as usize];
    if !matches!(node.content, MarkdownContent::Heading { .. }) {
        return;
    }
    // Web heading IDs use raw inline source, including emphasis/link syntax.
    let range = node
        .children
        .first()
        .zip(node.children.last())
        .map(|(first, last)| {
            document.nodes[*first as usize].start as usize
                ..document.nodes[*last as usize].end as usize
        })
        .unwrap_or(0..0);
    let base = links::heading_slug(&source[range]);
    let count = counts.entry(base.clone()).or_default();
    let slug = if *count == 0 {
        base
    } else {
        format!("{base}-{count}")
    };
    *count += 1;
    if let MarkdownContent::Heading { anchor, .. } = &mut document.nodes[id as usize].content {
        *anchor = slug;
    }
}

/// Edits only a marker emitted by the real parser for the exact reviewed source.
/// It does not save: the existing revision-checked document transaction does that.
pub fn toggle_task(
    source: &str,
    expected_digest: &str,
    marker_start: u32,
    expected_checked: bool,
) -> Result<String, MarkdownError> {
    let document = parse(source)?;
    if document.source_digest != expected_digest {
        return Err(MarkdownError::StaleTask);
    }
    let marker = document
        .nodes
        .iter()
        .find(|node| {
            node.start == marker_start
                && node.content
                    == MarkdownContent::Task {
                        checked: expected_checked,
                    }
        })
        .ok_or(MarkdownError::StaleTask)?;
    let range = Range {
        start: marker.start as usize,
        end: marker.end as usize,
    };
    let text = &source[range.clone()];
    if !matches!(text, "[ ]" | "[x]" | "[X]") {
        return Err(MarkdownError::StaleTask);
    }
    let mut result = source.to_owned();
    result.replace_range(range, if expected_checked { "[ ]" } else { "[x]" });
    Ok(result)
}

#[cfg(test)]
mod tests;
