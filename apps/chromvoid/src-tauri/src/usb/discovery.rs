use serde::{Deserialize, Serialize};

/// Represents a discovered USB device that may be an Orange Pi Core Host.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UsbDevice {
    /// Serial port path (e.g., "/dev/tty.usbserial-...", "COM3")
    pub port_path: String,
    /// Human-readable name or label
    pub display_name: String,
    /// Device serial number if available
    pub serial_number: Option<String>,
    /// Vendor ID (USB)
    pub vendor_id: u16,
    /// Product ID (USB)
    pub product_id: u16,
    /// Whether the device has been previously paired
    pub is_paired: bool,
    /// Device state if identifiable (blank, initialized)
    pub device_state: Option<DeviceState>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DeviceState {
    /// New device, needs initial setup (master key creation)
    Blank,
    /// Initialized device with master key
    Initialized,
    /// State unknown (not yet probed)
    Unknown,
}

/// Scan for USB serial ports that could be Orange Pi devices.
/// Returns all serial ports with USB type.
pub fn scan_usb_devices() -> Vec<UsbDevice> {
    let ports = match serialport::available_ports() {
        Ok(p) => p,
        Err(_) => return Vec::new(),
    };

    ports
        .into_iter()
        .filter_map(|port| {
            if let serialport::SerialPortType::UsbPort(info) = &port.port_type {
                Some(UsbDevice {
                    port_path: port.port_name.clone(),
                    display_name: info
                        .product
                        .clone()
                        .unwrap_or_else(|| port.port_name.clone()),
                    serial_number: info.serial_number.clone(),
                    vendor_id: info.vid,
                    product_id: info.pid,
                    is_paired: false,
                    device_state: None,
                })
            } else {
                None
            }
        })
        .collect()
}

#[cfg(test)]
#[path = "discovery_tests.rs"]
mod tests;
