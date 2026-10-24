use super::MarkdownTarget;
use percent_encoding::percent_decode_str;
use regex::Regex;
use std::sync::OnceLock;
use unicode_normalization::UnicodeNormalization;

pub(super) fn heading_slug(value: &str) -> String {
    static PUNCTUATION: OnceLock<Regex> = OnceLock::new();
    let normalized: String = value
        .trim()
        .to_lowercase()
        .nfkd()
        .filter(|c| !('\u{0300}'..='\u{036f}').contains(c))
        .collect();
    let cleaned = PUNCTUATION
        .get_or_init(|| Regex::new(r"[^\p{L}\p{N}\s_-]").unwrap())
        .replace_all(&normalized, "");
    let mut slug = String::new();
    for c in cleaned.trim().chars() {
        let c = if c.is_whitespace() { '-' } else { c };
        if c != '-' || !slug.ends_with('-') {
            slug.push(c);
        }
    }
    if slug.is_empty() {
        "section".into()
    } else {
        slug
    }
}

fn decode(value: &str) -> String {
    // Match decodeURIComponent's all-or-nothing fallback on malformed escapes/UTF8.
    let bytes = value.as_bytes();
    if bytes.iter().enumerate().any(|(i, byte)| {
        *byte == b'%'
            && (i + 2 >= bytes.len()
                || !bytes[i + 1].is_ascii_hexdigit()
                || !bytes[i + 2].is_ascii_hexdigit())
    }) {
        return value.into();
    }
    percent_decode_str(value)
        .decode_utf8()
        .map_or_else(|_| value.into(), |s| s.into_owned())
}

fn has_scheme(value: &str) -> bool {
    let Some((scheme, _)) = value.split_once(':') else {
        return false;
    };
    scheme.starts_with(|c: char| c.is_ascii_alphabetic())
        && scheme
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '+' | '-' | '.'))
}

fn catalog_path(path: &str) -> bool {
    path.starts_with('/')
        && path[1..]
            .split('/')
            .all(|s| !s.is_empty() && s != "." && s != "..")
}

pub(super) fn target(raw: &str, wiki: bool, image: bool) -> MarkdownTarget {
    let raw = raw.trim();
    let blocked = || MarkdownTarget::Blocked { raw: raw.into() };
    if raw.is_empty() || raw.chars().any(char::is_control) {
        return blocked();
    }
    let decoded = decode(raw);
    if decoded.chars().any(char::is_control) {
        return blocked();
    }
    if decoded.starts_with("//") || has_scheme(&decoded) {
        if !image && !wiki {
            if let Ok(url) = url::Url::parse(raw) {
                if matches!(url.scheme(), "http" | "https" | "mailto" | "tel") {
                    return MarkdownTarget::External { url: raw.into() };
                }
            }
        }
        return blocked();
    }
    // Images are vault-absolute only. No remote request or file:// fallback.
    if image {
        return if catalog_path(&decoded) {
            MarkdownTarget::Catalog { path: decoded }
        } else {
            blocked()
        };
    }
    let (path, anchor) = raw
        .split_once('#')
        .map_or((raw, None), |(path, a)| (path, Some(a)));
    let path = decode(path);
    let anchor = anchor
        .filter(|s| !s.trim().is_empty())
        .map(|s| heading_slug(&decode(s.trim())));
    if path.is_empty() {
        return anchor.map_or_else(blocked, |anchor| MarkdownTarget::Anchor { anchor });
    }
    let is_note = path.to_ascii_lowercase().ends_with(".md")
        || path.to_ascii_lowercase().ends_with(".markdown");
    if wiki || (is_note && (!path.starts_with('/') || anchor.is_some())) {
        return MarkdownTarget::Note { path, anchor, wiki };
    }
    if catalog_path(&decoded) {
        return MarkdownTarget::Catalog { path: decoded };
    }
    blocked()
}
