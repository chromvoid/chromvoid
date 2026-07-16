/// Canonical product-agent documentation embedded in the shipped CLI.
///
/// Keep the source under `docs/agents/` so repository agents and installed CLI
/// users follow the same contract.
pub const AGENT_GUIDE: &str = include_str!("../../../docs/agents/vault-env-runtime-cli.md");

#[cfg(test)]
mod tests {
    use base64::{engine::general_purpose::STANDARD, Engine as _};
    use chromvoid_protocol::{
        AgentEventDataV1, AgentEventV1, AgentPresetDraftV1, AgentProfileDraftV1, AgentResponseV1,
        AGENT_SCHEMA_VERSION,
    };
    use clap::Parser as _;

    use super::*;
    use crate::args::Cli;
    use crate::draft::{validate_preset_draft, validate_profile_draft};
    use crate::error::validate_response;

    fn fenced_fixture(name: &str, language: &str) -> &'static str {
        let marker = format!("<!-- guide-fixture:{name} -->");
        let (_, after_marker) = AGENT_GUIDE
            .split_once(&marker)
            .unwrap_or_else(|| panic!("missing guide fixture marker {marker}"));
        let opening = format!("```{language}\n");
        let (_, after_opening) = after_marker
            .split_once(&opening)
            .unwrap_or_else(|| panic!("fixture {name} is not a {language} fence"));
        after_opening
            .split_once("\n```")
            .map(|(fixture, _)| fixture)
            .unwrap_or_else(|| panic!("fixture {name} has no closing fence"))
    }

    fn shell_json_fixture(name: &str) -> &'static str {
        let shell = fenced_fixture(name, "sh");
        let start = shell
            .find("'{")
            .unwrap_or_else(|| panic!("fixture {name} has no quoted JSON object"))
            + 1;
        let end = shell
            .rfind("}' | chromvoid")
            .unwrap_or_else(|| panic!("fixture {name} has no chromvoid stdin pipeline"))
            + 1;
        &shell[start..end]
    }

    fn shell_words(command: &str) -> Vec<String> {
        #[derive(Clone, Copy, PartialEq, Eq)]
        enum Quote {
            None,
            Single,
            Double,
        }

        let mut words = Vec::new();
        let mut current = String::new();
        let mut quote = Quote::None;
        let mut characters = command.chars();
        while let Some(character) = characters.next() {
            match (quote, character) {
                (Quote::None, '\'') => quote = Quote::Single,
                (Quote::None, '"') => quote = Quote::Double,
                (Quote::Single, '\'') | (Quote::Double, '"') => quote = Quote::None,
                (Quote::None | Quote::Double, '\\') => current.push(
                    characters
                        .next()
                        .unwrap_or_else(|| panic!("trailing escape in {command}")),
                ),
                (Quote::None, value) if value.is_whitespace() => {
                    if !current.is_empty() {
                        words.push(std::mem::take(&mut current));
                    }
                }
                (_, value) => current.push(value),
            }
        }
        assert!(quote == Quote::None, "unclosed quote in {command}");
        if !current.is_empty() {
            words.push(current);
        }
        words
    }

    fn shell_blocks() -> Vec<String> {
        let mut blocks = Vec::new();
        let mut current: Option<String> = None;
        for line in AGENT_GUIDE.lines() {
            let trimmed = line.trim_start();
            if current.is_none() {
                if trimmed == "```sh" {
                    current = Some(String::new());
                }
                continue;
            }
            if trimmed == "```" {
                blocks.push(current.take().expect("open shell block"));
                continue;
            }
            let block = current.as_mut().expect("open shell block");
            block.push_str(trimmed);
            block.push('\n');
        }
        assert!(
            current.is_none(),
            "canonical guide has an unclosed shell fence"
        );
        blocks
    }

    #[test]
    fn guide_preserves_the_cli_only_security_boundary() {
        for required_boundary in [
            "Use only `chromvoid` commands",
            "MCP is explicitly prohibited",
            "Never ask for or handle an EnvSecret value",
            "Never create a `.env`",
            "Pairing and every approval are user actions",
        ] {
            assert!(
                AGENT_GUIDE.contains(required_boundary),
                "canonical guide lost boundary: {required_boundary}"
            );
        }
    }

    #[test]
    fn every_shell_recipe_in_the_canonical_guide_parses_with_clap() {
        let mut parsed = 0;
        for block in shell_blocks() {
            let logical_lines = block.replace("\\\n", " ");
            for line in logical_lines.lines().map(str::trim) {
                if !line.contains("chromvoid") || line == "command -v chromvoid" {
                    continue;
                }
                let start = line
                    .find("chromvoid")
                    .expect("line was filtered by chromvoid");
                let prefix = line[..start].trim_end();
                assert!(
                    prefix.is_empty() || prefix.ends_with('|'),
                    "unsupported documented command wrapper: {line}"
                );
                let words = shell_words(&line[start..]);
                Cli::try_parse_from(&words)
                    .unwrap_or_else(|error| panic!("documented command {words:?} failed: {error}"));
                parsed += 1;
            }
        }
        assert!(parsed >= 20, "unexpectedly extracted only {parsed} recipes");
    }

    #[test]
    fn canonical_draft_examples_match_v1_types_and_validation() {
        for fixture in ["profile-create-draft-v1", "profile-update-draft-v1"] {
            let draft: AgentProfileDraftV1 = serde_json::from_str(shell_json_fixture(fixture))
                .unwrap_or_else(|error| {
                    panic!("profile fixture {fixture} does not match v1 schema: {error}")
                });
            validate_profile_draft(&draft)
                .unwrap_or_else(|error| panic!("profile fixture {fixture} is invalid: {error}"));
        }

        let preset: AgentPresetDraftV1 =
            serde_json::from_str(shell_json_fixture("preset-create-draft-v1"))
                .expect("preset fixture matches v1 schema");
        validate_preset_draft(&preset).expect("preset fixture passes CLI validation");
    }

    #[test]
    fn canonical_json_response_matches_v1_protocol() {
        let response: AgentResponseV1 =
            serde_json::from_str(fenced_fixture("agent-response-v1", "json"))
                .expect("JSON response fixture matches v1 schema");
        validate_response(&response, "req-status-1")
            .expect("JSON response fixture satisfies v1 envelope invariants");
    }

    #[test]
    fn canonical_jsonl_stream_matches_v1_protocol() {
        let mut lines = fenced_fixture("agent-jsonl-v1", "jsonl").lines();
        let response: AgentResponseV1 =
            serde_json::from_str(lines.next().expect("JSONL fixture starts with a response"))
                .expect("JSONL response matches v1 schema");
        validate_response(&response, "req-1")
            .expect("JSONL response satisfies v1 envelope invariants");

        let events = lines
            .map(|line| {
                serde_json::from_str::<AgentEventV1>(line)
                    .unwrap_or_else(|error| panic!("JSONL event does not match v1 schema: {error}"))
            })
            .collect::<Vec<_>>();
        assert!(!events.is_empty(), "JSONL fixture contains no events");
        for (index, event) in events.iter().enumerate() {
            assert_eq!(event.schema_version, AGENT_SCHEMA_VERSION);
            assert_eq!(event.request_id, "req-1");
            assert_eq!(event.sequence, index as u64 + 1);
            if let AgentEventDataV1::Stdout { data_base64, .. }
            | AgentEventDataV1::Stderr { data_base64, .. } = &event.event
            {
                STANDARD
                    .decode(data_base64)
                    .expect("documented output chunk is canonical base64");
            }
        }
        assert!(matches!(
            events.last().map(|event| &event.event),
            Some(AgentEventDataV1::RunExited { .. })
        ));
    }
}
