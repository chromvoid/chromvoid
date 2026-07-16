use std::io::{self, Write};

use base64::Engine;
use chromvoid_protocol::{
    AgentEventDataV1, AgentEventV1, AgentResponseDataV1, AgentResponseV1, AGENT_OUTPUT_CHUNK_BYTES,
};

use crate::error::CliError;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OutputMode {
    Human,
    Json,
    JsonLines,
}

impl OutputMode {
    pub fn from_flags(json: bool, jsonl: bool) -> Self {
        if jsonl {
            Self::JsonLines
        } else if json {
            Self::Json
        } else {
            Self::Human
        }
    }
}

pub fn print_response(mode: OutputMode, response: &AgentResponseV1) -> Result<(), CliError> {
    match mode {
        OutputMode::Json | OutputMode::JsonLines => {
            let line = render_json_line(response)?;
            let mut stdout = io::stdout().lock();
            stdout.write_all(&line).map_err(output_error)?;
            stdout.flush().map_err(output_error)
        }
        OutputMode::Human => print_human_response(response),
    }
}

pub fn print_event(mode: OutputMode, event: &AgentEventV1) -> Result<(), CliError> {
    if let AgentEventDataV1::Stdout { data_base64, .. }
    | AgentEventDataV1::Stderr { data_base64, .. } = &event.event
    {
        // Machine output remains encoded, but the CLI still validates the
        // stream before forwarding it as an authoritative JSONL event.
        drop(decode_output_chunk(data_base64)?);
    }
    match mode {
        OutputMode::JsonLines => {
            let line = render_json_line(event)?;
            let mut stdout = io::stdout().lock();
            stdout.write_all(&line).map_err(output_error)?;
            stdout.flush().map_err(output_error)
        }
        OutputMode::Json => Ok(()),
        OutputMode::Human => print_human_event(event),
    }
}

pub fn print_local_error(mode: OutputMode, response: &AgentResponseV1) -> Result<(), CliError> {
    match mode {
        OutputMode::Json | OutputMode::JsonLines => print_response(mode, response),
        OutputMode::Human => {
            let error = response.error.as_ref().ok_or_else(|| {
                CliError::software("OUTPUT_FAILED", "Local error response has no error")
            })?;
            eprintln!("{}: {}", error.code, error.message);
            if let Some(next_action) = &error.next_action {
                eprintln!("Next action: {next_action}");
            }
            Ok(())
        }
    }
}

pub fn render_json_line<T: serde::Serialize>(value: &T) -> Result<Vec<u8>, CliError> {
    let mut bytes = serde_json::to_vec(value)
        .map_err(|error| CliError::software("OUTPUT_ENCODING_FAILED", format!("{error}")))?;
    bytes.push(b'\n');
    Ok(bytes)
}

fn print_human_response(response: &AgentResponseV1) -> Result<(), CliError> {
    if !response.ok {
        let error = response
            .error
            .as_ref()
            .ok_or_else(|| CliError::data("INVALID_RESPONSE", "Failed response has no error"))?;
        eprintln!("{}: {}", error.code, error.message);
        if let Some(next_action) = &error.next_action {
            eprintln!("Next action: {next_action}");
        }
        return Ok(());
    }
    match response.data.as_ref() {
        Some(AgentResponseDataV1::Acknowledged) => println!("Acknowledged."),
        Some(data) => {
            let value = serde_json::to_string_pretty(data).map_err(|error| {
                CliError::software("OUTPUT_ENCODING_FAILED", format!("{error}"))
            })?;
            println!("{value}");
        }
        None => {
            return Err(CliError::data(
                "INVALID_RESPONSE",
                "Successful response has no data",
            ))
        }
    }
    Ok(())
}

fn print_human_event(event: &AgentEventV1) -> Result<(), CliError> {
    match &event.event {
        AgentEventDataV1::Stdout { data_base64, .. } => {
            let bytes = decode_output_chunk(data_base64)?;
            let mut stdout = io::stdout().lock();
            stdout.write_all(&bytes).map_err(output_error)?;
            stdout.flush().map_err(output_error)
        }
        AgentEventDataV1::Stderr { data_base64, .. } => {
            let bytes = decode_output_chunk(data_base64)?;
            let mut stderr = io::stderr().lock();
            stderr.write_all(&bytes).map_err(output_error)?;
            stderr.flush().map_err(output_error)
        }
        AgentEventDataV1::ApprovalPending {
            run_id,
            expires_at_epoch_ms,
        } => {
            eprintln!(
                "Run {run_id} is waiting for desktop approval (expires at {expires_at_epoch_ms})."
            );
            Ok(())
        }
        AgentEventDataV1::ProposalPending { proposal_id, .. } => {
            eprintln!("Proposal {proposal_id} is waiting for desktop review.");
            Ok(())
        }
        AgentEventDataV1::RunStarted { run_id, process_id } => {
            eprintln!("Run {run_id} started as process {process_id}.");
            Ok(())
        }
        AgentEventDataV1::SignalForwarded { run_id, signal } => {
            eprintln!("Forwarded signal {signal} to run {run_id}.");
            Ok(())
        }
        AgentEventDataV1::RunExited {
            run_id,
            exit_code,
            signal,
            duration_ms,
        } => {
            eprintln!(
                "Run {run_id} exited (code={exit_code:?}, signal={signal:?}, duration_ms={duration_ms})."
            );
            Ok(())
        }
        AgentEventDataV1::Error(error) => {
            eprintln!("{}: {}", error.code, error.message);
            Ok(())
        }
    }
}

pub fn decode_output_chunk(encoded: &str) -> Result<Vec<u8>, CliError> {
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(encoded)
        .map_err(|_| CliError::data("INVALID_OUTPUT_CHUNK", "Run output is not valid base64"))?;
    if bytes.len() > AGENT_OUTPUT_CHUNK_BYTES {
        return Err(CliError::data(
            "INVALID_OUTPUT_CHUNK",
            format!("Decoded run output exceeds {AGENT_OUTPUT_CHUNK_BYTES} bytes"),
        ));
    }
    Ok(bytes)
}

fn output_error(error: io::Error) -> CliError {
    CliError::software("OUTPUT_FAILED", format!("Write CLI output: {error}"))
}

#[cfg(test)]
mod tests {
    use chromvoid_protocol::{
        AgentEventDataV1, AgentResponseDataV1, AgentRunMetadataV1, AgentRunStatusV1,
        AGENT_PROTOCOL_VERSION, AGENT_SCHEMA_VERSION,
    };

    use super::*;

    #[test]
    fn response_fixture_is_one_compact_newline_terminated_object() {
        let response = AgentResponseV1::success(
            "req-1",
            AgentResponseDataV1::Run(AgentRunMetadataV1 {
                id: "run-1".into(),
                actor_id: "agent-1".into(),
                profile_id: "profile-1".into(),
                preset_id: "preset-1".into(),
                status: AgentRunStatusV1::ApprovalPending,
                process_id: None,
                started_at_epoch_ms: None,
                finished_at_epoch_ms: None,
                exit_code: None,
                signal: None,
            }),
        );
        let line = render_json_line(&response).expect("render response");
        assert_eq!(line.iter().filter(|byte| **byte == b'\n').count(), 1);
        assert_eq!(line.last(), Some(&b'\n'));
        let decoded: AgentResponseV1 = serde_json::from_slice(&line).expect("decode fixture");
        assert_eq!(decoded.protocol_version, AGENT_PROTOCOL_VERSION);
        assert_eq!(decoded.schema_version, AGENT_SCHEMA_VERSION);
    }

    #[test]
    fn event_fixture_preserves_sequence_and_base64() {
        let event = AgentEventV1 {
            schema_version: AGENT_SCHEMA_VERSION,
            request_id: "req-1".into(),
            sequence: 1,
            event: AgentEventDataV1::Stdout {
                run_id: "run-1".into(),
                data_base64: "b2sK".into(),
            },
        };
        let line = render_json_line(&event).expect("render event");
        let decoded: AgentEventV1 = serde_json::from_slice(&line).expect("decode event");
        assert_eq!(decoded, event);
        assert_eq!(decode_output_chunk("b2sK").expect("base64"), b"ok\n");
    }
}
