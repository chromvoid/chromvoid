//! Pure document transformation boundary; no vault/session authority or retained state.
use chromvoid_core::markdown::{self, MarkdownError};
use zeroize::Zeroizing;

#[derive(Debug, thiserror::Error, uniffi::Error)]
pub enum AirMarkdownError {
    #[error("Document exceeds the editor byte limit")]
    TooLarge,
    #[error("Document is too complex to preview")]
    TooComplex,
    #[error("Document content cannot be previewed")]
    UnsupportedContent,
    #[error("Task action belongs to an older document")]
    StaleTask,
    #[error("Document result could not be encoded")]
    Encoding,
}

impl From<MarkdownError> for AirMarkdownError {
    fn from(error: MarkdownError) -> Self {
        match error {
            MarkdownError::TooLarge => Self::TooLarge,
            MarkdownError::TooComplex => Self::TooComplex,
            MarkdownError::UnsupportedContent => Self::UnsupportedContent,
            MarkdownError::StaleTask => Self::StaleTask,
        }
    }
}

#[uniffi::export]
pub fn parse_air_markdown(source: String) -> Result<Vec<u8>, AirMarkdownError> {
    let source = Zeroizing::new(source);
    let document = markdown::parse(&source)?;
    serde_json::to_vec(&document).map_err(|_| AirMarkdownError::Encoding)
}

#[uniffi::export]
pub fn toggle_air_markdown_task(
    source: String,
    source_digest: String,
    marker_start: u32,
    checked: bool,
) -> Result<String, AirMarkdownError> {
    let source = Zeroizing::new(source);
    markdown::toggle_task(&source, &source_digest, marker_start, checked).map_err(Into::into)
}

#[cfg(test)]
mod tests {
    use super::*;
    use chromvoid_core::markdown::{MarkdownContent, MarkdownDocument};

    #[test]
    fn wire_tree_and_task_edit_share_exact_utf8_source_identity() {
        let source = "# Задачи\n\n- [ ] Проверить 😀\n";
        let document: MarkdownDocument =
            serde_json::from_slice(&parse_air_markdown(source.into()).unwrap()).unwrap();
        let task = document
            .nodes
            .iter()
            .find(|node| matches!(node.content, MarkdownContent::Task { .. }))
            .unwrap();
        assert_eq!(
            toggle_air_markdown_task(
                source.into(),
                document.source_digest.clone(),
                task.start,
                false
            )
            .unwrap(),
            "# Задачи\n\n- [x] Проверить 😀\n"
        );
        assert!(matches!(
            toggle_air_markdown_task(source.into(), "stale".into(), task.start, false),
            Err(AirMarkdownError::StaleTask)
        ));
    }
}
