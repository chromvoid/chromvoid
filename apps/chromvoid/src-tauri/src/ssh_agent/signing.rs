//! Key loading and signing operations for SSH agent.

use rsa::pkcs1v15;
use signature::{SignatureEncoding, Signer};
use ssh_key::{
    private::{KeypairData, PrivateKey, RsaKeypair},
    Algorithm, HashAlg, Signature,
};

const SSH_AGENT_RSA_SHA2_256: u32 = 2;
const SSH_AGENT_RSA_SHA2_512: u32 = 4;
const SSH_AGENT_RSA_ALLOWED_FLAGS: u32 = SSH_AGENT_RSA_SHA2_256 | SSH_AGENT_RSA_SHA2_512;

/// Sign data with the given PEM-encoded private key.
/// Returns the SSH-formatted signature blob or an error.
pub fn sign_data(private_key_pem: &str, data: &[u8], flags: u32) -> Result<Vec<u8>, String> {
    let private_key = PrivateKey::from_openssh(private_key_pem)
        .map_err(|e| format!("Failed to parse private key: {e}"))?;

    match private_key.key_data() {
        KeypairData::Ed25519(_) => {
            ensure_no_rsa_flags(flags, "Ed25519")?;
            sign_with_private_key(&private_key, data, "Ed25519 signing failed")
        }
        KeypairData::Ecdsa(_) => {
            ensure_no_rsa_flags(flags, "ECDSA")?;
            sign_with_private_key(&private_key, data, "ECDSA signing failed")
        }
        KeypairData::Rsa(keypair) => sign_rsa(keypair, data, flags),
        _ => Err("Unsupported SSH key type for local signing".to_string()),
    }
}

fn ensure_no_rsa_flags(flags: u32, key_type: &str) -> Result<(), String> {
    if flags == 0 {
        return Ok(());
    }

    Err(format!(
        "{key_type} signing does not accept RSA sign flags: 0x{flags:08x}"
    ))
}

fn sign_with_private_key(
    private_key: &PrivateKey,
    data: &[u8],
    context: &str,
) -> Result<Vec<u8>, String> {
    let signature: Signature = private_key
        .try_sign(data)
        .map_err(|e| format!("{context}: {e}"))?;
    encode_signature(signature)
}

fn sign_rsa(keypair: &RsaKeypair, data: &[u8], flags: u32) -> Result<Vec<u8>, String> {
    let hash = resolve_rsa_hash(flags)?;
    let private_key = rsa_private_key_from_keypair(keypair)?;

    let signature = match hash {
        HashAlg::Sha256 => {
            let signing_key = pkcs1v15::SigningKey::<sha2::Sha256>::new(private_key.clone());
            let signature = signing_key
                .try_sign(data)
                .map_err(|e| format!("RSA SHA-256 signing failed: {e}"))?;
            Signature::new(
                Algorithm::Rsa {
                    hash: Some(HashAlg::Sha256),
                },
                signature.to_vec(),
            )
            .map_err(|e| format!("Failed to build RSA SHA-256 SSH signature: {e}"))?
        }
        HashAlg::Sha512 => {
            let signing_key = pkcs1v15::SigningKey::<sha2::Sha512>::new(private_key);
            let signature = signing_key
                .try_sign(data)
                .map_err(|e| format!("RSA SHA-512 signing failed: {e}"))?;
            Signature::new(
                Algorithm::Rsa {
                    hash: Some(HashAlg::Sha512),
                },
                signature.to_vec(),
            )
            .map_err(|e| format!("Failed to build RSA SHA-512 SSH signature: {e}"))?
        }
        _ => return Err(format!("Unsupported RSA hash algorithm: {hash:?}")),
    };

    encode_signature(signature)
}

fn rsa_private_key_from_keypair(keypair: &RsaKeypair) -> Result<rsa::RsaPrivateKey, String> {
    let mut private_key = rsa::RsaPrivateKey::from_components(
        rsa::BigUint::try_from(&keypair.public.n)
            .map_err(|e| format!("Failed to decode RSA modulus: {e}"))?,
        rsa::BigUint::try_from(&keypair.public.e)
            .map_err(|e| format!("Failed to decode RSA exponent: {e}"))?,
        rsa::BigUint::try_from(&keypair.private.d)
            .map_err(|e| format!("Failed to decode RSA private exponent: {e}"))?,
        vec![
            rsa::BigUint::try_from(&keypair.private.p)
                .map_err(|e| format!("Failed to decode RSA prime p: {e}"))?,
            rsa::BigUint::try_from(&keypair.private.q)
                .map_err(|e| format!("Failed to decode RSA prime q: {e}"))?,
        ],
    )
    .map_err(|e| format!("Failed to reconstruct RSA private key: {e}"))?;

    private_key
        .precompute()
        .map_err(|e| format!("Failed to precompute RSA CRT values: {e}"))?;

    Ok(private_key)
}

fn resolve_rsa_hash(flags: u32) -> Result<HashAlg, String> {
    if flags & !SSH_AGENT_RSA_ALLOWED_FLAGS != 0 {
        return Err(format!("Unsupported RSA sign flags: 0x{flags:08x}"));
    }

    match flags {
        0 | SSH_AGENT_RSA_SHA2_512 => Ok(HashAlg::Sha512),
        SSH_AGENT_RSA_SHA2_256 => Ok(HashAlg::Sha256),
        _ => Err(format!("Conflicting RSA sign flags: 0x{flags:08x}")),
    }
}

fn encode_signature(signature: Signature) -> Result<Vec<u8>, String> {
    Vec::<u8>::try_from(signature).map_err(|e| format!("Failed to encode SSH signature: {e}"))
}

/// Extract the public key blob from an OpenSSH public key string.
pub fn public_key_blob_from_openssh(public_key_openssh: &str) -> Result<Vec<u8>, String> {
    let public_key = ssh_key::PublicKey::from_openssh(public_key_openssh)
        .map_err(|e| format!("Failed to parse public key: {e}"))?;
    public_key
        .to_bytes()
        .map_err(|e| format!("Failed to encode public key blob: {e}"))
}

#[cfg(test)]
mod tests {
    use super::{sign_data, SSH_AGENT_RSA_SHA2_256, SSH_AGENT_RSA_SHA2_512};
    use ssh_key::{Algorithm, HashAlg, Signature};

    const ED25519_PRIVATE_KEY: &str = include_str!("testdata/ed25519");
    const ED25519_PUBLIC_KEY: &str = include_str!("testdata/ed25519.pub");
    const ECDSA_PRIVATE_KEY: &str = include_str!("testdata/ecdsa");
    const ECDSA_PUBLIC_KEY: &str = include_str!("testdata/ecdsa.pub");
    const RSA_PRIVATE_KEY: &str = include_str!("testdata/rsa");
    const RSA_PUBLIC_KEY: &str = include_str!("testdata/rsa.pub");

    fn fixture_material(key_type: &str) -> (&'static str, &'static str) {
        match key_type {
            "ed25519" => (ED25519_PRIVATE_KEY, ED25519_PUBLIC_KEY),
            "ecdsa" => (ECDSA_PRIVATE_KEY, ECDSA_PUBLIC_KEY),
            "rsa" => (RSA_PRIVATE_KEY, RSA_PUBLIC_KEY),
            other => panic!("unsupported fixture key type: {other}"),
        }
    }

    fn sign_and_verify(key_type: &str, flags: u32) -> (ssh_key::PublicKey, Signature) {
        let (private_key_pem, public_key_openssh) = fixture_material(key_type);
        let signature_bytes =
            sign_data(private_key_pem, b"chromvoid ssh-agent", flags).expect("sign");
        let public_key = ssh_key::PublicKey::from_openssh(public_key_openssh).expect("public key");
        let signature =
            Signature::try_from(signature_bytes.as_slice()).expect("decode ssh signature");

        signature::Verifier::verify(&public_key, b"chromvoid ssh-agent", &signature)
            .expect("signature verifies");

        (public_key, signature)
    }

    #[test]
    fn signs_ed25519_requests() {
        let (_, signature) = sign_and_verify("ed25519", 0);
        assert_eq!(signature.algorithm(), Algorithm::Ed25519);
    }

    #[test]
    fn signs_ecdsa_requests() {
        let (_, signature) = sign_and_verify("ecdsa", 0);
        assert_eq!(
            signature.algorithm(),
            Algorithm::Ecdsa {
                curve: ssh_key::EcdsaCurve::NistP256,
            }
        );
    }

    #[test]
    fn rsa_defaults_to_sha512() {
        let (_, signature) = sign_and_verify("rsa", 0);
        assert_eq!(
            signature.algorithm(),
            Algorithm::Rsa {
                hash: Some(HashAlg::Sha512),
            }
        );
    }

    #[test]
    fn rsa_honors_sha256_flag() {
        let (_, signature) = sign_and_verify("rsa", SSH_AGENT_RSA_SHA2_256);
        assert_eq!(
            signature.algorithm(),
            Algorithm::Rsa {
                hash: Some(HashAlg::Sha256),
            }
        );
    }

    #[test]
    fn rsa_honors_sha512_flag() {
        let (_, signature) = sign_and_verify("rsa", SSH_AGENT_RSA_SHA2_512);
        assert_eq!(
            signature.algorithm(),
            Algorithm::Rsa {
                hash: Some(HashAlg::Sha512),
            }
        );
    }

    #[test]
    fn rsa_rejects_conflicting_or_unknown_flags() {
        let data = b"chromvoid ssh-agent";

        assert!(sign_data(
            RSA_PRIVATE_KEY,
            data,
            SSH_AGENT_RSA_SHA2_256 | SSH_AGENT_RSA_SHA2_512
        )
        .is_err());
        assert!(sign_data(RSA_PRIVATE_KEY, data, 8).is_err());
    }

    #[test]
    fn non_rsa_keys_fail_closed_on_rsa_flags() {
        assert!(sign_data(
            ECDSA_PRIVATE_KEY,
            b"chromvoid ssh-agent",
            SSH_AGENT_RSA_SHA2_256
        )
        .is_err());
    }

    #[test]
    fn invalid_private_key_still_fails() {
        assert!(sign_data("invalid private key", b"chromvoid ssh-agent", 0).is_err());
    }
}
