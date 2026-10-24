//! Shared OpenSSH key material for native clients and the desktop adapter.
use ssh_key::{
    private::{Ed25519Keypair, KeypairData},
    Algorithm, HashAlg, LineEnding, PrivateKey,
};
use zeroize::Zeroizing;
mod rsa;
pub use self::rsa::rsa_private_key_from_keypair;

pub struct SshKeyMaterial {
    pub private_key_pem: Zeroizing<String>,
    pub public_key_openssh: String,
    pub fingerprint: String,
    pub key_type: String,
    pub comment: String,
}

pub fn generate_ssh_key_material(key_type: &str, comment: &str) -> Result<SshKeyMaterial, String> {
    let mut rng = rand_core::OsRng;

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

    encode_material(private_key)
}

fn encode_material(private_key: PrivateKey) -> Result<SshKeyMaterial, String> {
    let key_type = match private_key.algorithm() {
        Algorithm::Ed25519 => "ed25519",
        Algorithm::Rsa { .. } => "rsa",
        Algorithm::Ecdsa {
            curve: ssh_key::EcdsaCurve::NistP256 | ssh_key::EcdsaCurve::NistP384,
        } => "ecdsa",
        _ => return Err("Unsupported SSH key algorithm".to_string()),
    };
    Ok(SshKeyMaterial {
        private_key_pem: private_key
            .to_openssh(LineEnding::LF)
            .map_err(|_| "Could not encode SSH private key")?,
        public_key_openssh: private_key
            .public_key()
            .to_openssh()
            .map_err(|_| "Could not encode SSH public key")?,
        fingerprint: private_key.fingerprint(HashAlg::Sha256).to_string(),
        key_type: key_type.to_string(),
        comment: private_key.comment().to_string(),
    })
}

pub const MAX_OPENSSH_BYTES: usize = 64 * 1024;
pub const MAX_SSH_PASSPHRASE_BYTES: usize = 1024;
const INVALID_KEY: &str = "SSH private key or passphrase is invalid";

/// Imported passphrases are only used to unwrap the input; the vault owns storage encryption.
pub fn import_ssh_key_material(
    encoded: &str,
    passphrase: Option<&str>,
) -> Result<SshKeyMaterial, String> {
    let key = parse_private_key(encoded, passphrase)?;
    encode_material(key)
}

/// Export protection is independent of vault encryption and never modifies the stored key.
pub fn export_ssh_private_key(
    encoded: &str,
    passphrase: Option<&str>,
) -> Result<(Zeroizing<String>, String), String> {
    validate_passphrase(passphrase)?;
    let private = parse_private_key(encoded, None)?;
    let fingerprint = private.fingerprint(HashAlg::Sha256).to_string();
    let exported = match passphrase.filter(|value| !value.is_empty()) {
        Some(value) => private
            .encrypt(&mut rand_core::OsRng, value)
            .map_err(|_| "Could not encrypt SSH export")?,
        None => private,
    };
    let content = exported
        .to_openssh(LineEnding::LF)
        .map_err(|_| "Could not encode SSH export".to_string())?;
    Ok((content, fingerprint))
}

pub fn validate_passphrase(passphrase: Option<&str>) -> Result<(), String> {
    if passphrase.is_some_and(|value| value.len() > MAX_SSH_PASSPHRASE_BYTES) {
        return Err("SSH passphrase exceeds 1024 bytes".to_string());
    }
    Ok(())
}

fn parse_private_key(encoded: &str, passphrase: Option<&str>) -> Result<PrivateKey, String> {
    if encoded.len() > MAX_OPENSSH_BYTES {
        return Err("SSH private key exceeds 64 KiB".to_string());
    }
    validate_passphrase(passphrase)?;
    let key = PrivateKey::from_openssh(encoded).map_err(|_| INVALID_KEY)?;
    match key.algorithm() {
        Algorithm::Ed25519
        | Algorithm::Rsa { .. }
        | Algorithm::Ecdsa {
            curve: ssh_key::EcdsaCurve::NistP256 | ssh_key::EcdsaCurve::NistP384,
        } => (),
        _ => return Err("Unsupported SSH key algorithm".to_string()),
    }
    if let Some(rsa) = key.public_key().key_data().rsa() {
        if rsa
            .n
            .as_positive_bytes()
            .is_none_or(|bytes| bytes.len() > 1024)
            || rsa
                .e
                .as_positive_bytes()
                .is_none_or(|bytes| bytes.len() > 8)
        {
            return Err("SSH RSA parameters exceed supported limits".to_string());
        }
    }
    let key = if key.is_encrypted() {
        match key.kdf() {
            ssh_key::Kdf::Bcrypt { salt, rounds }
                if (1..=1024).contains(rounds) && (1..=1024).contains(&salt.len()) =>
            {
                ()
            }
            _ => return Err("SSH encryption settings exceed supported limits".to_string()),
        }
        key.decrypt(passphrase.ok_or(INVALID_KEY)?)
            .map_err(|_| INVALID_KEY)?
    } else {
        if !key.kdf().is_none() {
            return Err(INVALID_KEY.to_string());
        }
        key
    };
    if let Some(rsa) = key.key_data().rsa() {
        if [
            &rsa.private.d,
            &rsa.private.p,
            &rsa.private.q,
            &rsa.private.iqmp,
        ]
        .iter()
        .any(|part| {
            part.as_positive_bytes()
                .is_none_or(|bytes| bytes.len() > 1024)
        }) {
            return Err("SSH RSA parameters exceed supported limits".to_string());
        }
        // The shared desktop conversion validates n/e/d against p and q. Do not route RSA
        // through ssh-key 0.6.7's generic Signer, whose conversion repeats p instead of q.
        let validated = rsa_private_key_from_keypair(rsa).map_err(|_| INVALID_KEY)?;
        let coefficient = ::rsa::BigUint::try_from(&rsa.private.iqmp).map_err(|_| INVALID_KEY)?;
        if validated.crt_coefficient().as_ref() != Some(&coefficient) {
            return Err(INVALID_KEY.to_string());
        }
        return Ok(key);
    }
    // Parsing validates framing/public fields; signing checks that the secret material actually
    // corresponds to that public key. The challenge is internal and never returned to callers.
    const NAMESPACE: &str = "chromvoid-ssh-import";
    const CHALLENGE: &[u8] = b"validate imported key pair";
    let signature = key
        .sign(NAMESPACE, HashAlg::Sha256, CHALLENGE)
        .map_err(|_| INVALID_KEY)?;
    key.public_key()
        .verify(NAMESPACE, CHALLENGE, &signature)
        .map_err(|_| INVALID_KEY)?;
    Ok(key)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn import_rejects_inconsistent_private_material() {
        let mut pair = Ed25519Keypair::random(&mut rand_core::OsRng);
        pair.public = Ed25519Keypair::random(&mut rand_core::OsRng).public;
        let key = PrivateKey::new(KeypairData::Ed25519(pair), "synthetic").unwrap();
        let encoded = key.to_openssh(LineEnding::LF).unwrap();
        assert!(import_ssh_key_material(&encoded, None).is_err());
    }

    #[test]
    fn import_rejects_excessive_bcrypt_work_before_decryption() {
        let key = PrivateKey::random(&mut rand_core::OsRng, Algorithm::Ed25519).unwrap();
        let encrypted = key.encrypt(&mut rand_core::OsRng, "synthetic").unwrap();
        let mut bytes = encrypted.to_bytes().unwrap();
        // PROTOCOL.key: magic, cipher string, KDF name string, KDF options string.
        let mut offset = b"openssh-key-v1\0".len();
        for _ in 0..2 {
            let length = u32::from_be_bytes(bytes[offset..offset + 4].try_into().unwrap()) as usize;
            offset += 4 + length;
        }
        let options_length =
            u32::from_be_bytes(bytes[offset..offset + 4].try_into().unwrap()) as usize;
        let rounds = offset + options_length;
        bytes[rounds..rounds + 4].copy_from_slice(&1025_u32.to_be_bytes());
        let excessive = PrivateKey::from_bytes(&bytes)
            .unwrap()
            .to_openssh(LineEnding::LF)
            .unwrap();
        let result = import_ssh_key_material(&excessive, Some("synthetic"));
        assert_eq!(
            result.err().as_deref(),
            Some("SSH encryption settings exceed supported limits")
        );
    }

    #[test]
    fn import_rejects_oversized_rsa_before_signing() {
        use ssh_key::{
            private::{RsaKeypair, RsaPrivateKey},
            public::RsaPublicKey,
            Mpint,
        };
        let small = || Mpint::from_positive_bytes(&[3]).unwrap();
        let pair = RsaKeypair {
            public: RsaPublicKey {
                e: small(),
                n: Mpint::from_positive_bytes(&vec![1; 1025]).unwrap(),
            },
            private: RsaPrivateKey {
                d: small(),
                iqmp: small(),
                p: small(),
                q: small(),
            },
        };
        let key = PrivateKey::new(KeypairData::Rsa(pair), "synthetic")
            .unwrap()
            .to_openssh(LineEnding::LF)
            .unwrap();
        assert_eq!(
            import_ssh_key_material(&key, None).err().as_deref(),
            Some("SSH RSA parameters exceed supported limits")
        );
    }
}
