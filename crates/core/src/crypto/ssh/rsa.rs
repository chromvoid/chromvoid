//! RSA conversion shared with the desktop signer.
use ssh_key::private::RsaKeypair;

/// Reconstructs and validates the RSA key with both distinct prime factors.
/// ssh-key 0.6.7's conversion supplies p twice; keep this existing adapter at one shared owner.
pub fn rsa_private_key_from_keypair(keypair: &RsaKeypair) -> Result<rsa::RsaPrivateKey, String> {
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
