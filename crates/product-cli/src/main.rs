use std::io::{BufRead, Write};
use std::process::ExitCode;
use std::time::Duration;

use chromvoid_product_cli::args::{
    Cli, ConnectionCommand, EnvCommand, PresetsCommand, ProfilesCommand, ProposalsCommand,
    RunsCommand, SecretsCommand, TopLevelCommand,
};
use chromvoid_product_cli::client::{require_success_data, AgentClient, PendingRunStop};
use chromvoid_product_cli::config::{
    discover_runtime_stores, ConfigStore, IdentityStore, NoiseIdentity, PublicConfig,
};
use chromvoid_product_cli::draft::{
    read_preset_draft, read_profile_draft, validate_identifier, validate_reason,
};
use chromvoid_product_cli::error::{exit_code_for_agent_error, CliError};
use chromvoid_product_cli::guide::AGENT_GUIDE;
use chromvoid_product_cli::output::{print_event, print_local_error, print_response, OutputMode};
use chromvoid_product_cli::transport::AgentConnection;
use chromvoid_protocol::{
    AgentCommandV1, AgentEventDataV1, AgentEventV1, AgentResponseDataV1, MutationOperationV1,
    AGENT_SCHEMA_VERSION,
};
use clap::Parser;
use zeroize::Zeroize;

const INTERRUPT_DRAIN_TIMEOUT: Duration = Duration::from_secs(8);

#[tokio::main]
async fn main() -> ExitCode {
    let cli = match Cli::try_parse() {
        Ok(cli) => cli,
        Err(error) => {
            let success = matches!(
                error.kind(),
                clap::error::ErrorKind::DisplayHelp | clap::error::ErrorKind::DisplayVersion
            );
            let _ = error.print();
            return ExitCode::from(if success { 0 } else { 64 });
        }
    };
    let output = OutputMode::from_flags(cli.json, cli.jsonl);
    match run(cli, output).await {
        Ok(exit_code) => ExitCode::from(exit_code),
        Err(error) => {
            let request_id = format!("local-{}", uuid::Uuid::new_v4().simple());
            let response = error.as_response(request_id);
            if let Err(output_error) = print_local_error(output, &response) {
                eprintln!("{}", output_error);
            }
            ExitCode::from(error.exit_code())
        }
    }
}

async fn run(cli: Cli, output: OutputMode) -> Result<u8, CliError> {
    if matches!(
        cli.command,
        TopLevelCommand::Env {
            command: EnvCommand::AgentGuide
        }
    ) {
        if output != OutputMode::Human {
            return Err(CliError::usage(
                "OUTPUT_MODE_UNSUPPORTED",
                "env agent-guide is a local Markdown document; run it without --json or --jsonl",
            ));
        }
        print!("{AGENT_GUIDE}");
        return Ok(0);
    }

    let (config_store, identity_store) = discover_runtime_stores()?;
    if matches!(cli.command, TopLevelCommand::Pair) {
        return pair(&config_store, identity_store.as_ref(), output).await;
    }

    let config = config_store.load()?.ok_or_else(|| {
        CliError::unavailable(
            "NOT_PAIRED",
            "This CLI has no pairing metadata; open ChromVoid and run chromvoid pair",
        )
    })?;
    let identity = identity_store.load()?.ok_or_else(|| {
        CliError::unavailable(
            "NOT_PAIRED",
            "This CLI has no Keychain identity; open ChromVoid and pair again",
        )
    })?;
    let connection = AgentConnection::reconnect(&identity, &config).await?;
    let mut client = AgentClient::new(connection);
    client.negotiate().await?;
    let command = command_from_args(&cli.command)?;

    if matches!(command, AgentCommandV1::Run { .. }) {
        run_attached(&mut client, command, output).await
    } else {
        let command_response = client.send(command).await?;
        print_response(output, &command_response.response)?;
        let exit_code = if command_response.response.ok {
            0
        } else {
            command_response
                .response
                .error
                .as_ref()
                .map(exit_code_for_agent_error)
                .unwrap_or(65)
        };
        client.close().await;
        Ok(exit_code)
    }
}

async fn pair(
    config_store: &ConfigStore,
    identity_store: &dyn IdentityStore,
    output: OutputMode,
) -> Result<u8, CliError> {
    let identity = match identity_store.load()? {
        Some(identity) => identity,
        None => {
            let identity = NoiseIdentity::generate()?;
            identity_store.save(&identity)?;
            identity
        }
    };
    let mut pin = read_pairing_code()?;
    let pairing_result = AgentConnection::pair(&identity, &pin).await;
    pin.zeroize();
    let (connection, server_public_key) = pairing_result?;
    let mut client = AgentClient::new(connection);
    client.negotiate().await?;
    let status = client.send(AgentCommandV1::ConnectionStatus).await?;
    let actor_id = match require_success_data(&status.response)? {
        AgentResponseDataV1::ConnectionStatus(status) if status.paired => status.actor_id.clone(),
        _ => {
            return Err(CliError::unavailable(
                "PAIRING_FAILED",
                "Desktop did not confirm the paired CLI identity",
            ))
        }
    };
    if actor_id != identity.actor_id() {
        return Err(CliError::data(
            "INVALID_CLI_IDENTITY",
            "Keychain public identity does not match the authenticated Noise identity",
        ));
    }
    let config = PublicConfig::new(actor_id, &server_public_key)?;
    config_store.save(&config)?;
    print_response(output, &status.response)?;
    if output == OutputMode::Human {
        eprintln!("CLI identity paired and stored in macOS Keychain.");
    }
    client.close().await;
    Ok(0)
}

fn command_from_args(command: &TopLevelCommand) -> Result<AgentCommandV1, CliError> {
    match command {
        TopLevelCommand::Pair => Err(CliError::software(
            "INVALID_COMMAND_STATE",
            "pair command reached an invalid execution path",
        )),
        TopLevelCommand::Connection {
            command: ConnectionCommand::Status,
        } => Ok(AgentCommandV1::ConnectionStatus),
        TopLevelCommand::Env { command } => match command {
            EnvCommand::AgentGuide => Err(CliError::software(
                "INVALID_COMMAND_STATE",
                "agent-guide reached an invalid execution path",
            )),
            EnvCommand::Status => Ok(AgentCommandV1::EnvStatus),
            EnvCommand::Secrets {
                command: SecretsCommand::List,
            } => Ok(AgentCommandV1::SecretsList),
            EnvCommand::Profiles { command } => match command {
                ProfilesCommand::List => Ok(AgentCommandV1::ProfilesList),
                ProfilesCommand::Get { profile } => {
                    validate_identifier(profile, "profile")?;
                    Ok(AgentCommandV1::ProfileGet {
                        profile: profile.clone(),
                    })
                }
                ProfilesCommand::ProposeCreate(args) => Ok(AgentCommandV1::ProfilePropose {
                    operation: MutationOperationV1::Create,
                    target: None,
                    base_revision: None,
                    draft: Some(read_profile_draft(&args.file)?),
                }),
                ProfilesCommand::ProposeUpdate(args) => {
                    validate_identifier(&args.target, "profile")?;
                    Ok(AgentCommandV1::ProfilePropose {
                        operation: MutationOperationV1::Update,
                        target: Some(args.target.clone()),
                        base_revision: Some(args.base_revision),
                        draft: Some(read_profile_draft(&args.file)?),
                    })
                }
                ProfilesCommand::ProposeDelete(args) => {
                    validate_identifier(&args.target, "profile")?;
                    Ok(AgentCommandV1::ProfilePropose {
                        operation: MutationOperationV1::Delete,
                        target: Some(args.target.clone()),
                        base_revision: Some(args.base_revision),
                        draft: None,
                    })
                }
            },
            EnvCommand::Presets { command } => match command {
                PresetsCommand::List { profile } => {
                    if let Some(profile) = profile {
                        validate_identifier(profile, "profile")?;
                    }
                    Ok(AgentCommandV1::PresetsList {
                        profile: profile.clone(),
                    })
                }
                PresetsCommand::Get { preset } => {
                    validate_identifier(preset, "preset")?;
                    Ok(AgentCommandV1::PresetGet {
                        preset: preset.clone(),
                    })
                }
                PresetsCommand::ProposeCreate(args) => Ok(AgentCommandV1::PresetPropose {
                    operation: MutationOperationV1::Create,
                    target: None,
                    base_revision: None,
                    draft: Some(read_preset_draft(&args.file)?),
                }),
                PresetsCommand::ProposeUpdate(args) => {
                    validate_identifier(&args.target, "preset")?;
                    Ok(AgentCommandV1::PresetPropose {
                        operation: MutationOperationV1::Update,
                        target: Some(args.target.clone()),
                        base_revision: Some(args.base_revision),
                        draft: Some(read_preset_draft(&args.file)?),
                    })
                }
                PresetsCommand::ProposeDelete(args) => {
                    validate_identifier(&args.target, "preset")?;
                    Ok(AgentCommandV1::PresetPropose {
                        operation: MutationOperationV1::Delete,
                        target: Some(args.target.clone()),
                        base_revision: Some(args.base_revision),
                        draft: None,
                    })
                }
            },
            EnvCommand::Proposals {
                command: ProposalsCommand::Wait { proposal_id },
            } => {
                validate_identifier(proposal_id, "proposal_id")?;
                Ok(AgentCommandV1::ProposalWait {
                    proposal_id: proposal_id.clone(),
                })
            }
            EnvCommand::Run(args) => {
                validate_identifier(&args.profile, "profile")?;
                validate_identifier(&args.preset, "preset")?;
                validate_reason(&args.reason)?;
                Ok(AgentCommandV1::Run {
                    profile: args.profile.clone(),
                    preset: args.preset.clone(),
                    reason: args.reason.clone(),
                })
            }
            EnvCommand::Runs { command } => match command {
                RunsCommand::List => Ok(AgentCommandV1::RunsList),
                RunsCommand::Stop { run_id, all } if *all && run_id.is_none() => {
                    Ok(AgentCommandV1::RunsStopAll)
                }
                RunsCommand::Stop {
                    run_id: Some(run_id),
                    all: false,
                } => {
                    validate_identifier(run_id, "run_id")?;
                    Ok(AgentCommandV1::RunStop {
                        run_id: run_id.clone(),
                    })
                }
                RunsCommand::Stop { .. } => Err(CliError::usage(
                    "INVALID_RUN_TARGET",
                    "Specify one run id or --all",
                )),
            },
        },
    }
}

async fn run_attached(
    client: &mut AgentClient,
    command: AgentCommandV1,
    output: OutputMode,
) -> Result<u8, CliError> {
    let command_response = client.send(command).await?;
    if !command_response.response.ok {
        print_initial_run_response(output, &command_response.response)?;
        return Ok(command_response
            .response
            .error
            .as_ref()
            .map(exit_code_for_agent_error)
            .unwrap_or(65));
    }
    let run_id = match require_success_data(&command_response.response)? {
        AgentResponseDataV1::Run(run) => run.id.clone(),
        _ => {
            return Err(CliError::data(
                "INVALID_RUN_RESPONSE",
                "Desktop returned the wrong response to env run",
            ))
        }
    };
    print_initial_run_response(output, &command_response.response)?;
    let mut next_sequence = 1_u64;
    let mut lifecycle = AttachedRunLifecycle::default();
    let ctrl_c = tokio::signal::ctrl_c();
    tokio::pin!(ctrl_c);

    loop {
        let event_result = tokio::select! {
            event = client.next_run_event(&command_response.request_id, next_sequence) => event,
            signal = &mut ctrl_c => {
                if signal.is_ok() {
                    let pending_control = client.request_run_stop(run_id.clone()).await.ok();
                    let result = drain_after_interrupt(
                        client,
                        &command_response.request_id,
                        &mut next_sequence,
                        output,
                        pending_control,
                        &mut lifecycle,
                    ).await;
                    client.close().await;
                    if let Err(error) = result {
                        emit_stream_error(output, &command_response.request_id, next_sequence, &error)?;
                    }
                    return Ok(130);
                }
                Err(CliError::software("SIGNAL_HANDLER_FAILED", "Failed to listen for Ctrl-C"))
            }
        };
        let event = match event_result {
            Ok(event) => event,
            Err(error) => {
                emit_stream_error(output, &command_response.request_id, next_sequence, &error)?;
                client.close().await;
                return Ok(error.exit_code());
            }
        };
        next_sequence = next_sequence.saturating_add(1);
        print_event(output, &event)?;
        match lifecycle.observe(&event.event) {
            AttachedRunDisposition::Continue => {}
            AttachedRunDisposition::Terminal(exit_code) => {
                client.close().await;
                return Ok(exit_code);
            }
        }
    }
}

#[derive(Default)]
struct AttachedRunLifecycle {
    started: bool,
}

enum AttachedRunDisposition {
    Continue,
    Terminal(u8),
}

impl AttachedRunLifecycle {
    fn observe(&mut self, event: &AgentEventDataV1) -> AttachedRunDisposition {
        match event {
            AgentEventDataV1::RunStarted { .. } => {
                self.started = true;
                AttachedRunDisposition::Continue
            }
            AgentEventDataV1::RunExited {
                exit_code, signal, ..
            } => AttachedRunDisposition::Terminal(child_exit_code(*exit_code, *signal)),
            AgentEventDataV1::Error(error) if !self.started => {
                AttachedRunDisposition::Terminal(exit_code_for_agent_error(error))
            }
            // Runtime failures after spawn are reported as typed stream events,
            // but run_exited remains the authoritative terminal lifecycle fact.
            _ => AttachedRunDisposition::Continue,
        }
    }
}

fn print_initial_run_response(
    output: OutputMode,
    response: &chromvoid_protocol::AgentResponseV1,
) -> Result<(), CliError> {
    if output != OutputMode::Human || !response.ok {
        return print_response(output, response);
    }
    match response.data.as_ref() {
        Some(AgentResponseDataV1::Run(run)) => {
            eprintln!("Requested run {}; waiting for desktop approval.", run.id);
            Ok(())
        }
        _ => Err(CliError::data(
            "INVALID_RUN_RESPONSE",
            "Desktop returned the wrong response to env run",
        )),
    }
}

async fn drain_after_interrupt(
    client: &mut AgentClient,
    request_id: &str,
    next_sequence: &mut u64,
    output: OutputMode,
    mut pending_control: Option<PendingRunStop>,
    lifecycle: &mut AttachedRunLifecycle,
) -> Result<(), CliError> {
    let deadline = tokio::time::Instant::now() + INTERRUPT_DRAIN_TIMEOUT;
    while tokio::time::Instant::now() < deadline {
        let remaining = deadline.saturating_duration_since(tokio::time::Instant::now());
        let event = match tokio::time::timeout(
            remaining,
            client.next_run_event_with_stop(request_id, *next_sequence, &mut pending_control),
        )
        .await
        {
            Ok(event) => event?,
            Err(_) => return Err(interrupt_drain_timeout_error()),
        };
        *next_sequence = next_sequence.saturating_add(1);
        print_event(output, &event)?;
        if matches!(
            lifecycle.observe(&event.event),
            AttachedRunDisposition::Terminal(_)
        ) {
            return Ok(());
        }
    }
    Err(interrupt_drain_timeout_error())
}

fn interrupt_drain_timeout_error() -> CliError {
    CliError::unavailable(
        "GATEWAY_UNAVAILABLE",
        "Timed out waiting for the terminal run event after Ctrl-C Stop",
    )
}

fn emit_stream_error(
    output: OutputMode,
    request_id: &str,
    sequence: u64,
    error: &CliError,
) -> Result<(), CliError> {
    let event = AgentEventV1 {
        schema_version: AGENT_SCHEMA_VERSION,
        request_id: request_id.to_string(),
        sequence,
        event: AgentEventDataV1::Error(error.as_agent_error()),
    };
    print_event(output, &event)
}

fn child_exit_code(exit_code: Option<i32>, signal: Option<i32>) -> u8 {
    if let Some(signal) = signal {
        return (128_i32.saturating_add(signal)).clamp(1, 255) as u8;
    }
    exit_code.unwrap_or(70).clamp(0, 255) as u8
}

#[cfg(unix)]
fn read_pairing_code() -> Result<String, CliError> {
    use std::fs::OpenOptions;
    use std::os::fd::AsRawFd;

    struct EchoGuard {
        fd: i32,
        original: libc::termios,
    }
    impl Drop for EchoGuard {
        fn drop(&mut self) {
            // SAFETY: `fd` remains open for the lifetime of the guard and the
            // original termios value came from a successful `tcgetattr` call.
            unsafe {
                libc::tcsetattr(self.fd, libc::TCSANOW, &self.original);
            }
        }
    }

    let mut tty = OpenOptions::new()
        .read(true)
        .write(true)
        .open("/dev/tty")
        .map_err(|error| {
            CliError::usage(
                "PAIRING_TTY_REQUIRED",
                format!("Pairing code must be entered from an interactive TTY: {error}"),
            )
        })?;
    tty.write_all(b"ChromVoid pairing code: ")
        .and_then(|_| tty.flush())
        .map_err(|error| CliError::usage("PAIRING_TTY_FAILED", format!("{error}")))?;
    let fd = tty.as_raw_fd();
    let mut original = std::mem::MaybeUninit::<libc::termios>::uninit();
    // SAFETY: `original` points to writable memory and `fd` is a valid TTY.
    if unsafe { libc::tcgetattr(fd, original.as_mut_ptr()) } != 0 {
        return Err(CliError::usage(
            "PAIRING_TTY_FAILED",
            "Could not read TTY settings",
        ));
    }
    // SAFETY: tcgetattr initialized `original` after returning zero.
    let original = unsafe { original.assume_init() };
    let mut hidden = original;
    hidden.c_lflag &= !libc::ECHO;
    // SAFETY: `fd` is valid and `hidden` is derived from its current settings.
    if unsafe { libc::tcsetattr(fd, libc::TCSANOW, &hidden) } != 0 {
        return Err(CliError::usage(
            "PAIRING_TTY_FAILED",
            "Could not disable TTY echo",
        ));
    }
    let guard = EchoGuard { fd, original };
    let reader_file = tty.try_clone().map_err(|error| {
        CliError::usage("PAIRING_TTY_FAILED", format!("Clone TTY handle: {error}"))
    })?;
    let mut line = String::new();
    std::io::BufReader::new(reader_file)
        .read_line(&mut line)
        .map_err(|error| {
            CliError::usage("PAIRING_TTY_FAILED", format!("Read pairing code: {error}"))
        })?;
    drop(guard);
    tty.write_all(b"\n").ok();
    Ok(line.trim().to_string())
}

#[cfg(not(unix))]
fn read_pairing_code() -> Result<String, CliError> {
    Err(CliError::unavailable(
        "PLATFORM_UNSUPPORTED",
        "Vault Env Runtime CLI v1 requires macOS",
    ))
}

#[cfg(test)]
mod tests {
    use chromvoid_product_cli::args::{EnvCommand, RunArgs};
    use chromvoid_protocol::AgentErrorV1;

    use super::*;

    #[test]
    fn command_mapping_never_accepts_arbitrary_run_argv() {
        let command = TopLevelCommand::Env {
            command: EnvCommand::Run(RunArgs {
                profile: "backend".into(),
                preset: "tests".into(),
                reason: None,
            }),
        };
        assert_eq!(
            command_from_args(&command).expect("map command"),
            AgentCommandV1::Run {
                profile: "backend".into(),
                preset: "tests".into(),
                reason: None,
            }
        );
    }

    #[test]
    fn child_status_has_priority_over_cli_exit_classes() {
        assert_eq!(child_exit_code(Some(64), None), 64);
        assert_eq!(child_exit_code(None, Some(2)), 130);
    }

    #[test]
    fn post_start_stream_error_waits_for_authoritative_run_exit() {
        let mut lifecycle = AttachedRunLifecycle::default();
        assert!(matches!(
            lifecycle.observe(&AgentEventDataV1::RunStarted {
                run_id: "run-1".into(),
                process_id: 42,
            }),
            AttachedRunDisposition::Continue
        ));
        assert!(matches!(
            lifecycle.observe(&AgentEventDataV1::Error(AgentErrorV1 {
                code: "OUTPUT_BACKPRESSURE".into(),
                message: "bounded output queue filled".into(),
                retryable: false,
                next_action: Some("reduce_output_and_retry".into()),
            })),
            AttachedRunDisposition::Continue
        ));
        assert!(matches!(
            lifecycle.observe(&AgentEventDataV1::RunExited {
                run_id: "run-1".into(),
                exit_code: Some(23),
                signal: None,
                duration_ms: 10,
            }),
            AttachedRunDisposition::Terminal(23)
        ));
    }

    #[test]
    fn pre_start_stream_error_remains_terminal() {
        let mut lifecycle = AttachedRunLifecycle::default();
        assert!(matches!(
            lifecycle.observe(&AgentEventDataV1::Error(AgentErrorV1 {
                code: "APPROVAL_REJECTED".into(),
                message: "approval rejected".into(),
                retryable: false,
                next_action: Some("respect_user_decision".into()),
            })),
            AttachedRunDisposition::Terminal(77)
        ));
    }

    #[test]
    fn interrupt_drain_timeout_is_an_explicit_typed_stream_failure() {
        let error = interrupt_drain_timeout_error().as_agent_error();
        assert_eq!(error.code, "GATEWAY_UNAVAILABLE");
        assert!(error.retryable);
        assert!(error.message.contains("terminal run event"));
    }
}
