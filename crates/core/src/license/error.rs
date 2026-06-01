use std::fmt;

#[derive(Debug, Clone)]
pub(super) enum LicenseError {
    CertNotInstalled,
    UnsupportedCertVersion,
    UnsupportedFeatureset,
    FingerprintMismatch,
    InvalidExpiration,
    CertExpired,
    NoTrustedPublicKey,
    UnknownKeyId,
    InvalidSignatureEncoding(String),
    InvalidSignatureLength,
    InvalidSignature,
    InvalidPublicKeyLength,
    Message(String),
}

impl LicenseError {
    pub(super) fn message(error: impl ToString) -> Self {
        Self::Message(error.to_string())
    }
}

impl fmt::Display for LicenseError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::CertNotInstalled => f.write_str("License cert not installed"),
            Self::UnsupportedCertVersion => f.write_str("Unsupported license cert version"),
            Self::UnsupportedFeatureset => f.write_str("Unsupported license featureset"),
            Self::FingerprintMismatch => f.write_str("License cert does not match this Core"),
            Self::InvalidExpiration => f.write_str("Invalid license expiration"),
            Self::CertExpired => f.write_str("License cert expired"),
            Self::NoTrustedPublicKey => f.write_str("No trusted license public key configured"),
            Self::UnknownKeyId => f.write_str("Unknown license key id"),
            Self::InvalidSignatureEncoding(error) => {
                write!(f, "Invalid license signature encoding: {error}")
            }
            Self::InvalidSignatureLength => f.write_str("Invalid license signature length"),
            Self::InvalidSignature => f.write_str("Invalid license signature"),
            Self::InvalidPublicKeyLength => f.write_str("Invalid license public key length"),
            Self::Message(error) => f.write_str(error),
        }
    }
}

impl std::error::Error for LicenseError {}
