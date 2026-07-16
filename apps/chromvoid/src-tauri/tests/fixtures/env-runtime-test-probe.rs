#[cfg(not(debug_assertions))]
compile_error!("env-runtime-test-probe must never be built with release assertions disabled");

use std::io::{self, Write as _};
use std::time::Duration;

const STDOUT_LEN: usize = 70_017;
const STDERR_LEN: usize = 66_003;

fn payload(seed: usize, len: usize) -> Vec<u8> {
    (0..len)
        .map(|index| ((index.wrapping_mul(31).wrapping_add(seed)) & 0xff) as u8)
        .collect()
}

fn env_matches(name: &str, expected: &str) -> bool {
    std::env::var(name).ok().as_deref() == Some(expected)
}

fn verify() -> i32 {
    let args = std::env::args().skip(1).collect::<Vec<_>>();
    if args != ["verify", "sentinel-arg", "two words", "23"] {
        return 61;
    }
    if !std::env::var("USER").is_ok_and(|value| !value.is_empty()) {
        return 62;
    }
    if !env_matches("W6_PASSTHROUGH", "passthrough-dummy") {
        return 63;
    }
    if !env_matches("W6_PRECEDENCE", "profile-overrides-passthrough") {
        return 64;
    }
    if !env_matches("HOME", "profile-overrides-baseline") {
        return 65;
    }
    if !env_matches("W6_PROFILE_ONLY", "profile-only-dummy") {
        return 66;
    }
    if std::env::var_os("W6_NOT_ALLOWED").is_some() {
        return 67;
    }
    if !std::env::current_dir().is_ok_and(|cwd| cwd.join(".env-runtime-test-cwd").is_file()) {
        return 68;
    }

    if io::stdout().write_all(&payload(17, STDOUT_LEN)).is_err() {
        return 69;
    }
    if io::stdout().flush().is_err() {
        return 70;
    }
    if io::stderr().write_all(&payload(93, STDERR_LEN)).is_err() {
        return 71;
    }
    if io::stderr().flush().is_err() {
        return 72;
    }
    23
}

fn wait_forever() -> i32 {
    let args = std::env::args().skip(1).collect::<Vec<_>>();
    if args != ["wait"] {
        return 73;
    }
    let _ = io::stdout().write_all(b"ready\0\xff");
    let _ = io::stdout().flush();
    loop {
        std::thread::sleep(Duration::from_secs(60));
    }
}

fn saturate_output() -> i32 {
    let args = std::env::args().skip(1).collect::<Vec<_>>();
    if args != ["backpressure"] {
        return 74;
    }
    let block = payload(211, 32 * 1024);
    for _ in 0..512 {
        if io::stdout().write_all(&block).is_err() {
            return 0;
        }
        if io::stderr().write_all(&block).is_err() {
            return 0;
        }
    }
    let _ = io::stdout().flush();
    let _ = io::stderr().flush();
    std::thread::sleep(Duration::from_secs(60));
    0
}

fn touch_marker() -> i32 {
    let args = std::env::args().skip(1).collect::<Vec<_>>();
    let [mode, marker] = args.as_slice() else {
        return 75;
    };
    if mode != "touch" {
        return 76;
    }
    if std::fs::write(marker, b"spawned").is_err() {
        return 77;
    }
    0
}

fn canary() -> i32 {
    let args = std::env::args().skip(1).collect::<Vec<_>>();
    let [mode, marker] = args.as_slice() else {
        return 78;
    };
    if mode != "canary"
        || marker.is_empty()
        || marker.len() > 64
        || !marker
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.'))
    {
        return 79;
    }
    if !std::env::var("CHROMVOID_CANARY_SECRET").is_ok_and(|value| !value.is_empty()) {
        return 80;
    }
    if !env_matches("CHROMVOID_CANARY_PRECEDENCE", "profile-wins") {
        return 81;
    }

    // Deliberately emit only the operator-supplied non-secret marker. Env
    // values are validated in-process and never copied into child output.
    if writeln!(io::stdout(), "chromvoid-env-runtime-canary:{marker}").is_err() {
        return 82;
    }
    if writeln!(io::stderr(), "chromvoid-env-runtime-canary-stderr:{marker}").is_err() {
        return 83;
    }
    0
}

fn main() {
    let mode = std::env::args().nth(1);
    let code = match mode.as_deref() {
        Some("verify") => verify(),
        Some("wait") => wait_forever(),
        Some("backpressure") => saturate_output(),
        Some("touch") => touch_marker(),
        Some("canary") => canary(),
        _ => 60,
    };
    std::process::exit(code);
}
