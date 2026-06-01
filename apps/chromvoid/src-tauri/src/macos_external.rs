#![cfg(target_os = "macos")]

use std::ffi::OsString;
use std::process::{Command, Output, Stdio};
use std::time::Duration;

const COMMAND_OUTPUT_LIMIT: usize = 4096;

pub(crate) fn run_output(program: &str, args: Vec<OsString>) -> Result<Output, String> {
    Command::new(program)
        .args(&args)
        .output()
        .map_err(|error| format!("Failed to run {program}: {error}"))
}

pub(crate) async fn run_output_with_timeout(
    program: &'static str,
    args: Vec<OsString>,
    timeout_duration: Duration,
) -> Result<Output, String> {
    run_blocking_with_timeout(program, timeout_duration, move || run_output(program, args)).await
}

pub(crate) async fn run_blocking_with_timeout<T, F>(
    label: &'static str,
    timeout_duration: Duration,
    task: F,
) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T, String> + Send + 'static,
{
    let task = tokio::task::spawn_blocking(task);
    tokio::time::timeout(timeout_duration, task)
        .await
        .map_err(|_| format!("{label} timed out"))?
        .map_err(|error| format!("{label} task failed: {error}"))?
}

pub(crate) fn spawn_best_effort(program: &str, args: Vec<OsString>) -> Result<(), String> {
    Command::new(program)
        .args(&args)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map(|_| ())
        .map_err(|error| format!("Failed to spawn {program}: {error}"))
}

pub(crate) fn output_message(output: &Output, fallback: &str) -> String {
    let stderr = limited_lossy(&output.stderr);
    let stdout = limited_lossy(&output.stdout);
    let msg = stderr.trim();
    let msg = if msg.is_empty() { stdout.trim() } else { msg };
    if msg.is_empty() {
        fallback.to_string()
    } else {
        msg.to_string()
    }
}

fn limited_lossy(bytes: &[u8]) -> String {
    if bytes.len() <= COMMAND_OUTPUT_LIMIT {
        return String::from_utf8_lossy(bytes).into_owned();
    }

    let mut text = String::from_utf8_lossy(&bytes[..COMMAND_OUTPUT_LIMIT]).into_owned();
    text.push_str("\n... output truncated ...");
    text
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::os::unix::process::ExitStatusExt;

    #[test]
    fn output_message_prefers_stderr_and_truncates() {
        let output = Output {
            status: std::process::ExitStatus::from_raw(1),
            stdout: b"stdout".to_vec(),
            stderr: vec![b'x'; COMMAND_OUTPUT_LIMIT + 8],
        };

        let message = output_message(&output, "fallback");

        assert!(message.starts_with("xxx"));
        assert!(message.contains("output truncated"));
        assert!(!message.contains("stdout"));
    }
}
