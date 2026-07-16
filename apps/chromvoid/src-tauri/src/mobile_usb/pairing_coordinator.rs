use super::types::{HostId, MobileUsbError, MobileUsbErrorCode};

pub(crate) struct NoiseStaticKeypair {
    pub(crate) private: Vec<u8>,
    pub(crate) public: Vec<u8>,
}

pub(crate) fn noise_static_keypair() -> Result<NoiseStaticKeypair, MobileUsbError> {
    let params: snow::params::NoiseParams =
        chromvoid_protocol::NOISE_PARAMS_XX
            .parse()
            .map_err(|error: snow::Error| {
                MobileUsbError::new(
                    MobileUsbErrorCode::HandshakeFailed,
                    format!("noise params failed: {error}"),
                )
            })?;
    let keypair = snow::Builder::new(params)
        .generate_keypair()
        .map_err(|error| {
            MobileUsbError::new(
                MobileUsbErrorCode::HandshakeFailed,
                format!("noise keypair generation failed: {error}"),
            )
        })?;
    Ok(NoiseStaticKeypair {
        private: keypair.private,
        public: keypair.public,
    })
}

pub(crate) fn new_host_id() -> HostId {
    format!("mobile-usb-{}", uuid::Uuid::new_v4())
}

pub(crate) fn desktop_usb_pairing_label() -> String {
    std::env::var("HOSTNAME")
        .ok()
        .or_else(|| std::env::var("COMPUTERNAME").ok())
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "ChromVoid Desktop".to_string())
}

pub(crate) fn now_secs() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or_default()
}
