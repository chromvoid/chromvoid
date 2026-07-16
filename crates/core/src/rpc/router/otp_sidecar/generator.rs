use base64::{engine::general_purpose, Engine as _};
use hmac::{Hmac, Mac};
use sha1::Sha1;
use sha2::{Sha256, Sha512};
use totp_rs::{Algorithm as TotpAlgorithm, Secret, TOTP};

use super::{OtpSidecarError, OtpSidecarResult};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum OtpKind {
    Totp,
    Hotp,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum OtpAlgorithm {
    Sha1,
    Sha256,
    Sha512,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum OtpEncoding {
    Base32,
    Base64,
    Base16,
    Utf8,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) struct OtpSettings {
    pub(super) algorithm: OtpAlgorithm,
    pub(super) digits: u8,
    pub(super) period: u32,
    pub(super) encoding: OtpEncoding,
    pub(super) kind: OtpKind,
    pub(super) counter: Option<u64>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct GeneratedOtp {
    pub(super) otp: String,
    pub(super) period: u32,
    pub(super) left_seconds: u32,
}

impl OtpAlgorithm {
    pub(super) fn as_str(self) -> &'static str {
        match self {
            Self::Sha1 => "SHA1",
            Self::Sha256 => "SHA256",
            Self::Sha512 => "SHA512",
        }
    }

    fn to_totp(self) -> TotpAlgorithm {
        match self {
            Self::Sha1 => TotpAlgorithm::SHA1,
            Self::Sha256 => TotpAlgorithm::SHA256,
            Self::Sha512 => TotpAlgorithm::SHA512,
        }
    }
}

impl OtpEncoding {
    pub(super) fn as_str(self) -> &'static str {
        match self {
            Self::Base32 => "base32",
            Self::Base64 => "base64",
            Self::Base16 => "base16",
            Self::Utf8 => "utf-8",
        }
    }
}

impl OtpKind {
    pub(super) fn as_str(self) -> &'static str {
        match self {
            Self::Totp => "TOTP",
            Self::Hotp => "HOTP",
        }
    }
}

pub(super) fn normalize_settings(
    algorithm: &str,
    digits: u8,
    period: u32,
    encoding: &str,
    otp_type: &str,
    counter: Option<u64>,
) -> OtpSidecarResult<OtpSettings> {
    let algorithm = match algorithm.trim().to_uppercase().replace('-', "").as_str() {
        "SHA1" => OtpAlgorithm::Sha1,
        "SHA256" => OtpAlgorithm::Sha256,
        "SHA512" => OtpAlgorithm::Sha512,
        _ => return Err(OtpSidecarError::otp_settings_invalid("Invalid algorithm")),
    };

    if digits != 6 && digits != 8 {
        return Err(OtpSidecarError::otp_settings_invalid(
            "digits must be 6 or 8",
        ));
    }

    let kind = match otp_type.trim().to_uppercase().as_str() {
        "TOTP" => OtpKind::Totp,
        "HOTP" => OtpKind::Hotp,
        _ => return Err(OtpSidecarError::otp_settings_invalid("Invalid OTP type")),
    };

    if kind == OtpKind::Totp && !(10..=120).contains(&period) {
        return Err(OtpSidecarError::otp_settings_invalid(
            "period must be between 10 and 120",
        ));
    }

    let encoding = match encoding.trim().to_lowercase().as_str() {
        "base32" => OtpEncoding::Base32,
        "base64" => OtpEncoding::Base64,
        "base16" | "hex" => OtpEncoding::Base16,
        "utf-8" | "utf8" => OtpEncoding::Utf8,
        _ => {
            return Err(OtpSidecarError::otp_settings_invalid(
                "Invalid secret encoding",
            ))
        }
    };

    Ok(OtpSettings {
        algorithm,
        digits,
        period,
        encoding,
        kind,
        counter,
    })
}

pub(super) fn generate(
    secret: &str,
    settings: OtpSettings,
    ts: Option<u64>,
) -> OtpSidecarResult<GeneratedOtp> {
    let secret_bytes = decode_secret(secret, settings.encoding)?;
    match settings.kind {
        OtpKind::Totp => generate_totp(secret_bytes, settings, ts),
        OtpKind::Hotp => generate_hotp(secret_bytes, settings),
    }
}

pub(super) fn now_seconds() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or(0)
}

fn generate_totp(
    secret_bytes: Vec<u8>,
    settings: OtpSettings,
    ts: Option<u64>,
) -> OtpSidecarResult<GeneratedOtp> {
    let totp = TOTP::new_unchecked(
        settings.algorithm.to_totp(),
        settings.digits as usize,
        1,
        settings.period as u64,
        secret_bytes,
        None,
        "account".to_string(),
    );
    let time = ts.unwrap_or_else(now_seconds);
    let left_seconds = settings.period - (time % settings.period as u64) as u32;

    Ok(GeneratedOtp {
        otp: totp.generate(time),
        period: settings.period,
        left_seconds: left_seconds.max(1),
    })
}

fn generate_hotp(secret_bytes: Vec<u8>, settings: OtpSettings) -> OtpSidecarResult<GeneratedOtp> {
    let counter = settings.counter.unwrap_or(0);
    let digest = match settings.algorithm {
        OtpAlgorithm::Sha1 => hmac_sha1(&secret_bytes, counter)?,
        OtpAlgorithm::Sha256 => hmac_sha256(&secret_bytes, counter)?,
        OtpAlgorithm::Sha512 => hmac_sha512(&secret_bytes, counter)?,
    };
    let binary = dynamic_truncate(&digest)?;
    let divisor = 10_u32.pow(settings.digits as u32);
    let value = binary % divisor;

    Ok(GeneratedOtp {
        otp: format!("{value:0width$}", width = settings.digits as usize),
        period: settings.period,
        left_seconds: 0,
    })
}

fn hmac_sha1(secret: &[u8], counter: u64) -> OtpSidecarResult<Vec<u8>> {
    let mut mac = Hmac::<Sha1>::new_from_slice(secret)
        .map_err(|_| OtpSidecarError::otp_generate_failed("Failed to initialize HOTP"))?;
    mac.update(&counter.to_be_bytes());
    Ok(mac.finalize().into_bytes().to_vec())
}

fn hmac_sha256(secret: &[u8], counter: u64) -> OtpSidecarResult<Vec<u8>> {
    let mut mac = Hmac::<Sha256>::new_from_slice(secret)
        .map_err(|_| OtpSidecarError::otp_generate_failed("Failed to initialize HOTP"))?;
    mac.update(&counter.to_be_bytes());
    Ok(mac.finalize().into_bytes().to_vec())
}

fn hmac_sha512(secret: &[u8], counter: u64) -> OtpSidecarResult<Vec<u8>> {
    let mut mac = Hmac::<Sha512>::new_from_slice(secret)
        .map_err(|_| OtpSidecarError::otp_generate_failed("Failed to initialize HOTP"))?;
    mac.update(&counter.to_be_bytes());
    Ok(mac.finalize().into_bytes().to_vec())
}

fn dynamic_truncate(digest: &[u8]) -> OtpSidecarResult<u32> {
    let Some(last) = digest.last() else {
        return Err(OtpSidecarError::otp_generate_failed("Empty HOTP digest"));
    };
    let offset = (last & 0x0f) as usize;
    if digest.len() < offset + 4 {
        return Err(OtpSidecarError::otp_generate_failed("Invalid HOTP digest"));
    }

    Ok(((digest[offset] as u32 & 0x7f) << 24)
        | ((digest[offset + 1] as u32) << 16)
        | ((digest[offset + 2] as u32) << 8)
        | digest[offset + 3] as u32)
}

fn decode_secret(secret: &str, encoding: OtpEncoding) -> OtpSidecarResult<Vec<u8>> {
    match encoding {
        OtpEncoding::Base32 => decode_base32(secret),
        OtpEncoding::Base64 => decode_base64(secret),
        OtpEncoding::Base16 => decode_base16(secret),
        OtpEncoding::Utf8 => {
            if secret.is_empty() {
                Err(OtpSidecarError::otp_settings_invalid(
                    "Invalid secret encoding",
                ))
            } else {
                Ok(secret.as_bytes().to_vec())
            }
        }
    }
}

fn decode_base32(secret: &str) -> OtpSidecarResult<Vec<u8>> {
    let compact = secret
        .chars()
        .filter(|char| !char.is_whitespace())
        .collect::<String>()
        .trim_end_matches('=')
        .to_uppercase();
    if compact.is_empty() {
        return Err(OtpSidecarError::otp_settings_invalid(
            "Invalid secret encoding",
        ));
    }

    Secret::Encoded(compact)
        .to_bytes()
        .map_err(|_| OtpSidecarError::otp_settings_invalid("Invalid secret encoding"))
}

fn decode_base64(secret: &str) -> OtpSidecarResult<Vec<u8>> {
    let compact = secret
        .chars()
        .filter(|char| !char.is_whitespace())
        .collect::<String>();
    if compact.is_empty() {
        return Err(OtpSidecarError::otp_settings_invalid(
            "Invalid secret encoding",
        ));
    }

    general_purpose::STANDARD
        .decode(&compact)
        .or_else(|_| general_purpose::STANDARD_NO_PAD.decode(&compact))
        .map_err(|_| OtpSidecarError::otp_settings_invalid("Invalid secret encoding"))
}

fn decode_base16(secret: &str) -> OtpSidecarResult<Vec<u8>> {
    let compact = secret
        .chars()
        .filter(|char| !char.is_whitespace())
        .collect::<String>();
    if compact.is_empty() || !compact.is_ascii() || compact.len() % 2 != 0 {
        return Err(OtpSidecarError::otp_settings_invalid(
            "Invalid secret encoding",
        ));
    }

    (0..compact.len())
        .step_by(2)
        .map(|index| u8::from_str_radix(&compact[index..index + 2], 16))
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| OtpSidecarError::otp_settings_invalid("Invalid secret encoding"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn generates_rfc6238_totp_sha1() {
        let settings = normalize_settings("SHA1", 8, 30, "utf-8", "TOTP", None).unwrap();
        let generated = generate("12345678901234567890", settings, Some(59)).unwrap();
        assert_eq!(generated.otp, "94287082");
        assert_eq!(generated.left_seconds, 1);
    }

    #[test]
    fn generates_rfc4226_hotp_sha1() {
        let settings = normalize_settings("SHA1", 6, 30, "utf-8", "HOTP", Some(0)).unwrap();
        let generated = generate("12345678901234567890", settings, None).unwrap();
        assert_eq!(generated.otp, "755224");
    }

    #[test]
    fn rejects_unsupported_settings() {
        assert!(normalize_settings("SHA384", 6, 30, "base32", "TOTP", None).is_err());
        assert!(normalize_settings("SHA1", 7, 30, "base32", "TOTP", None).is_err());
        assert!(normalize_settings("SHA1", 6, 30, "base85", "TOTP", None).is_err());
        assert!(normalize_settings("SHA1", 6, 9, "base32", "TOTP", None).is_err());
    }
}
