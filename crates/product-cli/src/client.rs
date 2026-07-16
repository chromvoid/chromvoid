use std::collections::BTreeSet;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use chromvoid_protocol::{
    AgentCommandV1, AgentEventV1, AgentHelloV1, AgentRequestV1, AgentResponseDataV1,
    AgentResponseV1, Frame, FrameType, AGENT_PROTOCOL_VERSION, AGENT_SCHEMA_VERSION,
};

use crate::error::{validate_response, CliError};
use crate::transport::AgentConnection;

const REQUIRED_BASE_CAPABILITY: &str = "env_runtime_v1";

pub struct CommandResponse {
    pub request_id: String,
    pub response: AgentResponseV1,
}

pub struct PendingRunStop {
    request_id: String,
    message_id: u64,
}

pub struct AgentClient {
    connection: AgentConnection,
    next_message_id: u64,
    capabilities: BTreeSet<String>,
}

impl AgentClient {
    pub fn new(connection: AgentConnection) -> Self {
        let seed = uuid::Uuid::new_v4().as_u128() as u64;
        Self {
            connection,
            // Keep ample monotonic headroom for the session anti-replay rule.
            next_message_id: (seed & 0x7fff_ffff_ffff_ffff).max(1),
            capabilities: BTreeSet::new(),
        }
    }

    pub async fn negotiate(&mut self) -> Result<CommandResponse, CliError> {
        let response = self
            .send(AgentCommandV1::Hello {
                client_version: env!("CARGO_PKG_VERSION").to_string(),
            })
            .await?;
        let hello = require_success_data(&response.response).and_then(|data| match data {
            AgentResponseDataV1::Hello(hello) => Ok(hello),
            _ => Err(CliError::data(
                "INVALID_HELLO",
                "Desktop returned the wrong response to hello",
            )),
        })?;
        validate_hello(hello)?;
        self.capabilities = hello.capabilities.iter().cloned().collect();
        Ok(response)
    }

    pub async fn send(&mut self, command: AgentCommandV1) -> Result<CommandResponse, CliError> {
        let response_timeout = response_timeout_for(&command);
        let response_deadline = tokio::time::Instant::now() + response_timeout;
        let (request_id, message_id) = self.send_without_wait(command).await?;
        loop {
            let frame = tokio::time::timeout_at(response_deadline, self.connection.next_frame())
                .await
                .map_err(|_| {
                    CliError::unavailable(
                        "GATEWAY_TIMEOUT",
                        "Timed out waiting for the ChromVoid desktop response",
                    )
                })??;
            match frame.frame_type {
                FrameType::Heartbeat => continue,
                FrameType::RpcResponse if frame.message_id == message_id => {
                    let response: AgentResponseV1 = serde_json::from_slice(&frame.payload)
                        .map_err(|error| {
                            CliError::data(
                                "INVALID_RESPONSE",
                                format!("Decode desktop response: {error}"),
                            )
                        })?;
                    validate_response(&response, &request_id)?;
                    return Ok(CommandResponse {
                        request_id,
                        response,
                    });
                }
                FrameType::Error if frame.message_id == message_id => {
                    return Err(CliError::data(
                        "GATEWAY_PROTOCOL_ERROR",
                        "Gateway rejected the agent request frame",
                    ));
                }
                _ => {
                    return Err(CliError::data(
                        "UNEXPECTED_FRAME",
                        "Desktop sent an unexpected frame before the command response",
                    ));
                }
            }
        }
    }

    pub async fn send_without_wait(
        &mut self,
        command: AgentCommandV1,
    ) -> Result<(String, u64), CliError> {
        if let Some(capability) = required_capability(&command) {
            if !self.capabilities.contains(capability) {
                return Err(CliError::data(
                    "MISSING_CAPABILITY",
                    format!("Desktop does not advertise required capability {capability}"),
                ));
            }
        }
        let request_id = format!("req-{}", uuid::Uuid::new_v4().simple());
        let message_id = self.take_message_id();
        let request = AgentRequestV1 {
            protocol_version: AGENT_PROTOCOL_VERSION,
            schema_version: AGENT_SCHEMA_VERSION,
            request_id: request_id.clone(),
            timestamp_secs: now_secs()?,
            command,
        };
        let payload = serde_json::to_vec(&request)
            .map_err(|error| CliError::software("REQUEST_ENCODING_FAILED", format!("{error}")))?;
        self.connection
            .send_frame(&Frame {
                frame_type: FrameType::RpcRequest,
                message_id,
                flags: 0,
                payload,
            })
            .await?;
        Ok((request_id, message_id))
    }

    pub async fn next_run_event(
        &mut self,
        run_request_id: &str,
        expected_sequence: u64,
    ) -> Result<AgentEventV1, CliError> {
        self.next_run_event_with_stop(run_request_id, expected_sequence, &mut None)
            .await
    }

    pub async fn next_run_event_with_stop(
        &mut self,
        run_request_id: &str,
        expected_sequence: u64,
        pending_control: &mut Option<PendingRunStop>,
    ) -> Result<AgentEventV1, CliError> {
        loop {
            let frame = self.connection.next_frame().await?;
            match frame.frame_type {
                FrameType::Heartbeat => continue,
                FrameType::RpcResponse => {
                    let Some(pending_stop) = pending_control.as_ref() else {
                        return Err(CliError::data(
                            "UNEXPECTED_FRAME",
                            "Desktop sent an unexpected response inside the run stream",
                        ));
                    };
                    if frame.message_id != pending_stop.message_id {
                        return Err(CliError::data(
                            "UNEXPECTED_FRAME",
                            "Desktop sent a response for an unknown run control request",
                        ));
                    }
                    let response: AgentResponseV1 = serde_json::from_slice(&frame.payload)
                        .map_err(|error| {
                            CliError::data(
                                "INVALID_RESPONSE",
                                format!("Decode run control response: {error}"),
                            )
                        })?;
                    validate_response(&response, &pending_stop.request_id)?;
                    *pending_control = None;
                    if !response.ok {
                        let error = response.error.ok_or_else(|| {
                            CliError::data(
                                "INVALID_RESPONSE",
                                "Failed run control response has no error",
                            )
                        })?;
                        // The process monitor can publish run_exited and mark
                        // the run terminal just before the attached SIGINT Stop
                        // reaches the Gateway. That Stop lost the race, but the
                        // original run stream still owns the terminal event.
                        if error.code == "RUN_ALREADY_TERMINAL" {
                            continue;
                        }
                        return Err(CliError::Remote(error));
                    }
                    continue;
                }
                FrameType::RpcRequest => {
                    let event: AgentEventV1 =
                        serde_json::from_slice(&frame.payload).map_err(|error| {
                            CliError::data(
                                "INVALID_EVENT",
                                format!("Decode desktop event: {error}"),
                            )
                        })?;
                    if event.schema_version != AGENT_SCHEMA_VERSION {
                        return Err(CliError::data(
                            "UNSUPPORTED_VERSION",
                            "Desktop event has an unsupported schema version",
                        ));
                    }
                    if event.request_id != run_request_id {
                        return Err(CliError::data(
                            "REQUEST_ID_MISMATCH",
                            "Desktop event request_id does not match the run request",
                        ));
                    }
                    if event.sequence != expected_sequence {
                        return Err(CliError::data(
                            "BROKEN_EVENT_SEQUENCE",
                            format!(
                                "Expected run event sequence {expected_sequence}, received {}",
                                event.sequence
                            ),
                        ));
                    }
                    return Ok(event);
                }
                FrameType::Error => {
                    return Err(CliError::data(
                        "GATEWAY_PROTOCOL_ERROR",
                        "Gateway rejected the active run stream",
                    ));
                }
            }
        }
    }

    pub async fn request_run_stop(&mut self, run_id: String) -> Result<PendingRunStop, CliError> {
        let (request_id, message_id) = self
            .send_without_wait(AgentCommandV1::RunStop { run_id })
            .await?;
        Ok(PendingRunStop {
            request_id,
            message_id,
        })
    }

    pub async fn close(&mut self) {
        self.connection.close().await;
    }

    fn take_message_id(&mut self) -> u64 {
        let message_id = self.next_message_id;
        self.next_message_id = self.next_message_id.wrapping_add(1).max(1);
        message_id
    }
}

pub fn require_success_data(response: &AgentResponseV1) -> Result<&AgentResponseDataV1, CliError> {
    if response.ok {
        response
            .data
            .as_ref()
            .ok_or_else(|| CliError::data("INVALID_RESPONSE", "Successful response has no data"))
    } else {
        Err(CliError::Remote(response.error.clone().ok_or_else(
            || CliError::data("INVALID_RESPONSE", "Failed response has no error"),
        )?))
    }
}

fn validate_hello(hello: &AgentHelloV1) -> Result<(), CliError> {
    if !hello
        .capabilities
        .iter()
        .any(|capability| capability == REQUIRED_BASE_CAPABILITY)
    {
        return Err(CliError::data(
            "MISSING_CAPABILITY",
            "Desktop does not support Vault Env Runtime protocol v1",
        ));
    }
    Ok(())
}

fn required_capability(command: &AgentCommandV1) -> Option<&'static str> {
    match command {
        AgentCommandV1::Hello { .. } => None,
        AgentCommandV1::ProfilePropose { .. } => Some("profile_proposals_v1"),
        AgentCommandV1::PresetPropose { .. } => Some("preset_proposals_v1"),
        AgentCommandV1::Run { .. } => Some("attached_run_v1"),
        _ => Some(REQUIRED_BASE_CAPABILITY),
    }
}

fn response_timeout_for(command: &AgentCommandV1) -> Duration {
    if matches!(command, AgentCommandV1::ProposalWait { .. }) {
        Duration::from_secs(610)
    } else {
        Duration::from_secs(30)
    }
}

fn now_secs() -> Result<u64, CliError> {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .map_err(|_| CliError::software("CLOCK_INVALID", "System clock is before Unix epoch"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hello_requires_env_runtime_capability() {
        let hello = AgentHelloV1 {
            desktop_version: "1.0".into(),
            capabilities: vec!["other".into()],
        };
        assert!(validate_hello(&hello).is_err());
    }

    #[test]
    fn mutation_and_run_capabilities_are_command_specific() {
        assert_eq!(
            required_capability(&AgentCommandV1::ProfilePropose {
                operation: chromvoid_protocol::MutationOperationV1::Delete,
                target: Some("profile-1".into()),
                base_revision: Some(1),
                draft: None,
            }),
            Some("profile_proposals_v1")
        );
        assert_eq!(
            required_capability(&AgentCommandV1::Run {
                profile: "profile-1".into(),
                preset: "preset-1".into(),
                reason: None,
            }),
            Some("attached_run_v1")
        );
    }
}
