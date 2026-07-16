use super::backend::{AndroidAoaBackendError, AndroidAoaDeviceHandle};

pub(super) const AOA_GET_PROTOCOL_REQUEST: u8 = 51;
pub(super) const AOA_SEND_STRING_REQUEST: u8 = 52;
pub(super) const AOA_START_REQUEST: u8 = 53;
pub(super) const AOA_GET_PROTOCOL_REQUEST_TYPE: u8 = 0xC0;
pub(super) const AOA_SEND_REQUEST_TYPE: u8 = 0x40;
pub(super) const AOA_STRING_MANUFACTURER: u16 = 0;
pub(super) const AOA_STRING_MODEL: u16 = 1;
pub(super) const AOA_STRING_DESCRIPTION: u16 = 2;
pub(super) const AOA_STRING_VERSION: u16 = 3;
pub(super) const AOA_STRING_URI: u16 = 4;
pub(super) const AOA_STRING_SERIAL: u16 = 5;
pub(super) const CHROMVOID_AOA_MANUFACTURER: &str = "ChromVoid";
pub(super) const CHROMVOID_AOA_MODEL: &str = "ChromVoid Mobile Host";
pub(super) const CHROMVOID_AOA_DEV_MODEL: &str = "ChromVoid Mobile Host Dev";
pub(super) const CHROMVOID_AOA_DESCRIPTION: &str = "ChromVoid USB Remote";
pub(super) const CHROMVOID_AOA_VERSION: &str = "1";
pub(super) const CHROMVOID_AOA_URI: &str = "https://chromvoid.com";
pub(super) const CHROMVOID_AOA_PROTOCOL_ID: &str = "chromvoid.usb_remote.v1";

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct AndroidAoaIdentity {
    pub(super) manufacturer: String,
    pub(super) model: String,
    pub(super) description: String,
    pub(super) version: String,
    pub(super) uri: String,
    pub(super) protocol_id: String,
}

impl AndroidAoaIdentity {
    pub(crate) fn for_app_identifier(app_identifier: &str) -> Self {
        let mut identity = Self::default();
        if app_identifier.trim().ends_with(".dev") {
            identity.model = CHROMVOID_AOA_DEV_MODEL.to_string();
        }
        identity
    }
}

impl Default for AndroidAoaIdentity {
    fn default() -> Self {
        Self {
            manufacturer: CHROMVOID_AOA_MANUFACTURER.to_string(),
            model: CHROMVOID_AOA_MODEL.to_string(),
            description: CHROMVOID_AOA_DESCRIPTION.to_string(),
            version: CHROMVOID_AOA_VERSION.to_string(),
            uri: CHROMVOID_AOA_URI.to_string(),
            protocol_id: CHROMVOID_AOA_PROTOCOL_ID.to_string(),
        }
    }
}

pub(super) fn negotiate_accessory_mode(
    handle: &mut dyn AndroidAoaDeviceHandle,
    identity: &AndroidAoaIdentity,
) -> Result<(), AndroidAoaBackendError> {
    let version = handle.read_protocol_version()?;
    if version == 0 {
        return Err(AndroidAoaBackendError::UnsupportedProtocol);
    }

    for (index, value) in identity.accessory_strings() {
        handle.send_string(index, value)?;
    }
    handle.start_accessory()
}

impl AndroidAoaIdentity {
    fn accessory_strings(&self) -> [(u16, &str); 6] {
        [
            (AOA_STRING_MANUFACTURER, self.manufacturer.as_str()),
            (AOA_STRING_MODEL, self.model.as_str()),
            (AOA_STRING_DESCRIPTION, self.description.as_str()),
            (AOA_STRING_VERSION, self.version.as_str()),
            (AOA_STRING_URI, self.uri.as_str()),
            (AOA_STRING_SERIAL, self.protocol_id.as_str()),
        ]
    }
}
