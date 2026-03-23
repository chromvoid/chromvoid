use super::*;

#[test]
fn usb_device_serializes_correctly() {
    let device = UsbDevice {
        port_path: "/dev/tty.usbserial-1234".to_string(),
        display_name: "Orange Pi".to_string(),
        serial_number: Some("SN123".to_string()),
        vendor_id: 0x1a86,
        product_id: 0x7523,
        is_paired: false,
        device_state: Some(DeviceState::Blank),
    };

    let json = serde_json::to_value(&device).expect("serialize UsbDevice");

    assert_eq!(json["port_path"], "/dev/tty.usbserial-1234");
    assert_eq!(json["display_name"], "Orange Pi");
    assert_eq!(json["serial_number"], "SN123");
    assert_eq!(json["vendor_id"], 0x1a86);
    assert_eq!(json["product_id"], 0x7523);
    assert_eq!(json["is_paired"], false);
    assert_eq!(json["device_state"], "blank");
}

#[test]
fn device_state_serializes_snake_case() {
    let blank = serde_json::to_value(DeviceState::Blank).expect("serialize Blank");
    assert_eq!(blank, "blank");

    let initialized =
        serde_json::to_value(DeviceState::Initialized).expect("serialize Initialized");
    assert_eq!(initialized, "initialized");

    let unknown = serde_json::to_value(DeviceState::Unknown).expect("serialize Unknown");
    assert_eq!(unknown, "unknown");
}

#[test]
fn scan_returns_without_panic() {
    let _devices = scan_usb_devices();
}
