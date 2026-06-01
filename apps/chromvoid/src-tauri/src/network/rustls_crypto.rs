use std::sync::OnceLock;

static RUSTLS_CRYPTO_INSTALL: OnceLock<Result<(), String>> = OnceLock::new();

pub(super) fn ensure_rustls_crypto_provider_installed() -> Result<(), String> {
    RUSTLS_CRYPTO_INSTALL
        .get_or_init(|| {
            if rustls::crypto::CryptoProvider::get_default().is_some() {
                return Ok(());
            }
            rustls::crypto::ring::default_provider()
                .install_default()
                .map_err(|_| "install rustls crypto provider failed".to_string())
        })
        .clone()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rustls_crypto_provider_install_is_idempotent() {
        let first = ensure_rustls_crypto_provider_installed();
        let second = ensure_rustls_crypto_provider_installed();

        assert_eq!(first, second);
        assert!(second.is_ok());
    }
}
