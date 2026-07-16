//! Portable Vault Env Runtime domain.
//!
//! The domain owns versioned secret metadata, encrypted secret value records,
//! profiles, validation, and optimistic revision rules. Storage and RPC
//! adapters live in `rpc::router::env_runtime` so resolved environment values
//! never need a serializable generic RPC command.

mod error;
mod model;
mod state;
mod validation;

pub use error::{EnvRuntimeError, EnvRuntimeErrorCode, EnvRuntimeResult};
pub use model::{
    AgentProfileMetadataV1, AgentSecretMetadataV1, EnvVariableMappingV1,
    PrivateSpawnResolutionRequestV1, ResolvedEnvLeaseV1, ENV_RUNTIME_RECORD_VERSION,
};

pub(crate) use model::{EnvSecretMetadataRecordV1, EnvSecretValueRecordV1};
pub(crate) use state::EnvRuntimeStateV1;
pub(crate) use validation::validate_secret_value;
