use serde::{Deserialize, Serialize};

/// Pure, transient presentation data. IDs index `nodes`; children always follow parents.
#[derive(Debug, Serialize, Deserialize)]
#[cfg_attr(feature = "mobile-schema", derive(schemars::JsonSchema))]
pub struct MarkdownDocument {
    pub source_digest: String,
    pub roots: Vec<u32>,
    pub nodes: Vec<MarkdownNode>,
}

#[derive(Debug, Serialize, Deserialize)]
#[cfg_attr(feature = "mobile-schema", derive(schemars::JsonSchema))]
pub struct MarkdownNode {
    pub start: u32,
    pub end: u32,
    pub children: Vec<u32>,
    pub content: MarkdownContent,
}

#[derive(Debug, Serialize, Deserialize, PartialEq)]
#[serde(tag = "kind", rename_all = "snake_case")]
#[cfg_attr(feature = "mobile-schema", derive(schemars::JsonSchema))]
pub enum MarkdownContent {
    Paragraph,
    Heading {
        level: u8,
        anchor: String,
    },
    Quote,
    CodeBlock {
        language: String,
    },
    List {
        first: Option<u64>,
    },
    Item,
    Table {
        alignments: Vec<MarkdownAlignment>,
    },
    TableHead,
    TableRow,
    TableCell,
    Emphasis,
    Strong,
    Strikethrough,
    Link {
        target: MarkdownTarget,
        title: String,
    },
    Image {
        target: MarkdownTarget,
        title: String,
    },
    Text {
        text: String,
    },
    Code {
        text: String,
    },
    /// HTML/unsupported parser extensions stay visible, never executed or discarded.
    Literal {
        text: String,
    },
    SoftBreak,
    HardBreak,
    Rule,
    Task {
        checked: bool,
    },
}

#[derive(Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
#[cfg_attr(feature = "mobile-schema", derive(schemars::JsonSchema))]
pub enum MarkdownAlignment {
    None,
    Left,
    Center,
    Right,
}

#[derive(Debug, Serialize, Deserialize, PartialEq)]
#[serde(tag = "kind", rename_all = "snake_case")]
#[cfg_attr(feature = "mobile-schema", derive(schemars::JsonSchema))]
pub enum MarkdownTarget {
    Catalog {
        path: String,
    },
    Note {
        path: String,
        anchor: Option<String>,
        wiki: bool,
    },
    Anchor {
        anchor: String,
    },
    External {
        url: String,
    },
    Blocked {
        raw: String,
    },
}
