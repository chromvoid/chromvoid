//! Key loading and signing operations for SSH agent.

use ssh_key::private::PrivateKey;

use super::protocol::encode_ssh_signature;

/// Sign data with the given PEM-encoded private key.
/// Returns the SSH-formatted signature blob or an error.
pub fn sign_data(private_key_pem: &str, data: &[u8]) -> Result<Vec<u8>, String> {
    let private_key = PrivateKey::from_openssh(private_key_pem)
        .map_err(|e| format!("Failed to parse private key: {e}"))?;

    use ssh_key::private::KeypairData;
    match private_key.key_data() {
        KeypairData::Ed25519(ref kp) => sign_ed25519(&kp.private.to_bytes(), data),
        _ => Err("Only Ed25519 signing is supported in v1. RSA/ECDSA support coming soon.".into()),
    }
}

/// Ed25519 signing: reconstruct the key and use ssh_key's Signer impl.
fn sign_ed25519(secret: &[u8; 32], data: &[u8]) -> Result<Vec<u8>, String> {
    let key = PrivateKey::new(
        ssh_key::private::KeypairData::Ed25519(ssh_key::private::Ed25519Keypair::from(
            ssh_key::private::Ed25519PrivateKey::from_bytes(secret),
        )),
        "",
    )
    .map_err(|e| format!("Failed to reconstruct key: {e}"))?;

    use signature::Signer;
    let sig: ssh_key::Signature = key
        .try_sign(data)
        .map_err(|e| format!("Ed25519 signing failed: {e}"))?;

    Ok(encode_ssh_signature("ssh-ed25519", sig.as_bytes()))
}

/// Extract the public key blob from an OpenSSH public key string.
pub fn public_key_blob_from_openssh(public_key_openssh: &str) -> Result<Vec<u8>, String> {
    let public_key = ssh_key::PublicKey::from_openssh(public_key_openssh)
        .map_err(|e| format!("Failed to parse public key: {e}"))?;
    public_key
        .to_bytes()
        .map_err(|e| format!("Failed to encode public key blob: {e}"))
}
