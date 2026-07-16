use std::process::Command;

#[cfg(unix)]
use std::path::{Path, PathBuf};
#[cfg(unix)]
use std::process::Output;

use chromvoid_product_cli::guide::AGENT_GUIDE;
use chromvoid_protocol::AgentResponseV1;

fn cli() -> Command {
    Command::new(env!("CARGO_BIN_EXE_chromvoid"))
}

#[cfg(unix)]
fn clean_home_command(binary: &Path, home: &Path) -> Command {
    let mut command = Command::new(binary);
    command
        .env_clear()
        .env("HOME", home)
        .env("PATH", home.join(".local/bin"))
        .current_dir(home);
    command
}

#[cfg(unix)]
fn assert_success(output: &Output, context: &str) {
    assert!(
        output.status.success(),
        "{context} failed: status={:?}, stdout={}, stderr={}",
        output.status.code(),
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
}

#[test]
fn bundled_binary_reports_the_package_version() {
    let output = cli().arg("--version").output().expect("run chromvoid");

    assert!(output.status.success());
    assert_eq!(
        String::from_utf8(output.stdout).expect("utf8 version"),
        format!("chromvoid {}\n", env!("CARGO_PKG_VERSION"))
    );
}

#[test]
fn machine_local_error_is_one_agent_response_line_with_ex_usage() {
    let output = cli()
        .args(["--json", "env", "agent-guide"])
        .output()
        .expect("run chromvoid");
    assert_eq!(output.status.code(), Some(64));
    assert_eq!(
        output.stdout.iter().filter(|byte| **byte == b'\n').count(),
        1
    );
    let response: AgentResponseV1 =
        serde_json::from_slice(&output.stdout).expect("parse machine response");
    assert!(!response.ok);
    assert_eq!(
        response.error.expect("error").code,
        "OUTPUT_MODE_UNSUPPORTED"
    );
}

#[test]
fn bundled_guide_is_available_without_gateway_or_keychain() {
    let output = cli()
        .args(["env", "agent-guide"])
        .output()
        .expect("run chromvoid");
    assert!(output.status.success());
    assert_eq!(output.stdout, AGENT_GUIDE.as_bytes());
}

#[cfg(unix)]
#[test]
fn real_cli_runs_through_a_managed_symlink_in_a_clean_home() {
    use std::os::unix::fs::symlink;

    let root = tempfile::tempdir().expect("temp clean-home root");
    let home = root.path().join("home");
    let bin_dir = home.join(".local/bin");
    std::fs::create_dir_all(&bin_dir).expect("create clean-home bin directory");

    let real_cli = PathBuf::from(env!("CARGO_BIN_EXE_chromvoid"))
        .canonicalize()
        .expect("canonical real CLI path");
    let managed_link = bin_dir.join("chromvoid");
    symlink(&real_cli, &managed_link).expect("create managed CLI symlink");
    assert_eq!(std::fs::read_link(&managed_link).unwrap(), real_cli);

    let version = clean_home_command(&managed_link, &home)
        .arg("--version")
        .output()
        .expect("execute real CLI version through symlink");
    assert_success(&version, "clean-home version smoke");
    assert_eq!(
        String::from_utf8(version.stdout).expect("UTF-8 version"),
        format!("chromvoid {}\n", env!("CARGO_PKG_VERSION"))
    );

    let guide = clean_home_command(&managed_link, &home)
        .args(["env", "agent-guide"])
        .output()
        .expect("execute real CLI guide through symlink");
    assert_success(&guide, "clean-home agent guide smoke");
    assert_eq!(guide.stdout, AGENT_GUIDE.as_bytes());
}

#[test]
fn clap_usage_errors_use_ex_usage() {
    let output = cli()
        .args(["--json", "--jsonl", "env", "status"])
        .output()
        .expect("run chromvoid");
    assert_eq!(output.status.code(), Some(64));
    assert!(output.stdout.is_empty());
}
