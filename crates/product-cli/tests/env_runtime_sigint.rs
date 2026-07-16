#![cfg(unix)]

use std::io::{BufRead, BufReader, Read};
use std::net::TcpListener as StdTcpListener;
use std::process::{Child, Command, ExitStatus, Stdio};
use std::sync::mpsc::{self, Receiver, RecvTimeoutError};
use std::thread;
use std::time::{Duration, Instant};

use base64::Engine;
use chromvoid_product_cli::config::{
    ConfigStore, FileIdentityStore, IdentityStore, NoiseIdentity, PublicConfig,
    TEST_CONFIG_PATH_ENV, TEST_IDENTITY_PATH_ENV,
};
use chromvoid_protocol::{
    AgentCommandV1, AgentErrorV1, AgentEventDataV1, AgentEventV1, AgentHelloV1, AgentRequestV1,
    AgentResponseDataV1, AgentResponseV1, AgentRunMetadataV1, AgentRunStatusV1, Frame, FrameType,
    AGENT_SCHEMA_VERSION, MAX_HANDSHAKE_MSG, NOISE_PARAMS_IK,
};
use futures_util::{SinkExt, StreamExt};
use snow::params::NoiseParams;
use tokio::net::{TcpListener, TcpStream};
use tokio_tungstenite::tungstenite::handshake::server::{Request, Response};
use tokio_tungstenite::tungstenite::protocol::Message;
use tokio_tungstenite::{accept_hdr_async, WebSocketStream};

const RUN_ID: &str = "run-sigint-integration";
const POST_STOP_STDOUT: &[u8] = b"post-stop stdout\n";
const POST_STOP_STDERR: &[u8] = b"post-stop stderr\n";
const TEST_TIMEOUT: Duration = Duration::from_secs(15);

#[derive(Debug, Default)]
struct GatewayObservation {
    commands: Vec<AgentCommandV1>,
    terminal_event_sent: bool,
}

#[derive(Debug, Default)]
struct CliOutput {
    raw_lines: Vec<Vec<u8>>,
    responses: Vec<AgentResponseV1>,
    events: Vec<AgentEventV1>,
}

impl CliOutput {
    fn push(&mut self, line: Vec<u8>) {
        let value: serde_json::Value = serde_json::from_slice(&line).unwrap_or_else(|error| {
            panic!(
                "CLI emitted invalid JSONL ({error}): {}",
                String::from_utf8_lossy(&line)
            )
        });
        if value.get("event").is_some() {
            self.events
                .push(serde_json::from_value(value).expect("CLI event must match AgentEventV1"));
        } else {
            self.responses.push(
                serde_json::from_value(value).expect("CLI response must match AgentResponseV1"),
            );
        }
        self.raw_lines.push(line);
    }

    fn diagnostic(&self) -> String {
        self.raw_lines
            .iter()
            .map(|line| String::from_utf8_lossy(line))
            .collect::<String>()
    }
}

struct ChildGuard {
    child: Child,
    reaped: bool,
}

impl ChildGuard {
    fn new(child: Child) -> Self {
        Self {
            child,
            reaped: false,
        }
    }

    fn wait_for_exit(&mut self, deadline: Instant) -> ExitStatus {
        loop {
            if let Some(status) = self.child.try_wait().expect("poll chromvoid subprocess") {
                self.reaped = true;
                return status;
            }
            assert!(
                Instant::now() < deadline,
                "chromvoid subprocess did not exit before the test deadline"
            );
            thread::sleep(Duration::from_millis(20));
        }
    }
}

impl Drop for ChildGuard {
    fn drop(&mut self) {
        if !self.reaped {
            let _ = self.child.kill();
            let _ = self.child.wait();
        }
    }
}

#[test]
fn real_cli_sigint_drains_delayed_error_and_terminal_output_then_exits_130() {
    let temp = tempfile::tempdir().expect("create CLI integration tempdir");
    let config_path = temp.path().join("cli.json");
    let identity_path = temp.path().join("noise-identity.json");

    let client_identity = NoiseIdentity::generate().expect("generate CLI Noise identity");
    let noise_params: NoiseParams = NOISE_PARAMS_IK.parse().expect("parse Noise IK params");
    let server_keypair = snow::Builder::new(noise_params)
        .generate_keypair()
        .expect("generate Gateway Noise identity");

    let listener = StdTcpListener::bind("127.0.0.1:0").expect("bind loopback Gateway");
    listener
        .set_nonblocking(true)
        .expect("make loopback listener nonblocking");
    let endpoint = format!(
        "ws://127.0.0.1:{}",
        listener.local_addr().expect("loopback address").port()
    );

    let mut config = PublicConfig::new(client_identity.actor_id(), &server_keypair.public)
        .expect("construct CLI config");
    config.endpoint = endpoint;
    ConfigStore::at(config_path.clone())
        .save(&config)
        .expect("write explicit temp CLI config");
    FileIdentityStore::at(identity_path.clone())
        .save(&client_identity)
        .expect("write file-backed test Noise identity");

    let gateway = spawn_gateway(
        listener,
        server_keypair.private,
        client_identity.public_key().to_vec(),
        client_identity.actor_id(),
    );

    let mut child = ChildGuard::new(
        Command::new(env!("CARGO_BIN_EXE_chromvoid"))
            .env(TEST_CONFIG_PATH_ENV, &config_path)
            .env(TEST_IDENTITY_PATH_ENV, &identity_path)
            .args([
                "--jsonl",
                "env",
                "run",
                "--profile",
                "backend",
                "--preset",
                "tests",
                "--reason",
                "Exercise graceful interrupt integration",
            ])
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .expect("spawn actual chromvoid binary"),
    );

    let stdout = child.child.stdout.take().expect("capture CLI stdout");
    let stderr = child.child.stderr.take().expect("capture CLI stderr");
    let (stdout_rx, stdout_reader) = spawn_line_reader(stdout);
    let stderr_reader = thread::spawn(move || {
        let mut bytes = Vec::new();
        BufReader::new(stderr)
            .read_to_end(&mut bytes)
            .expect("read CLI stderr");
        bytes
    });

    let deadline = Instant::now() + TEST_TIMEOUT;
    let mut output = CliOutput::default();
    while !output
        .events
        .iter()
        .any(|event| matches!(event.event, AgentEventDataV1::RunStarted { .. }))
    {
        let line = recv_line_before(&stdout_rx, deadline, &output);
        output.push(line);
    }

    assert_eq!(output.responses.len(), 1, "{}", output.diagnostic());
    let initial_run = match output.responses[0].data.as_ref() {
        Some(AgentResponseDataV1::Run(run)) => run,
        other => panic!("expected initial run response, got {other:?}"),
    };
    assert!(output.responses[0].ok);
    assert_eq!(initial_run.id, RUN_ID);
    let started = output.events.last().expect("run_started event");
    assert_eq!(started.sequence, 1);
    assert!(matches!(
        &started.event,
        AgentEventDataV1::RunStarted { run_id, .. } if run_id == RUN_ID
    ));

    // The OS signal is deliberately sent only after the typed run_started
    // event has crossed the real CLI stdout boundary.
    let signal_result = unsafe { libc::kill(child.child.id() as i32, libc::SIGINT) };
    assert_eq!(
        signal_result,
        0,
        "send SIGINT to chromvoid subprocess: {}",
        std::io::Error::last_os_error()
    );

    while Instant::now() < deadline {
        match stdout_rx.recv_timeout(Duration::from_millis(50)) {
            Ok(line) => output.push(line),
            Err(RecvTimeoutError::Timeout) => {}
            Err(RecvTimeoutError::Disconnected) => break,
        }
        if child
            .child
            .try_wait()
            .expect("poll interrupted chromvoid subprocess")
            .is_some()
        {
            break;
        }
    }
    let status = child.wait_for_exit(deadline);
    stdout_reader.join().expect("join CLI stdout reader");
    while let Ok(line) = stdout_rx.try_recv() {
        output.push(line);
    }
    let stderr = stderr_reader.join().expect("join CLI stderr reader");

    assert_eq!(status.code(), Some(130), "{}", output.diagnostic());
    assert!(
        stderr.is_empty(),
        "unexpected CLI stderr: {}",
        String::from_utf8_lossy(&stderr)
    );
    assert_eq!(
        output
            .events
            .iter()
            .map(|event| event.sequence)
            .collect::<Vec<_>>(),
        vec![1, 2, 3, 4, 5, 6],
        "{}",
        output.diagnostic()
    );
    assert!(matches!(
        output.events[1].event,
        AgentEventDataV1::SignalForwarded {
            ref run_id,
            signal: libc::SIGTERM,
        } if run_id == RUN_ID
    ));
    assert_output_event(&output.events[2], POST_STOP_STDOUT, true);
    assert_output_event(&output.events[3], POST_STOP_STDERR, false);
    assert!(matches!(
        output.events[4].event,
        AgentEventDataV1::Error(AgentErrorV1 { ref code, .. })
            if code == "OUTPUT_BACKPRESSURE"
    ));
    assert!(matches!(
        output.events[5].event,
        AgentEventDataV1::RunExited {
            ref run_id,
            exit_code: None,
            signal: Some(libc::SIGTERM),
            ..
        } if run_id == RUN_ID
    ));

    let observation = gateway
        .join()
        .expect("join loopback Gateway thread")
        .expect("loopback Gateway completed protocol");
    assert!(observation.terminal_event_sent);
    let stop_commands = observation
        .commands
        .iter()
        .filter_map(|command| match command {
            AgentCommandV1::RunStop { run_id } => Some(run_id.as_str()),
            _ => None,
        })
        .collect::<Vec<_>>();
    assert_eq!(stop_commands, vec![RUN_ID], "{:#?}", observation.commands);
    assert_eq!(observation.commands.len(), 3, "{:#?}", observation.commands);
    assert!(matches!(
        observation.commands[0],
        AgentCommandV1::Hello { .. }
    ));
    assert!(matches!(
        observation.commands[1],
        AgentCommandV1::Run { .. }
    ));
    assert!(matches!(
        observation.commands[2],
        AgentCommandV1::RunStop { .. }
    ));
}

fn assert_output_event(event: &AgentEventV1, expected: &[u8], stdout: bool) {
    let encoded = match (&event.event, stdout) {
        (
            AgentEventDataV1::Stdout {
                run_id,
                data_base64,
            },
            true,
        )
        | (
            AgentEventDataV1::Stderr {
                run_id,
                data_base64,
            },
            false,
        ) => {
            assert_eq!(run_id, RUN_ID);
            data_base64
        }
        other => panic!("unexpected post-stop output event: {other:?}"),
    };
    assert_eq!(
        base64::engine::general_purpose::STANDARD
            .decode(encoded)
            .expect("decode post-stop output"),
        expected
    );
}

fn spawn_line_reader(
    stdout: impl Read + Send + 'static,
) -> (Receiver<Vec<u8>>, thread::JoinHandle<()>) {
    let (sender, receiver) = mpsc::channel();
    let handle = thread::spawn(move || {
        let mut reader = BufReader::new(stdout);
        loop {
            let mut line = Vec::new();
            let read = reader
                .read_until(b'\n', &mut line)
                .expect("read CLI JSONL line");
            if read == 0 {
                break;
            }
            if sender.send(line).is_err() {
                break;
            }
        }
    });
    (receiver, handle)
}

fn recv_line_before(
    receiver: &Receiver<Vec<u8>>,
    deadline: Instant,
    output: &CliOutput,
) -> Vec<u8> {
    let remaining = deadline.saturating_duration_since(Instant::now());
    assert!(
        !remaining.is_zero(),
        "timed out waiting for run_started; output={}",
        output.diagnostic()
    );
    receiver.recv_timeout(remaining).unwrap_or_else(|error| {
        panic!(
            "failed waiting for run_started ({error}); output={}",
            output.diagnostic()
        )
    })
}

fn spawn_gateway(
    listener: StdTcpListener,
    server_private_key: Vec<u8>,
    expected_client_public_key: Vec<u8>,
    actor_id: String,
) -> thread::JoinHandle<Result<GatewayObservation, String>> {
    thread::spawn(move || {
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .map_err(|error| format!("build Gateway runtime: {error}"))?;
        runtime.block_on(async move {
            tokio::time::timeout(
                TEST_TIMEOUT,
                serve_gateway(
                    listener,
                    server_private_key,
                    expected_client_public_key,
                    actor_id,
                ),
            )
            .await
            .map_err(|_| "loopback Gateway timed out".to_string())?
        })
    })
}

async fn serve_gateway(
    listener: StdTcpListener,
    server_private_key: Vec<u8>,
    expected_client_public_key: Vec<u8>,
    actor_id: String,
) -> Result<GatewayObservation, String> {
    let listener = TcpListener::from_std(listener)
        .map_err(|error| format!("adopt loopback listener: {error}"))?;
    let (stream, _) = listener
        .accept()
        .await
        .map_err(|error| format!("accept CLI connection: {error}"))?;
    let mut agent_path_seen = false;
    let mut websocket = accept_hdr_async(stream, |request: &Request, response: Response| {
        agent_path_seen = request.uri().path() == "/agent";
        Ok(response)
    })
    .await
    .map_err(|error| format!("accept CLI WebSocket: {error}"))?;
    if !agent_path_seen {
        return Err("CLI did not connect to the /agent Gateway route".into());
    }

    let first_message = next_binary(&mut websocket, "Noise IK initiator message").await?;
    let params: NoiseParams = NOISE_PARAMS_IK
        .parse()
        .map_err(|error| format!("parse Noise IK params: {error}"))?;
    let mut handshake = snow::Builder::new(params)
        .local_private_key(&server_private_key)
        .map_err(|error| format!("set Gateway Noise identity: {error}"))?
        .build_responder()
        .map_err(|error| format!("build Noise IK responder: {error}"))?;
    let mut handshake_buffer = vec![0_u8; MAX_HANDSHAKE_MSG];
    handshake
        .read_message(&first_message, &mut handshake_buffer)
        .map_err(|error| format!("read Noise IK initiator: {error}"))?;
    if handshake.get_remote_static() != Some(expected_client_public_key.as_slice()) {
        return Err("Noise IK initiator identity did not match the test CLI identity".into());
    }
    let response_length = handshake
        .write_message(&[], &mut handshake_buffer)
        .map_err(|error| format!("write Noise IK response: {error}"))?;
    websocket
        .send(Message::Binary(
            handshake_buffer[..response_length].to_vec().into(),
        ))
        .await
        .map_err(|error| format!("send Noise IK response: {error}"))?;
    let mut transport = handshake
        .into_transport_mode()
        .map_err(|error| format!("enter Noise transport mode: {error}"))?;

    let mut observation = GatewayObservation::default();
    let mut run_request_id = None::<String>;
    let mut server_message_id = 40_000_u64;

    loop {
        let next = websocket.next().await;
        let message = match next {
            Some(Ok(message)) => message,
            Some(Err(_)) if observation.terminal_event_sent => break,
            Some(Err(error)) => return Err(format!("read CLI WebSocket: {error}")),
            None => break,
        };
        let ciphertext = match message {
            Message::Binary(ciphertext) => ciphertext,
            Message::Ping(bytes) => {
                websocket
                    .send(Message::Pong(bytes))
                    .await
                    .map_err(|error| format!("reply to CLI ping: {error}"))?;
                continue;
            }
            Message::Close(_) => break,
            _ => continue,
        };
        let frame = decrypt_frame(&mut transport, ciphertext.as_ref())?;
        if frame.frame_type != FrameType::RpcRequest || frame.flags != 0 {
            return Err("CLI sent an unexpected physical request frame".into());
        }
        let request: AgentRequestV1 = serde_json::from_slice(&frame.payload)
            .map_err(|error| format!("decode AgentRequestV1: {error}"))?;
        observation.commands.push(request.command.clone());

        match request.command {
            AgentCommandV1::Hello { .. } => {
                let response = AgentResponseV1::success(
                    request.request_id,
                    AgentResponseDataV1::Hello(AgentHelloV1 {
                        desktop_version: "integration-test".into(),
                        capabilities: vec!["env_runtime_v1".into(), "attached_run_v1".into()],
                    }),
                );
                send_response(&mut websocket, &mut transport, frame.message_id, &response).await?;
            }
            AgentCommandV1::Run { .. } => {
                if run_request_id.is_some() {
                    return Err("CLI submitted more than one run command".into());
                }
                run_request_id = Some(request.request_id.clone());
                let response = AgentResponseV1::success(
                    request.request_id.clone(),
                    AgentResponseDataV1::Run(AgentRunMetadataV1 {
                        id: RUN_ID.into(),
                        actor_id: actor_id.clone(),
                        profile_id: "profile-backend".into(),
                        preset_id: "preset-tests".into(),
                        status: AgentRunStatusV1::Running,
                        process_id: Some(42_424),
                        started_at_epoch_ms: Some(1),
                        finished_at_epoch_ms: None,
                        exit_code: None,
                        signal: None,
                    }),
                );
                send_response(&mut websocket, &mut transport, frame.message_id, &response).await?;
                send_event(
                    &mut websocket,
                    &mut transport,
                    &mut server_message_id,
                    AgentEventV1 {
                        schema_version: AGENT_SCHEMA_VERSION,
                        request_id: request.request_id,
                        sequence: 1,
                        event: AgentEventDataV1::RunStarted {
                            run_id: RUN_ID.into(),
                            process_id: 42_424,
                        },
                    },
                )
                .await?;
            }
            AgentCommandV1::RunStop { ref run_id } => {
                if run_id != RUN_ID {
                    return Err(format!("CLI stopped unexpected run {run_id}"));
                }
                let stream_request_id = run_request_id
                    .clone()
                    .ok_or_else(|| "run_stop arrived before run".to_string())?;
                let response = AgentResponseV1::error(
                    request.request_id,
                    AgentErrorV1 {
                        code: "RUN_ALREADY_TERMINAL".into(),
                        message: "Run already reached a terminal state".into(),
                        retryable: false,
                        next_action: Some("refresh_runs".into()),
                    },
                );
                send_response(&mut websocket, &mut transport, frame.message_id, &response).await?;
                send_event(
                    &mut websocket,
                    &mut transport,
                    &mut server_message_id,
                    AgentEventV1 {
                        schema_version: AGENT_SCHEMA_VERSION,
                        request_id: stream_request_id.clone(),
                        sequence: 2,
                        event: AgentEventDataV1::SignalForwarded {
                            run_id: RUN_ID.into(),
                            signal: libc::SIGTERM,
                        },
                    },
                )
                .await?;
                // Exercise the production grace window: the runtime may spend
                // three seconds on SIGTERM, then force-kill and reap/flush the
                // process before publishing its final error and run_exited.
                tokio::time::sleep(Duration::from_millis(4_250)).await;
                send_event(
                    &mut websocket,
                    &mut transport,
                    &mut server_message_id,
                    AgentEventV1 {
                        schema_version: AGENT_SCHEMA_VERSION,
                        request_id: stream_request_id.clone(),
                        sequence: 3,
                        event: AgentEventDataV1::Stdout {
                            run_id: RUN_ID.into(),
                            data_base64: base64::engine::general_purpose::STANDARD
                                .encode(POST_STOP_STDOUT),
                        },
                    },
                )
                .await?;
                send_event(
                    &mut websocket,
                    &mut transport,
                    &mut server_message_id,
                    AgentEventV1 {
                        schema_version: AGENT_SCHEMA_VERSION,
                        request_id: stream_request_id.clone(),
                        sequence: 4,
                        event: AgentEventDataV1::Stderr {
                            run_id: RUN_ID.into(),
                            data_base64: base64::engine::general_purpose::STANDARD
                                .encode(POST_STOP_STDERR),
                        },
                    },
                )
                .await?;
                send_event(
                    &mut websocket,
                    &mut transport,
                    &mut server_message_id,
                    AgentEventV1 {
                        schema_version: AGENT_SCHEMA_VERSION,
                        request_id: stream_request_id.clone(),
                        sequence: 5,
                        event: AgentEventDataV1::Error(AgentErrorV1 {
                            code: "OUTPUT_BACKPRESSURE".into(),
                            message: "Run output exceeded the bounded delivery queue".into(),
                            retryable: false,
                            next_action: Some("reduce_output_and_retry".into()),
                        }),
                    },
                )
                .await?;
                send_event(
                    &mut websocket,
                    &mut transport,
                    &mut server_message_id,
                    AgentEventV1 {
                        schema_version: AGENT_SCHEMA_VERSION,
                        request_id: stream_request_id,
                        sequence: 6,
                        event: AgentEventDataV1::RunExited {
                            run_id: RUN_ID.into(),
                            exit_code: None,
                            signal: Some(libc::SIGTERM),
                            duration_ms: 10,
                        },
                    },
                )
                .await?;
                observation.terminal_event_sent = true;
            }
            other => return Err(format!("unexpected CLI command: {other:?}")),
        }
    }

    Ok(observation)
}

async fn next_binary(
    websocket: &mut WebSocketStream<TcpStream>,
    phase: &str,
) -> Result<Vec<u8>, String> {
    match websocket.next().await {
        Some(Ok(Message::Binary(bytes))) => Ok(bytes.to_vec()),
        Some(Ok(other)) => Err(format!("expected binary {phase}, received {other:?}")),
        Some(Err(error)) => Err(format!("read {phase}: {error}")),
        None => Err(format!("WebSocket closed before {phase}")),
    }
}

fn decrypt_frame(transport: &mut snow::TransportState, ciphertext: &[u8]) -> Result<Frame, String> {
    let mut plaintext = vec![0_u8; MAX_HANDSHAKE_MSG];
    let length = transport
        .read_message(ciphertext, &mut plaintext)
        .map_err(|error| format!("decrypt CLI frame: {error}"))?;
    plaintext.truncate(length);
    Frame::decode(&plaintext).map_err(|error| format!("decode CLI frame: {error}"))
}

async fn send_response(
    websocket: &mut WebSocketStream<TcpStream>,
    transport: &mut snow::TransportState,
    message_id: u64,
    response: &AgentResponseV1,
) -> Result<(), String> {
    let payload =
        serde_json::to_vec(response).map_err(|error| format!("encode AgentResponseV1: {error}"))?;
    send_frame(
        websocket,
        transport,
        Frame {
            frame_type: FrameType::RpcResponse,
            message_id,
            flags: 0,
            payload,
        },
    )
    .await
}

async fn send_event(
    websocket: &mut WebSocketStream<TcpStream>,
    transport: &mut snow::TransportState,
    server_message_id: &mut u64,
    event: AgentEventV1,
) -> Result<(), String> {
    *server_message_id = server_message_id.wrapping_add(1).max(1);
    let payload =
        serde_json::to_vec(&event).map_err(|error| format!("encode AgentEventV1: {error}"))?;
    send_frame(
        websocket,
        transport,
        Frame {
            frame_type: FrameType::RpcRequest,
            message_id: *server_message_id,
            flags: 0,
            payload,
        },
    )
    .await
}

async fn send_frame(
    websocket: &mut WebSocketStream<TcpStream>,
    transport: &mut snow::TransportState,
    frame: Frame,
) -> Result<(), String> {
    let plaintext = frame.encode();
    let mut ciphertext = vec![0_u8; MAX_HANDSHAKE_MSG];
    let length = transport
        .write_message(&plaintext, &mut ciphertext)
        .map_err(|error| format!("encrypt Gateway frame: {error}"))?;
    ciphertext.truncate(length);
    websocket
        .send(Message::Binary(ciphertext.into()))
        .await
        .map_err(|error| format!("send Gateway frame: {error}"))
}
