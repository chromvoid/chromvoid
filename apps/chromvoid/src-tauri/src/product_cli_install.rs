use std::path::{Path, PathBuf};

use serde::Serialize;

const PRODUCT_CLI_BUNDLE_NAME: &str = "chromvoid-agent";
const PRODUCT_CLI_INSTALL_NAME: &str = "chromvoid";

#[derive(Debug, Serialize)]
pub(crate) struct ProductCliInstallStatus {
    supported: bool,
    bundled_path: Option<String>,
    bundled_version: Option<String>,
    installed_path: Option<String>,
    installed_version: Option<String>,
    installed: bool,
    managed_link: bool,
}

#[derive(Debug)]
pub(crate) struct ProductCliPaths {
    bundled: PathBuf,
    home: PathBuf,
    installed: PathBuf,
}

impl ProductCliPaths {
    pub(crate) fn for_current_process() -> Result<Self, String> {
        let bundled = std::env::current_exe()
            .map_err(|error| format!("Resolve app executable: {error}"))?
            .parent()
            .ok_or_else(|| "App executable path has no parent".to_string())?
            .join(PRODUCT_CLI_BUNDLE_NAME);
        let account_home = PathBuf::from(current_user_home()?);
        Self::from_bundled_and_home(bundled, account_home)
    }

    fn from_bundled_and_home(bundled: PathBuf, account_home: PathBuf) -> Result<Self, String> {
        if !bundled.is_absolute() {
            return Err("Bundled chromvoid CLI path is not absolute".to_string());
        }
        if !account_home.is_absolute() {
            return Err("Current macOS user home is not absolute".to_string());
        }
        let home = std::fs::canonicalize(&account_home)
            .map_err(|error| format!("Resolve canonical macOS user home: {error}"))?;
        let installed = home
            .join(".local")
            .join("bin")
            .join(PRODUCT_CLI_INSTALL_NAME);
        Ok(Self {
            bundled,
            home,
            installed,
        })
    }
}

#[cfg(target_os = "macos")]
#[derive(Debug)]
pub(crate) struct ProductCliInstallError {
    pub(crate) code: &'static str,
    pub(crate) message: String,
}

#[cfg(target_os = "macos")]
impl ProductCliInstallError {
    fn conflict(message: impl Into<String>) -> Self {
        Self {
            code: "CLI_INSTALL_CONFLICT",
            message: message.into(),
        }
    }

    fn failed(message: impl Into<String>) -> Self {
        Self {
            code: "CLI_INSTALL_FAILED",
            message: message.into(),
        }
    }
}

pub(crate) fn product_cli_install_status_for_paths(
    paths: &ProductCliPaths,
) -> ProductCliInstallStatus {
    let bundled_available = product_cli_is_bundled(paths);
    #[cfg(target_os = "macos")]
    let managed_link = bundled_available && managed_product_cli_link(paths);
    #[cfg(not(target_os = "macos"))]
    let managed_link = false;
    let bundled_version = bundled_available
        .then(|| product_cli_version(&paths.bundled))
        .flatten();
    let installed_version = managed_link
        .then(|| product_cli_version(&paths.installed))
        .flatten();
    let installed = managed_link
        && bundled_version.is_some()
        && installed_version.as_ref() == bundled_version.as_ref();

    ProductCliInstallStatus {
        supported: cfg!(target_os = "macos"),
        bundled_path: Some(paths.bundled.to_string_lossy().to_string()),
        bundled_version,
        installed_path: Some(paths.installed.to_string_lossy().to_string()),
        installed_version,
        installed,
        managed_link,
    }
}

fn product_cli_version(path: &Path) -> Option<String> {
    let output = std::process::Command::new(path)
        .arg("--version")
        .env_clear()
        .env("PATH", "/usr/bin:/bin")
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let stdout = String::from_utf8(output.stdout).ok()?;
    stdout
        .trim()
        .strip_prefix("chromvoid ")
        .filter(|version| !version.is_empty())
        .map(str::to_string)
}

pub(crate) fn product_cli_is_bundled(paths: &ProductCliPaths) -> bool {
    is_executable_regular_file(&paths.bundled)
}

#[cfg(unix)]
fn is_executable_regular_file(path: &Path) -> bool {
    use std::os::unix::fs::PermissionsExt as _;

    std::fs::symlink_metadata(path).is_ok_and(|metadata| {
        metadata.file_type().is_file() && metadata.permissions().mode() & 0o111 != 0
    })
}

#[cfg(not(unix))]
fn is_executable_regular_file(path: &Path) -> bool {
    path.is_file()
}

#[cfg(target_os = "macos")]
#[derive(Debug, PartialEq, Eq)]
enum ProductCliLinkState {
    Missing,
    Managed,
    Conflict,
}

#[cfg(target_os = "macos")]
fn managed_product_cli_link(paths: &ProductCliPaths) -> bool {
    open_product_cli_parent(&paths.home, false)
        .and_then(|parent| product_cli_link_state(&parent, &paths.bundled))
        .is_ok_and(|state| state == ProductCliLinkState::Managed)
}

#[cfg(target_os = "macos")]
pub(crate) fn install_product_cli_link(
    paths: &ProductCliPaths,
) -> Result<(), ProductCliInstallError> {
    use std::ffi::CString;
    use std::os::fd::AsRawFd as _;
    use std::os::unix::ffi::OsStrExt as _;

    let parent = open_product_cli_parent(&paths.home, true).map_err(|error| {
        ProductCliInstallError::failed(format!(
            "Refusing unsafe CLI install parent below the account home: {error}"
        ))
    })?;
    match product_cli_link_state(&parent, &paths.bundled).map_err(|error| {
        ProductCliInstallError::failed(format!("Inspect CLI install destination: {error}"))
    })? {
        ProductCliLinkState::Managed => return Ok(()),
        ProductCliLinkState::Conflict => {
            return Err(ProductCliInstallError::conflict(format!(
                "Refusing to replace existing object at {}",
                paths.installed.display()
            )));
        }
        ProductCliLinkState::Missing => {}
    }

    let bundled = CString::new(paths.bundled.as_os_str().as_bytes()).map_err(|_| {
        ProductCliInstallError::failed("Bundled CLI path contains an invalid NUL byte")
    })?;
    let temporary = CString::new(format!(".chromvoid-link-{}", uuid::Uuid::new_v4()))
        .expect("UUID link name cannot contain NUL");
    // SAFETY: all C strings are NUL-terminated and `parent` stays open for the
    // complete create/rename transaction.
    if unsafe { libc::symlinkat(bundled.as_ptr(), parent.as_raw_fd(), temporary.as_ptr()) } != 0 {
        return Err(ProductCliInstallError::failed(format!(
            "Create temporary CLI link: {}",
            std::io::Error::last_os_error()
        )));
    }

    let rename_result = rename_product_cli_noreplace(&parent, &temporary);
    if let Err(error) = rename_result {
        // SAFETY: the temporary name belongs to this transaction and the
        // directory descriptor remains valid.
        unsafe {
            libc::unlinkat(parent.as_raw_fd(), temporary.as_ptr(), 0);
        }
        if error.kind() == std::io::ErrorKind::AlreadyExists {
            return match product_cli_link_state(&parent, &paths.bundled) {
                Ok(ProductCliLinkState::Managed) => Ok(()),
                _ => Err(ProductCliInstallError::conflict(format!(
                    "Refusing to replace concurrent object at {}",
                    paths.installed.display()
                ))),
            };
        }
        return Err(ProductCliInstallError::failed(format!(
            "Atomically install CLI link: {error}"
        )));
    }
    Ok(())
}

#[cfg(target_os = "macos")]
fn rename_product_cli_noreplace(
    parent: &std::os::fd::OwnedFd,
    temporary: &std::ffi::CStr,
) -> std::io::Result<()> {
    use std::os::fd::AsRawFd as _;

    // `RENAME_EXCL` makes the lstat/create race fail instead of replacing a
    // destination that appeared after the initial check.
    // SAFETY: both names are relative to the same live directory descriptor.
    let result = unsafe {
        libc::renameatx_np(
            parent.as_raw_fd(),
            temporary.as_ptr(),
            parent.as_raw_fd(),
            c"chromvoid".as_ptr(),
            libc::RENAME_EXCL,
        )
    };
    if result == 0 {
        Ok(())
    } else {
        Err(std::io::Error::last_os_error())
    }
}

#[cfg(target_os = "macos")]
fn product_cli_link_state(
    parent: &std::os::fd::OwnedFd,
    bundled: &Path,
) -> std::io::Result<ProductCliLinkState> {
    use std::os::unix::ffi::OsStrExt as _;

    match read_link_at(parent, c"chromvoid") {
        Ok(target) if target == bundled.as_os_str().as_bytes() => Ok(ProductCliLinkState::Managed),
        Ok(_) => Ok(ProductCliLinkState::Conflict),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            Ok(ProductCliLinkState::Missing)
        }
        Err(error) if error.raw_os_error() == Some(libc::EINVAL) => {
            Ok(ProductCliLinkState::Conflict)
        }
        Err(error) => Err(error),
    }
}

#[cfg(target_os = "macos")]
fn read_link_at(parent: &std::os::fd::OwnedFd, name: &std::ffi::CStr) -> std::io::Result<Vec<u8>> {
    use std::os::fd::AsRawFd as _;

    let mut capacity = 256_usize;
    loop {
        let mut target = vec![0_u8; capacity];
        // SAFETY: target is writable for `capacity` bytes and both pointers
        // remain valid for the call.
        let length = unsafe {
            libc::readlinkat(
                parent.as_raw_fd(),
                name.as_ptr(),
                target.as_mut_ptr().cast(),
                target.len(),
            )
        };
        if length < 0 {
            return Err(std::io::Error::last_os_error());
        }
        let length = usize::try_from(length).expect("readlinkat length must be non-negative");
        if length < target.len() {
            target.truncate(length);
            return Ok(target);
        }
        capacity = capacity
            .checked_mul(2)
            .filter(|size| *size <= 1024 * 1024)
            .ok_or_else(|| {
                std::io::Error::new(
                    std::io::ErrorKind::InvalidData,
                    "CLI symlink target is too long",
                )
            })?;
    }
}

#[cfg(target_os = "macos")]
fn open_product_cli_parent(home: &Path, create: bool) -> std::io::Result<std::os::fd::OwnedFd> {
    let home = open_directory_nofollow(home)?;
    let local = open_directory_at(&home, c".local", create)?;
    open_directory_at(&local, c"bin", create)
}

#[cfg(target_os = "macos")]
fn open_directory_nofollow(path: &Path) -> std::io::Result<std::os::fd::OwnedFd> {
    use std::ffi::CString;
    use std::os::fd::FromRawFd as _;
    use std::os::unix::ffi::OsStrExt as _;

    let path = CString::new(path.as_os_str().as_bytes())
        .map_err(|_| std::io::Error::from(std::io::ErrorKind::InvalidInput))?;
    // SAFETY: path is NUL-terminated; a successful descriptor is immediately
    // transferred to OwnedFd.
    let descriptor = unsafe {
        libc::open(
            path.as_ptr(),
            libc::O_RDONLY | libc::O_DIRECTORY | libc::O_CLOEXEC | libc::O_NOFOLLOW,
        )
    };
    if descriptor < 0 {
        Err(std::io::Error::last_os_error())
    } else {
        // SAFETY: open returned a newly owned descriptor.
        Ok(unsafe { std::os::fd::OwnedFd::from_raw_fd(descriptor) })
    }
}

#[cfg(target_os = "macos")]
fn open_directory_at(
    parent: &std::os::fd::OwnedFd,
    name: &std::ffi::CStr,
    create: bool,
) -> std::io::Result<std::os::fd::OwnedFd> {
    use std::os::fd::{AsRawFd as _, FromRawFd as _};

    let open = || {
        // SAFETY: name is NUL-terminated and parent remains open.
        let descriptor = unsafe {
            libc::openat(
                parent.as_raw_fd(),
                name.as_ptr(),
                libc::O_RDONLY | libc::O_DIRECTORY | libc::O_CLOEXEC | libc::O_NOFOLLOW,
            )
        };
        if descriptor < 0 {
            Err(std::io::Error::last_os_error())
        } else {
            // SAFETY: openat returned a newly owned descriptor.
            Ok(unsafe { std::os::fd::OwnedFd::from_raw_fd(descriptor) })
        }
    };

    match open() {
        Err(error) if create && error.kind() == std::io::ErrorKind::NotFound => {
            // SAFETY: name is NUL-terminated and parent remains open.
            let created = unsafe { libc::mkdirat(parent.as_raw_fd(), name.as_ptr(), 0o755) };
            if created != 0 {
                let error = std::io::Error::last_os_error();
                if error.kind() != std::io::ErrorKind::AlreadyExists {
                    return Err(error);
                }
            }
            open()
        }
        result => result,
    }
}

#[cfg(unix)]
fn current_user_home() -> Result<std::ffi::OsString, String> {
    use std::ffi::CStr;
    use std::os::unix::ffi::OsStringExt as _;

    let suggested = unsafe { libc::sysconf(libc::_SC_GETPW_R_SIZE_MAX) };
    let buffer_len = usize::try_from(suggested)
        .ok()
        .filter(|length| *length >= 1_024)
        .unwrap_or(16 * 1_024)
        .min(1024 * 1024);
    let mut buffer = vec![0_u8; buffer_len];
    let mut password = std::mem::MaybeUninit::<libc::passwd>::uninit();
    let mut result = std::ptr::null_mut();
    // SAFETY: all pointers reference writable storage for the duration of the
    // call; `getpwuid_r` initializes `password` only when `result` is non-null.
    let status = unsafe {
        libc::getpwuid_r(
            libc::getuid(),
            password.as_mut_ptr(),
            buffer.as_mut_ptr().cast(),
            buffer.len(),
            &mut result,
        )
    };
    if status != 0 || result.is_null() {
        return Err("Resolve current macOS user home from account database failed".to_string());
    }
    // SAFETY: successful getpwuid_r returned a NUL-terminated pw_dir pointer
    // backed by `buffer`, which is still alive.
    let home = unsafe { CStr::from_ptr((*password.as_ptr()).pw_dir) };
    if home.to_bytes().is_empty() {
        return Err("Current macOS user home is empty".to_string());
    }
    Ok(std::ffi::OsString::from_vec(home.to_bytes().to_vec()))
}

#[cfg(not(unix))]
fn current_user_home() -> Result<std::ffi::OsString, String> {
    Err("Product CLI installation is unsupported on this platform".to_string())
}

#[cfg(all(test, target_os = "macos"))]
mod tests {
    use std::ffi::CString;
    use std::fs;
    use std::os::unix::fs::{symlink, PermissionsExt as _};
    use std::process::{Command, Output};
    use std::sync::{Mutex, OnceLock};

    use chromvoid_core::rpc::types::{RpcRequest, RpcResponse};
    use chromvoid_core::rpc::{RpcInputStream, RpcReply};
    use serde_json::Value;

    use super::*;
    use crate::core_adapter::{CoreAdapter, CoreMode, RemoteHost};

    struct EnvironmentGuard {
        saved: Vec<(&'static str, Option<std::ffi::OsString>)>,
    }

    impl EnvironmentGuard {
        fn set(values: &[(&'static str, &'static str)]) -> Self {
            let saved = values
                .iter()
                .map(|(name, value)| {
                    let previous = std::env::var_os(name);
                    // SAFETY: the guard is held under `environment_lock` for
                    // the complete test and restores every mutation on drop.
                    unsafe { std::env::set_var(name, value) };
                    (*name, previous)
                })
                .collect();
            Self { saved }
        }
    }

    impl Drop for EnvironmentGuard {
        fn drop(&mut self) {
            for (name, previous) in self.saved.drain(..).rev() {
                // SAFETY: see `EnvironmentGuard::set`.
                unsafe {
                    match previous {
                        Some(value) => std::env::set_var(name, value),
                        None => std::env::remove_var(name),
                    }
                }
            }
        }
    }

    fn environment_lock() -> &'static Mutex<()> {
        static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
        LOCK.get_or_init(|| Mutex::new(()))
    }

    struct CliAccessAdapter {
        mode: CoreMode,
        unlocked: bool,
    }

    impl CoreAdapter for CliAccessAdapter {
        fn mode(&self) -> CoreMode {
            self.mode.clone()
        }

        fn is_unlocked(&self) -> bool {
            self.unlocked
        }

        fn handle(&mut self, _request: &RpcRequest) -> RpcResponse {
            RpcResponse::error("unexpected command", Some("TEST"))
        }

        fn handle_with_stream(
            &mut self,
            request: &RpcRequest,
            _stream: Option<RpcInputStream>,
        ) -> RpcReply {
            RpcReply::Json(self.handle(request))
        }

        fn save(&mut self) -> Result<(), String> {
            Ok(())
        }

        fn take_events(&mut self) -> Vec<Value> {
            Vec::new()
        }

        fn set_master_key(&mut self, _key: Option<String>) {}
    }

    fn fixture() -> (tempfile::TempDir, ProductCliPaths) {
        let root = tempfile::tempdir().expect("tempdir");
        let home = root.path().join("home");
        let bundled = root
            .path()
            .join("ChromVoid.app/Contents/MacOS/chromvoid-agent");
        fs::create_dir_all(&home).expect("home");
        fs::create_dir_all(bundled.parent().expect("bundled parent")).expect("bundle dir");
        fs::write(
            &bundled,
            b"#!/bin/sh\nprintf 'chromvoid test-cli-version\\n'\n",
        )
        .expect("bundled CLI");
        fs::set_permissions(&bundled, fs::Permissions::from_mode(0o755)).expect("executable mode");
        let paths = ProductCliPaths::from_bundled_and_home(bundled, home).expect("fixture paths");
        (root, paths)
    }

    fn run_bundled_cli(paths: &ProductCliPaths, args: &[&str]) -> Output {
        Command::new(&paths.installed)
            .args(args)
            .env_clear()
            .env("HOME", &paths.home)
            .env("PATH", "/usr/bin:/bin")
            .output()
            .expect("run bundled CLI")
    }

    #[test]
    fn install_creates_exact_managed_link_and_reports_matching_version() {
        let (_root, paths) = fixture();

        install_product_cli_link(&paths).expect("first install");
        install_product_cli_link(&paths).expect("idempotent install");

        assert_eq!(fs::read_link(&paths.installed).unwrap(), paths.bundled);
        let status = product_cli_install_status_for_paths(&paths);
        assert!(status.installed);
        assert!(status.managed_link);
        assert_eq!(status.bundled_version.as_deref(), Some("test-cli-version"));
        assert_eq!(status.installed_version, status.bundled_version);
    }

    #[test]
    fn install_refuses_existing_object_without_overwriting_it() {
        let (_root, paths) = fixture();
        fs::create_dir_all(paths.installed.parent().unwrap()).unwrap();
        fs::write(&paths.installed, b"keep-me").unwrap();

        let error = install_product_cli_link(&paths).expect_err("must conflict");

        assert_eq!(error.code, "CLI_INSTALL_CONFLICT");
        assert_eq!(fs::read(&paths.installed).unwrap(), b"keep-me");
        let status = product_cli_install_status_for_paths(&paths);
        assert!(!status.installed);
        assert!(!status.managed_link);
        assert!(status.installed_version.is_none());
    }

    #[test]
    fn install_refuses_symlinked_parent_without_writing_outside_home() {
        let (root, paths) = fixture();
        let outside = root.path().join("outside");
        fs::create_dir_all(&outside).unwrap();
        symlink(&outside, paths.home.join(".local")).unwrap();

        install_product_cli_link(&paths).expect_err("symlink parent must fail closed");

        assert!(!outside.join("bin/chromvoid").exists());
        assert!(!product_cli_install_status_for_paths(&paths).installed);
    }

    #[test]
    fn privileged_denials_do_not_mutate_the_isolated_cli_home() {
        let _lock = environment_lock().lock().expect("environment lock");
        let _environment = EnvironmentGuard::set(&[
            ("CHROMVOID_MODULE_ROLLOUT_ENABLED", "1"),
            ("CHROMVOID_DISABLED_MODULES", ""),
            ("CHROMVOID_ENV_RUNTIME_V1_ENABLED", "1"),
        ]);
        let remote = CoreMode::Remote {
            host: RemoteHost::TauriRemoteWss {
                peer_id: "remote-test".to_string(),
            },
        };
        let cases = [
            (
                "rollout",
                CoreMode::Local,
                true,
                false,
                "FEATURE_DISABLED_BY_ROLLOUT",
            ),
            ("remote", remote, true, true, "REMOTE_CORE_UNSUPPORTED"),
            ("locked", CoreMode::Local, false, true, "VAULT_REQUIRED"),
        ];

        for (name, mode, unlocked, rollout_enabled, expected_code) in cases {
            // SAFETY: serialized by `environment_lock` and restored by the
            // outer guard after all cases complete.
            unsafe {
                std::env::set_var(
                    "CHROMVOID_ENV_RUNTIME_V1_ENABLED",
                    if rollout_enabled { "1" } else { "0" },
                )
            };
            let (_root, paths) = fixture();
            let mut adapter = CliAccessAdapter { mode, unlocked };

            let result = crate::commands::env_runtime_cmds::env_runtime_cli_install_for_paths(
                &mut adapter,
                &paths,
            );
            let code = match result {
                crate::types::RpcResult::Error { code, .. } => code,
                crate::types::RpcResult::Success { .. } => {
                    panic!("{name} denial unexpectedly installed the CLI")
                }
            };
            assert_eq!(code.as_deref(), Some(expected_code), "{name}");
            assert!(
                !paths.home.join(".local").exists(),
                "{name} denial must happen before any install-directory mutation"
            );
        }
    }

    #[test]
    fn exclusive_rename_does_not_replace_concurrent_destination() {
        let (_root, paths) = fixture();
        let parent = open_product_cli_parent(&paths.home, true).unwrap();
        let temporary_name = ".chromvoid-link-race-fixture";
        let temporary_path = paths.installed.parent().unwrap().join(temporary_name);
        symlink(&paths.bundled, &temporary_path).unwrap();
        fs::write(&paths.installed, b"concurrent-owner").unwrap();
        let temporary = CString::new(temporary_name).unwrap();

        let error =
            rename_product_cli_noreplace(&parent, &temporary).expect_err("must not replace");

        assert_eq!(error.kind(), std::io::ErrorKind::AlreadyExists);
        assert_eq!(fs::read(&paths.installed).unwrap(), b"concurrent-owner");
        assert_eq!(fs::read_link(&temporary_path).unwrap(), paths.bundled);
    }

    #[test]
    #[ignore = "requires CHROMVOID_APP_BUNDLE pointing to a signed macOS app bundle"]
    fn signed_app_bundle_installer_smoke() {
        let app_bundle = std::env::var_os("CHROMVOID_APP_BUNDLE")
            .map(PathBuf::from)
            .expect("CHROMVOID_APP_BUNDLE is required");
        let app_bundle = fs::canonicalize(&app_bundle).expect("canonical app bundle");
        let bundled = app_bundle
            .join("Contents")
            .join("MacOS")
            .join(PRODUCT_CLI_BUNDLE_NAME);
        let root = tempfile::tempdir().expect("isolated installer home");
        let home = root.path().join("home");
        fs::create_dir(&home).expect("create isolated installer home");
        let paths =
            ProductCliPaths::from_bundled_and_home(bundled, home).expect("bundle installer paths");

        assert!(
            product_cli_is_bundled(&paths),
            "bundle sidecar is executable"
        );
        assert!(
            !app_bundle
                .join("Contents/MacOS/env-runtime-test-probe")
                .exists(),
            "test probe must not ship in the app bundle"
        );
        install_product_cli_link(&paths).expect("first shared installer invocation");
        install_product_cli_link(&paths).expect("idempotent shared installer invocation");
        assert_eq!(
            fs::read_link(&paths.installed).expect("managed symlink target"),
            paths.bundled
        );

        let status = product_cli_install_status_for_paths(&paths);
        assert!(status.supported && status.installed && status.managed_link);
        assert_eq!(status.installed_version, status.bundled_version);

        let version = run_bundled_cli(&paths, &["--version"]);
        assert!(version.status.success(), "--version must succeed");
        let bundled_version = product_cli_version(&paths.bundled).expect("bundled CLI version");
        let installed_version =
            product_cli_version(&paths.installed).expect("installed CLI version");
        assert_eq!(installed_version, bundled_version);

        let guide = run_bundled_cli(&paths, &["env", "agent-guide"]);
        assert!(
            guide.status.success(),
            "agent guide must be local and readable"
        );
        let guide = String::from_utf8(guide.stdout).expect("UTF-8 agent guide");
        assert!(guide.contains("Protocol version: 1. Schema version: 1."));
        assert!(guide.contains("MCP is explicitly prohibited"));

        // This machine-mode command is handled before config discovery, so it
        // exercises a real AgentResponseV1 envelope without Keychain or network.
        let json = run_bundled_cli(&paths, &["--json", "env", "agent-guide"]);
        assert_eq!(json.status.code(), Some(64));
        let response: serde_json::Value =
            serde_json::from_slice(&json.stdout).expect("JSON AgentResponseV1");
        assert_eq!(response["protocol_version"], 1);
        assert_eq!(response["schema_version"], 1);
        assert_eq!(response["ok"], false);
        assert_eq!(response["error"]["code"], "OUTPUT_MODE_UNSUPPORTED");
    }
}
