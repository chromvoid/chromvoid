use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use zeroize::{Zeroize, Zeroizing};

use crate::error::CliError;

pub const DEFAULT_GATEWAY_ENDPOINT: &str = "ws://127.0.0.1:8003";
const CONFIG_VERSION: u16 = 1;
const KEYCHAIN_SERVICE: &str = "com.chromvoid.product-cli.noise";
const KEYCHAIN_ACCOUNT: &str = "agent-static-identity-v1";

#[cfg(feature = "env-runtime-integration-tests")]
pub const TEST_CONFIG_PATH_ENV: &str = "CHROMVOID_PRODUCT_CLI_TEST_CONFIG_PATH";
#[cfg(feature = "env-runtime-integration-tests")]
pub const TEST_IDENTITY_PATH_ENV: &str = "CHROMVOID_PRODUCT_CLI_TEST_IDENTITY_PATH";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct PublicConfig {
    pub version: u16,
    pub endpoint: String,
    pub actor_id: String,
    pub server_public_key_hex: String,
}

impl PublicConfig {
    pub fn new(actor_id: String, server_public_key: &[u8]) -> Result<Self, CliError> {
        if actor_id.len() != 64 || server_public_key.len() != 32 {
            return Err(CliError::data(
                "INVALID_PAIRING_IDENTITY",
                "Pairing returned an invalid Noise identity",
            ));
        }
        Ok(Self {
            version: CONFIG_VERSION,
            endpoint: DEFAULT_GATEWAY_ENDPOINT.to_string(),
            actor_id,
            server_public_key_hex: hex::encode(server_public_key),
        })
    }

    pub fn validate(&self) -> Result<(), CliError> {
        if self.version != CONFIG_VERSION {
            return Err(CliError::data(
                "UNSUPPORTED_CONFIG_VERSION",
                "CLI pairing metadata has an unsupported version",
            ));
        }
        if !is_allowed_gateway_endpoint(&self.endpoint) {
            return Err(CliError::data(
                "INVALID_GATEWAY_ENDPOINT",
                "CLI pairing metadata is not bound to the ChromVoid loopback gateway",
            ));
        }
        validate_public_key_hex(&self.actor_id, "actor id")?;
        validate_public_key_hex(&self.server_public_key_hex, "server public key")?;
        Ok(())
    }

    pub fn server_public_key(&self) -> Result<Vec<u8>, CliError> {
        self.validate()?;
        hex::decode(&self.server_public_key_hex).map_err(|_| {
            CliError::data(
                "INVALID_PAIRING_METADATA",
                "Stored server public key is malformed",
            )
        })
    }
}

fn is_allowed_gateway_endpoint(endpoint: &str) -> bool {
    let is_production_endpoint = matches!(endpoint, "ws://127.0.0.1:8003" | "ws://[::1]:8003");
    #[cfg(feature = "env-runtime-integration-tests")]
    {
        is_production_endpoint || is_test_loopback_gateway_endpoint(endpoint)
    }
    #[cfg(not(feature = "env-runtime-integration-tests"))]
    {
        is_production_endpoint
    }
}

#[cfg(feature = "env-runtime-integration-tests")]
fn is_test_loopback_gateway_endpoint(endpoint: &str) -> bool {
    let port = endpoint
        .strip_prefix("ws://127.0.0.1:")
        .or_else(|| endpoint.strip_prefix("ws://[::1]:"));
    port.is_some_and(|port| {
        !port.is_empty()
            && port.as_bytes().iter().all(u8::is_ascii_digit)
            && port.parse::<u16>().is_ok_and(|port| port != 0)
    })
}

fn validate_public_key_hex(value: &str, label: &str) -> Result<(), CliError> {
    if value.len() != 64 || !value.as_bytes().iter().all(|byte| byte.is_ascii_hexdigit()) {
        return Err(CliError::data(
            "INVALID_PAIRING_METADATA",
            format!("Stored {label} is malformed"),
        ));
    }
    Ok(())
}

pub struct NoiseIdentity {
    private_key: Zeroizing<Vec<u8>>,
    public_key: Vec<u8>,
}

impl NoiseIdentity {
    pub fn new(mut private_key: Vec<u8>, public_key: Vec<u8>) -> Result<Self, CliError> {
        if private_key.len() != 32 || public_key.len() != 32 {
            private_key.zeroize();
            return Err(CliError::data(
                "INVALID_CLI_IDENTITY",
                "Stored CLI Noise identity has an invalid key length",
            ));
        }
        Ok(Self {
            private_key: Zeroizing::new(private_key),
            public_key,
        })
    }

    pub fn generate() -> Result<Self, CliError> {
        let params = chromvoid_protocol::NOISE_PARAMS_XXPSK0
            .parse()
            .map_err(|error| CliError::software("NOISE_SETUP_FAILED", format!("{error}")))?;
        let keypair = snow::Builder::new(params)
            .generate_keypair()
            .map_err(|error| {
                CliError::software("IDENTITY_GENERATION_FAILED", format!("{error}"))
            })?;
        Self::new(keypair.private, keypair.public)
    }

    pub fn private_key(&self) -> &[u8] {
        self.private_key.as_slice()
    }

    pub fn public_key(&self) -> &[u8] {
        &self.public_key
    }

    pub fn actor_id(&self) -> String {
        hex::encode(&self.public_key)
    }
}

pub trait IdentityStore: Send + Sync {
    fn load(&self) -> Result<Option<NoiseIdentity>, CliError>;
    fn save(&self, identity: &NoiseIdentity) -> Result<(), CliError>;
}

#[derive(Debug, Default)]
pub struct KeychainIdentityStore;

#[derive(Serialize, Deserialize, Zeroize)]
#[zeroize(drop)]
#[serde(deny_unknown_fields)]
struct StoredIdentityV1 {
    version: u16,
    private_key_hex: String,
    public_key_hex: String,
}

#[cfg(target_os = "macos")]
impl IdentityStore for KeychainIdentityStore {
    fn load(&self) -> Result<Option<NoiseIdentity>, CliError> {
        let entry = keyring::Entry::new(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT).map_err(|error| {
            CliError::unavailable(
                "KEYCHAIN_UNAVAILABLE",
                format!("Open Keychain entry: {error}"),
            )
        })?;
        let encoded = Zeroizing::new(match entry.get_password() {
            Ok(encoded) => encoded,
            Err(keyring::Error::NoEntry) => return Ok(None),
            Err(error) => {
                return Err(CliError::unavailable(
                    "KEYCHAIN_UNAVAILABLE",
                    format!("Read CLI identity from Keychain: {error}"),
                ))
            }
        });
        let parsed: StoredIdentityV1 = serde_json::from_str(encoded.as_str()).map_err(|_| {
            CliError::data(
                "INVALID_CLI_IDENTITY",
                "CLI identity stored in Keychain is malformed",
            )
        })?;
        if parsed.version != CONFIG_VERSION {
            return Err(CliError::data(
                "UNSUPPORTED_IDENTITY_VERSION",
                "CLI identity stored in Keychain has an unsupported version",
            ));
        }
        let mut private = hex::decode(&parsed.private_key_hex).map_err(|_| {
            CliError::data(
                "INVALID_CLI_IDENTITY",
                "CLI private identity stored in Keychain is malformed",
            )
        })?;
        let public = hex::decode(&parsed.public_key_hex).map_err(|_| {
            private.zeroize();
            CliError::data(
                "INVALID_CLI_IDENTITY",
                "CLI public identity stored in Keychain is malformed",
            )
        })?;
        NoiseIdentity::new(private, public).map(Some)
    }

    fn save(&self, identity: &NoiseIdentity) -> Result<(), CliError> {
        let entry = keyring::Entry::new(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT).map_err(|error| {
            CliError::unavailable(
                "KEYCHAIN_UNAVAILABLE",
                format!("Open Keychain entry: {error}"),
            )
        })?;
        let secret = StoredIdentityV1 {
            version: CONFIG_VERSION,
            private_key_hex: hex::encode(identity.private_key()),
            public_key_hex: hex::encode(identity.public_key()),
        };
        let mut encoded = serde_json::to_string(&secret)
            .map_err(|error| CliError::software("IDENTITY_ENCODING_FAILED", format!("{error}")))?;
        let result = entry.set_password(&encoded).map_err(|error| {
            CliError::unavailable(
                "KEYCHAIN_UNAVAILABLE",
                format!("Store CLI identity in Keychain: {error}"),
            )
        });
        encoded.zeroize();
        result
    }
}

#[cfg(feature = "env-runtime-integration-tests")]
#[derive(Debug, Clone)]
pub struct FileIdentityStore {
    path: PathBuf,
}

#[cfg(feature = "env-runtime-integration-tests")]
impl FileIdentityStore {
    pub fn at(path: PathBuf) -> Self {
        Self { path }
    }
}

#[cfg(feature = "env-runtime-integration-tests")]
impl IdentityStore for FileIdentityStore {
    fn load(&self) -> Result<Option<NoiseIdentity>, CliError> {
        let encoded = match fs::read_to_string(&self.path) {
            Ok(encoded) => Zeroizing::new(encoded),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
            Err(error) => {
                return Err(CliError::unavailable(
                    "TEST_IDENTITY_UNAVAILABLE",
                    format!("Read test CLI identity: {error}"),
                ))
            }
        };
        let parsed: StoredIdentityV1 = serde_json::from_str(encoded.as_str()).map_err(|_| {
            CliError::data(
                "INVALID_TEST_CLI_IDENTITY",
                "Test CLI identity file is malformed",
            )
        })?;
        if parsed.version != CONFIG_VERSION {
            return Err(CliError::data(
                "UNSUPPORTED_TEST_IDENTITY_VERSION",
                "Test CLI identity file has an unsupported version",
            ));
        }
        let mut private = hex::decode(&parsed.private_key_hex).map_err(|_| {
            CliError::data(
                "INVALID_TEST_CLI_IDENTITY",
                "Test CLI private identity is malformed",
            )
        })?;
        let public = hex::decode(&parsed.public_key_hex).map_err(|_| {
            private.zeroize();
            CliError::data(
                "INVALID_TEST_CLI_IDENTITY",
                "Test CLI public identity is malformed",
            )
        })?;
        NoiseIdentity::new(private, public).map(Some)
    }

    fn save(&self, identity: &NoiseIdentity) -> Result<(), CliError> {
        let parent = self.path.parent().ok_or_else(|| {
            CliError::software(
                "TEST_IDENTITY_WRITE_FAILED",
                "Test CLI identity path has no parent",
            )
        })?;
        fs::create_dir_all(parent).map_err(|error| {
            CliError::software(
                "TEST_IDENTITY_WRITE_FAILED",
                format!("Create test CLI identity directory: {error}"),
            )
        })?;
        set_directory_permissions(parent)?;
        let secret = StoredIdentityV1 {
            version: CONFIG_VERSION,
            private_key_hex: hex::encode(identity.private_key()),
            public_key_hex: hex::encode(identity.public_key()),
        };
        let encoded = Zeroizing::new(serde_json::to_string(&secret).map_err(|error| {
            CliError::software("TEST_IDENTITY_WRITE_FAILED", format!("{error}"))
        })?);
        let mut options = OpenOptions::new();
        options.create(true).truncate(true).write(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        let mut file = options.open(&self.path).map_err(|error| {
            CliError::software(
                "TEST_IDENTITY_WRITE_FAILED",
                format!("Open test CLI identity: {error}"),
            )
        })?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            file.set_permissions(fs::Permissions::from_mode(0o600))
                .map_err(|error| {
                    CliError::software(
                        "TEST_IDENTITY_WRITE_FAILED",
                        format!("Secure test CLI identity: {error}"),
                    )
                })?;
        }
        file.write_all(encoded.as_bytes()).map_err(|error| {
            CliError::software(
                "TEST_IDENTITY_WRITE_FAILED",
                format!("Write test CLI identity: {error}"),
            )
        })?;
        file.sync_all().map_err(|error| {
            CliError::software(
                "TEST_IDENTITY_WRITE_FAILED",
                format!("Sync test CLI identity: {error}"),
            )
        })
    }
}

pub fn discover_runtime_stores() -> Result<(ConfigStore, Box<dyn IdentityStore>), CliError> {
    #[cfg(feature = "env-runtime-integration-tests")]
    {
        let config_path = std::env::var_os(TEST_CONFIG_PATH_ENV);
        let identity_path = std::env::var_os(TEST_IDENTITY_PATH_ENV);
        match (config_path, identity_path) {
            (None, None) => {}
            (Some(config_path), Some(identity_path)) => {
                let config_path = validate_test_override_path(
                    PathBuf::from(config_path),
                    TEST_CONFIG_PATH_ENV,
                )?;
                let identity_path = validate_test_override_path(
                    PathBuf::from(identity_path),
                    TEST_IDENTITY_PATH_ENV,
                )?;
                if config_path == identity_path {
                    return Err(CliError::software(
                        "INVALID_TEST_STORE_OVERRIDE",
                        "Test config and identity paths must be different",
                    ));
                }
                return Ok((
                    ConfigStore::at(config_path),
                    Box::new(FileIdentityStore::at(identity_path)),
                ));
            }
            _ => {
                return Err(CliError::software(
                    "INCOMPLETE_TEST_STORE_OVERRIDE",
                    format!(
                        "Set both {TEST_CONFIG_PATH_ENV} and {TEST_IDENTITY_PATH_ENV} for the CLI integration test"
                    ),
                ))
            }
        }
    }

    Ok((ConfigStore::discover()?, Box::new(KeychainIdentityStore)))
}

#[cfg(feature = "env-runtime-integration-tests")]
fn validate_test_override_path(path: PathBuf, variable: &str) -> Result<PathBuf, CliError> {
    if !path.is_absolute() {
        return Err(CliError::software(
            "INVALID_TEST_STORE_OVERRIDE",
            format!("{variable} must be an absolute path"),
        ));
    }
    Ok(path)
}

#[cfg(not(target_os = "macos"))]
impl IdentityStore for KeychainIdentityStore {
    fn load(&self) -> Result<Option<NoiseIdentity>, CliError> {
        Err(CliError::unavailable(
            "PLATFORM_UNSUPPORTED",
            "Vault Env Runtime CLI v1 requires macOS",
        ))
    }

    fn save(&self, _identity: &NoiseIdentity) -> Result<(), CliError> {
        Err(CliError::unavailable(
            "PLATFORM_UNSUPPORTED",
            "Vault Env Runtime CLI v1 requires macOS",
        ))
    }
}

#[derive(Debug, Clone)]
pub struct ConfigStore {
    path: PathBuf,
}

impl ConfigStore {
    pub fn discover() -> Result<Self, CliError> {
        let root = dirs::config_dir().ok_or_else(|| {
            CliError::unavailable(
                "CONFIG_DIRECTORY_UNAVAILABLE",
                "Cannot locate the current user's configuration directory",
            )
        })?;
        Ok(Self::at(root.join("chromvoid").join("cli.json")))
    }

    pub fn at(path: PathBuf) -> Self {
        Self { path }
    }

    pub fn load(&self) -> Result<Option<PublicConfig>, CliError> {
        let bytes = match fs::read(&self.path) {
            Ok(bytes) => bytes,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
            Err(error) => {
                return Err(CliError::unavailable(
                    "CONFIG_UNAVAILABLE",
                    format!("Read CLI pairing metadata: {error}"),
                ))
            }
        };
        let config: PublicConfig = serde_json::from_slice(&bytes).map_err(|_| {
            CliError::data(
                "INVALID_PAIRING_METADATA",
                "CLI pairing metadata is malformed",
            )
        })?;
        config.validate()?;
        Ok(Some(config))
    }

    pub fn save(&self, config: &PublicConfig) -> Result<(), CliError> {
        config.validate()?;
        let parent = self.path.parent().ok_or_else(|| {
            CliError::software("CONFIG_WRITE_FAILED", "CLI config path has no parent")
        })?;
        fs::create_dir_all(parent).map_err(|error| {
            CliError::software(
                "CONFIG_WRITE_FAILED",
                format!("Create CLI config directory: {error}"),
            )
        })?;
        set_directory_permissions(parent)?;

        let file_name = self
            .path
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("cli.json");
        let temp_path = parent.join(format!(
            ".{file_name}.{}.tmp",
            uuid::Uuid::new_v4().simple()
        ));
        let bytes = serde_json::to_vec(config).map_err(|error| {
            CliError::software("CONFIG_WRITE_FAILED", format!("Encode CLI config: {error}"))
        })?;
        let mut options = OpenOptions::new();
        options.create_new(true).write(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        let result = (|| -> Result<(), CliError> {
            let mut file = options.open(&temp_path).map_err(|error| {
                CliError::software(
                    "CONFIG_WRITE_FAILED",
                    format!("Create temporary CLI config: {error}"),
                )
            })?;
            file.write_all(&bytes).map_err(|error| {
                CliError::software(
                    "CONFIG_WRITE_FAILED",
                    format!("Write temporary CLI config: {error}"),
                )
            })?;
            file.sync_all().map_err(|error| {
                CliError::software(
                    "CONFIG_WRITE_FAILED",
                    format!("Sync temporary CLI config: {error}"),
                )
            })?;
            fs::rename(&temp_path, &self.path).map_err(|error| {
                CliError::software(
                    "CONFIG_WRITE_FAILED",
                    format!("Replace CLI config atomically: {error}"),
                )
            })?;
            sync_directory(parent)?;
            Ok(())
        })();
        if result.is_err() {
            let _ = fs::remove_file(&temp_path);
        }
        result
    }

    pub fn path(&self) -> &Path {
        &self.path
    }
}

#[cfg(unix)]
fn set_directory_permissions(path: &Path) -> Result<(), CliError> {
    use std::os::unix::fs::PermissionsExt;
    fs::set_permissions(path, fs::Permissions::from_mode(0o700)).map_err(|error| {
        CliError::software(
            "CONFIG_WRITE_FAILED",
            format!("Secure CLI config directory: {error}"),
        )
    })
}

#[cfg(not(unix))]
fn set_directory_permissions(_path: &Path) -> Result<(), CliError> {
    Ok(())
}

fn sync_directory(path: &Path) -> Result<(), CliError> {
    let directory = fs::File::open(path).map_err(|error| {
        CliError::software(
            "CONFIG_WRITE_FAILED",
            format!("Open CLI config directory for sync: {error}"),
        )
    })?;
    directory.sync_all().map_err(|error| {
        CliError::software(
            "CONFIG_WRITE_FAILED",
            format!("Sync CLI config directory: {error}"),
        )
    })
}

#[cfg(test)]
mod tests {
    use std::sync::Mutex;

    use super::*;

    #[derive(Default)]
    struct MemoryIdentityStore(Mutex<Option<(Vec<u8>, Vec<u8>)>>);

    impl IdentityStore for MemoryIdentityStore {
        fn load(&self) -> Result<Option<NoiseIdentity>, CliError> {
            self.0
                .lock()
                .expect("memory store")
                .as_ref()
                .map(|(private, public)| NoiseIdentity::new(private.clone(), public.clone()))
                .transpose()
        }

        fn save(&self, identity: &NoiseIdentity) -> Result<(), CliError> {
            *self.0.lock().expect("memory store") = Some((
                identity.private_key().to_vec(),
                identity.public_key().to_vec(),
            ));
            Ok(())
        }
    }

    #[test]
    fn secure_store_abstraction_never_needs_plaintext_config_key() {
        let store = MemoryIdentityStore::default();
        let identity = NoiseIdentity::generate().expect("generate identity");
        store.save(&identity).expect("store identity");
        let loaded = store.load().expect("load identity").expect("identity");
        assert_eq!(loaded.public_key(), identity.public_key());
        assert_eq!(loaded.private_key(), identity.private_key());
    }

    #[test]
    fn public_config_roundtrips_without_private_key() {
        let temp = tempfile::tempdir().expect("tempdir");
        let store = ConfigStore::at(temp.path().join("config").join("cli.json"));
        let config = PublicConfig::new("a".repeat(64), &[7_u8; 32]).expect("config");
        store.save(&config).expect("save config");
        let raw = fs::read_to_string(store.path()).expect("read raw config");
        assert!(!raw.contains("private"));
        assert_eq!(store.load().expect("load"), Some(config));
    }

    #[cfg(unix)]
    #[test]
    fn public_config_uses_owner_only_permissions() {
        use std::os::unix::fs::PermissionsExt;

        let temp = tempfile::tempdir().expect("tempdir");
        let directory = temp.path().join("config");
        let store = ConfigStore::at(directory.join("cli.json"));
        let config = PublicConfig::new("a".repeat(64), &[7_u8; 32]).expect("config");
        store.save(&config).expect("save config");
        let directory_mode = fs::metadata(directory)
            .expect("directory metadata")
            .permissions()
            .mode()
            & 0o777;
        let file_mode = fs::metadata(store.path())
            .expect("file metadata")
            .permissions()
            .mode()
            & 0o777;
        assert_eq!(directory_mode, 0o700);
        assert_eq!(file_mode, 0o600);
    }

    #[test]
    fn rejects_non_loopback_config_endpoint() {
        let mut config = PublicConfig::new("a".repeat(64), &[7_u8; 32]).expect("config");
        config.endpoint = "ws://example.test:8003".into();
        assert!(config.validate().is_err());
    }

    #[cfg(feature = "env-runtime-integration-tests")]
    #[test]
    fn integration_endpoint_seam_is_loopback_only_and_rejects_port_zero() {
        let mut config = PublicConfig::new("a".repeat(64), &[7_u8; 32]).expect("config");
        for endpoint in ["ws://127.0.0.1:49152", "ws://[::1]:49152"] {
            config.endpoint = endpoint.into();
            config.validate().expect("nonzero loopback test endpoint");
        }
        for endpoint in [
            "ws://127.0.0.1:0",
            "ws://[::1]:0",
            "ws://127.0.0.1:49152/agent",
            "ws://example.test:49152",
        ] {
            config.endpoint = endpoint.into();
            assert!(config.validate().is_err(), "accepted {endpoint}");
        }
    }
}
