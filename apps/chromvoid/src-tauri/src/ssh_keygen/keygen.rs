use crate::app_state::AppState;
use crate::helpers::flush_core_events;
use serde::Serialize;
use ssh_key::{
    private::{Ed25519Keypair, KeypairData},
    Algorithm, HashAlg, LineEnding, PrivateKey,
};

#[derive(Debug, Serialize)]
pub struct SshKeygenResult {
    pub key_id: String,
    pub public_key_openssh: String,
    pub fingerprint: String,
    pub key_type: String,
}

pub(crate) struct GeneratedSshKeyMaterial {
    pub(crate) private_key_pem: String,
    pub(crate) public_key_openssh: String,
    pub(crate) fingerprint: String,
    pub(crate) key_type: String,
}

pub(crate) fn generate_ssh_key_material(
    key_type: &str,
    comment: &str,
) -> Result<GeneratedSshKeyMaterial, String> {
    let mut rng = rand::thread_rng();

    let private_key = match key_type {
        "ed25519" => {
            let keypair = Ed25519Keypair::random(&mut rng);
            PrivateKey::new(KeypairData::Ed25519(keypair), comment)
                .map_err(|e| format!("Failed to create Ed25519 key: {e}"))?
        }
        "rsa" => {
            let rsa_keypair = ssh_key::private::RsaKeypair::random(&mut rng, 4096)
                .map_err(|e| format!("Failed to generate RSA key: {e}"))?;
            PrivateKey::new(KeypairData::Rsa(rsa_keypair), comment)
                .map_err(|e| format!("Failed to create RSA key: {e}"))?
        }
        "ecdsa" => {
            let ecdsa_keypair =
                ssh_key::private::EcdsaKeypair::random(&mut rng, ssh_key::EcdsaCurve::NistP256)
                    .map_err(|e| format!("Failed to generate ECDSA key: {e}"))?;
            PrivateKey::new(KeypairData::Ecdsa(ecdsa_keypair), comment)
                .map_err(|e| format!("Failed to create ECDSA key: {e}"))?
        }
        _ => {
            return Err(format!(
                "Unsupported key type: {key_type}. Use ed25519, rsa, or ecdsa"
            ));
        }
    };

    let private_key_pem = private_key
        .to_openssh(LineEnding::LF)
        .map_err(|e| format!("Failed to encode private key: {e}"))?
        .to_string();

    let public_key = private_key.public_key();
    let public_key_openssh = public_key
        .to_openssh()
        .map_err(|e| format!("Failed to encode public key: {e}"))?;

    let fingerprint = public_key.fingerprint(HashAlg::Sha256).to_string();

    let algo = match private_key.algorithm() {
        Algorithm::Ed25519 => "ed25519",
        Algorithm::Rsa { .. } => "rsa",
        Algorithm::Ecdsa { .. } => "ecdsa",
        _ => "unknown",
    };

    Ok(GeneratedSshKeyMaterial {
        private_key_pem,
        public_key_openssh,
        fingerprint,
        key_type: algo.to_string(),
    })
}

#[tauri::command]
pub fn ssh_keygen(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    entry_id: &str,
    key_type: &str,
    comment: &str,
) -> Result<SshKeygenResult, String> {
    if entry_id.trim().is_empty() {
        return Err("entry_id is required".to_string());
    }

    let material = generate_ssh_key_material(key_type, comment)?;

    let mut key_id = uuid::Uuid::new_v4().simple().to_string();
    key_id.truncate(8);

    {
        let mut adapter = state
            .adapter
            .lock()
            .map_err(|_| "Adapter mutex poisoned".to_string())?;

        if !adapter.is_unlocked() {
            return Err("Vault is locked".to_string());
        }

        let save_private_req = chromvoid_core::rpc::types::RpcRequest::new(
            "passmanager:secret:save".to_string(),
            serde_json::json!({
                "entry_id": entry_id,
                "secret_type": format!("ssh_private_key:{key_id}"),
                "value": material.private_key_pem,
            }),
        );
        match adapter.handle(&save_private_req) {
            chromvoid_core::rpc::types::RpcResponse::Success { .. } => {}
            chromvoid_core::rpc::types::RpcResponse::Error { error, .. } => {
                return Err(format!("Failed to save private key: {error}"));
            }
        }

        let save_public_req = chromvoid_core::rpc::types::RpcRequest::new(
            "passmanager:secret:save".to_string(),
            serde_json::json!({
                "entry_id": entry_id,
                "secret_type": format!("ssh_public_key:{key_id}"),
                "value": material.public_key_openssh,
            }),
        );
        match adapter.handle(&save_public_req) {
            chromvoid_core::rpc::types::RpcResponse::Success { .. } => {}
            chromvoid_core::rpc::types::RpcResponse::Error { error, .. } => {
                return Err(format!("Failed to save public key: {error}"));
            }
        }

        let _ = adapter.save();
        flush_core_events(&app, adapter.as_mut());
    }

    Ok(SshKeygenResult {
        key_id,
        public_key_openssh: material.public_key_openssh,
        fingerprint: material.fingerprint,
        key_type: material.key_type,
    })
}
