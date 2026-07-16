use super::protocol::{
    AOA_GET_PROTOCOL_REQUEST, AOA_GET_PROTOCOL_REQUEST_TYPE, AOA_SEND_REQUEST_TYPE,
    AOA_SEND_STRING_REQUEST, AOA_START_REQUEST,
};
use std::time::Duration;

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub(super) struct AndroidAoaDeviceId {
    pub(super) bus_number: u8,
    pub(super) address: u8,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct AndroidAoaDeviceInfo {
    pub(super) id: AndroidAoaDeviceId,
    pub(super) vendor_id: u16,
    pub(super) product_id: u16,
    pub(super) manufacturer: Option<String>,
    pub(super) product: Option<String>,
    pub(super) serial_number: Option<String>,
    pub(super) endpoints: Option<AndroidAoaEndpoints>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) struct AndroidAoaEndpoints {
    pub(super) interface_number: u8,
    pub(super) in_address: u8,
    pub(super) out_address: u8,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) enum AndroidAoaBackendError {
    PermissionDenied,
    NoDevice,
    UnsupportedProtocol,
    Timeout,
    Io(String),
}

pub(super) trait AndroidAoaUsbBackend: Send + Sync + 'static {
    fn list_devices(&self) -> Result<Vec<AndroidAoaDeviceInfo>, AndroidAoaBackendError>;

    fn open_device(
        &self,
        id: &AndroidAoaDeviceId,
    ) -> Result<Box<dyn AndroidAoaDeviceHandle>, AndroidAoaBackendError>;

    fn open_accessory(
        &self,
        device: &AndroidAoaDeviceInfo,
    ) -> Result<Box<dyn AndroidAoaEndpointHandle>, AndroidAoaBackendError>;
}

pub(super) trait AndroidAoaDeviceHandle: Send + 'static {
    fn read_protocol_version(&mut self) -> Result<u16, AndroidAoaBackendError>;

    fn send_string(&mut self, index: u16, value: &str) -> Result<(), AndroidAoaBackendError>;

    fn start_accessory(&mut self) -> Result<(), AndroidAoaBackendError>;
}

pub(super) trait AndroidAoaEndpointHandle: Send + Sync + 'static {
    fn bulk_read(&self, buf: &mut [u8], timeout: Duration)
        -> Result<usize, AndroidAoaBackendError>;

    fn bulk_write(&self, data: &[u8], timeout: Duration) -> Result<usize, AndroidAoaBackendError>;

    fn close(&self) -> Result<(), AndroidAoaBackendError> {
        Ok(())
    }
}

const CONTROL_TIMEOUT: Duration = Duration::from_millis(500);
pub(super) struct RusbAndroidAoaUsbBackend;

impl AndroidAoaUsbBackend for RusbAndroidAoaUsbBackend {
    fn list_devices(&self) -> Result<Vec<AndroidAoaDeviceInfo>, AndroidAoaBackendError> {
        use rusb::UsbContext;

        let context = rusb::Context::new().map_err(map_rusb_error)?;
        let devices = context.devices().map_err(map_rusb_error)?;
        let mut result = Vec::new();

        for device in devices.iter() {
            let descriptor = device.device_descriptor().map_err(map_rusb_error)?;
            let mut manufacturer = None;
            let mut product = None;
            let mut serial_number = None;
            if let Ok(handle) = device.open() {
                let language = handle
                    .read_languages(CONTROL_TIMEOUT)
                    .ok()
                    .and_then(|languages| languages.into_iter().next());
                if let Some(language) = language {
                    manufacturer = descriptor.manufacturer_string_index().and_then(|index| {
                        handle
                            .read_string_descriptor(language, index, CONTROL_TIMEOUT)
                            .ok()
                    });
                    product = descriptor.product_string_index().and_then(|index| {
                        handle
                            .read_string_descriptor(language, index, CONTROL_TIMEOUT)
                            .ok()
                    });
                    serial_number = descriptor.serial_number_string_index().and_then(|index| {
                        handle
                            .read_string_descriptor(language, index, CONTROL_TIMEOUT)
                            .ok()
                    });
                }
            }

            result.push(AndroidAoaDeviceInfo {
                id: AndroidAoaDeviceId {
                    bus_number: device.bus_number(),
                    address: device.address(),
                },
                vendor_id: descriptor.vendor_id(),
                product_id: descriptor.product_id(),
                manufacturer,
                product,
                serial_number,
                endpoints: find_bulk_endpoints(&device),
            });
        }

        Ok(result)
    }

    fn open_device(
        &self,
        id: &AndroidAoaDeviceId,
    ) -> Result<Box<dyn AndroidAoaDeviceHandle>, AndroidAoaBackendError> {
        let device = find_rusb_device(id)?;
        let handle = device.open().map_err(map_rusb_error)?;
        Ok(Box::new(RusbAndroidAoaDeviceHandle { handle }))
    }

    fn open_accessory(
        &self,
        device: &AndroidAoaDeviceInfo,
    ) -> Result<Box<dyn AndroidAoaEndpointHandle>, AndroidAoaBackendError> {
        let endpoints = device.endpoints.ok_or_else(|| {
            AndroidAoaBackendError::Io("Android AOA bulk endpoints were not discovered".to_string())
        })?;
        let rusb_device = find_rusb_device(&device.id)?;
        let handle = rusb_device.open().map_err(map_rusb_error)?;
        let _ = handle.set_auto_detach_kernel_driver(true);
        handle
            .claim_interface(endpoints.interface_number)
            .map_err(map_rusb_error)?;
        Ok(Box::new(RusbAndroidAoaEndpointHandle { handle, endpoints }))
    }
}

struct RusbAndroidAoaDeviceHandle {
    handle: rusb::DeviceHandle<rusb::Context>,
}

impl AndroidAoaDeviceHandle for RusbAndroidAoaDeviceHandle {
    fn read_protocol_version(&mut self) -> Result<u16, AndroidAoaBackendError> {
        let mut buf = [0_u8; 2];
        let len = self
            .handle
            .read_control(
                AOA_GET_PROTOCOL_REQUEST_TYPE,
                AOA_GET_PROTOCOL_REQUEST,
                0,
                0,
                &mut buf,
                CONTROL_TIMEOUT,
            )
            .map_err(map_rusb_error)?;
        if len != 2 {
            return Err(AndroidAoaBackendError::UnsupportedProtocol);
        }
        Ok(u16::from_le_bytes(buf))
    }

    fn send_string(&mut self, index: u16, value: &str) -> Result<(), AndroidAoaBackendError> {
        let mut bytes = value.as_bytes().to_vec();
        bytes.push(0);
        self.handle
            .write_control(
                AOA_SEND_REQUEST_TYPE,
                AOA_SEND_STRING_REQUEST,
                0,
                index,
                &bytes,
                CONTROL_TIMEOUT,
            )
            .map_err(map_rusb_error)?;
        Ok(())
    }

    fn start_accessory(&mut self) -> Result<(), AndroidAoaBackendError> {
        self.handle
            .write_control(
                AOA_SEND_REQUEST_TYPE,
                AOA_START_REQUEST,
                0,
                0,
                &[],
                CONTROL_TIMEOUT,
            )
            .map_err(map_rusb_error)?;
        Ok(())
    }
}

struct RusbAndroidAoaEndpointHandle {
    handle: rusb::DeviceHandle<rusb::Context>,
    endpoints: AndroidAoaEndpoints,
}

impl AndroidAoaEndpointHandle for RusbAndroidAoaEndpointHandle {
    fn bulk_read(
        &self,
        buf: &mut [u8],
        timeout: Duration,
    ) -> Result<usize, AndroidAoaBackendError> {
        self.handle
            .read_bulk(self.endpoints.in_address, buf, timeout)
            .map_err(map_rusb_error)
    }

    fn bulk_write(&self, data: &[u8], timeout: Duration) -> Result<usize, AndroidAoaBackendError> {
        self.handle
            .write_bulk(self.endpoints.out_address, data, timeout)
            .map_err(map_rusb_error)
    }

    fn close(&self) -> Result<(), AndroidAoaBackendError> {
        self.handle
            .release_interface(self.endpoints.interface_number)
            .map_err(map_rusb_error)
    }
}

impl Drop for RusbAndroidAoaEndpointHandle {
    fn drop(&mut self) {
        let _ = self
            .handle
            .release_interface(self.endpoints.interface_number);
    }
}

fn find_rusb_device(
    id: &AndroidAoaDeviceId,
) -> Result<rusb::Device<rusb::Context>, AndroidAoaBackendError> {
    use rusb::UsbContext;

    let context = rusb::Context::new().map_err(map_rusb_error)?;
    let devices = context.devices().map_err(map_rusb_error)?;
    devices
        .iter()
        .find(|device| device.bus_number() == id.bus_number && device.address() == id.address)
        .ok_or(AndroidAoaBackendError::NoDevice)
}

fn find_bulk_endpoints<T: rusb::UsbContext>(
    device: &rusb::Device<T>,
) -> Option<AndroidAoaEndpoints> {
    let config = device.active_config_descriptor().ok()?;
    for interface in config.interfaces() {
        for descriptor in interface.descriptors() {
            let mut in_address = None;
            let mut out_address = None;
            for endpoint in descriptor.endpoint_descriptors() {
                if endpoint.transfer_type() != rusb::TransferType::Bulk {
                    continue;
                }
                match endpoint.direction() {
                    rusb::Direction::In => in_address = Some(endpoint.address()),
                    rusb::Direction::Out => out_address = Some(endpoint.address()),
                }
            }
            if let (Some(in_address), Some(out_address)) = (in_address, out_address) {
                return Some(AndroidAoaEndpoints {
                    interface_number: descriptor.interface_number(),
                    in_address,
                    out_address,
                });
            }
        }
    }
    None
}

pub(super) fn map_rusb_error(error: rusb::Error) -> AndroidAoaBackendError {
    match error {
        rusb::Error::Access => AndroidAoaBackendError::PermissionDenied,
        rusb::Error::NoDevice | rusb::Error::NotFound => AndroidAoaBackendError::NoDevice,
        rusb::Error::Timeout => AndroidAoaBackendError::Timeout,
        rusb::Error::Pipe | rusb::Error::NotSupported => {
            AndroidAoaBackendError::UnsupportedProtocol
        }
        error => AndroidAoaBackendError::Io(error.to_string()),
    }
}
