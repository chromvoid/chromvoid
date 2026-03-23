pub mod connection;
pub mod discovery;
pub mod handshake;
pub mod io_task;
pub mod noise_session;
pub mod paired_devices;
pub mod transport;

pub use discovery::{scan_usb_devices, DeviceState, UsbDevice};
