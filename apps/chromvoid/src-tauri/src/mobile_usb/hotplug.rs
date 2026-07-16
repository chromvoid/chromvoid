//! Passive USB hotplug watcher for the desktop remote-connect surface.
//!
//! Emits a debounced `mobile_usb_inventory_changed` tauri event whenever the
//! USB bus population changes, so the webview can refresh the passive
//! `mobile_usb_detect` inventory without polling. Uses libusb hotplug
//! callbacks where the platform supports them (macOS/Linux) and falls back to
//! low-frequency passive polling elsewhere (Windows). Neither path opens
//! devices or sends control transfers.

use std::collections::BTreeSet;
use std::sync::mpsc;
use std::time::Duration;

use tauri::Emitter;

pub const MOBILE_USB_INVENTORY_CHANGED_EVENT: &str = "mobile_usb_inventory_changed";

/// AOA re-enumeration produces a burst of left/arrived events within ~500ms;
/// coalesce a burst into a single webview notification.
const DEBOUNCE_QUIET_WINDOW: Duration = Duration::from_millis(700);
const POLL_INTERVAL: Duration = Duration::from_secs(3);

pub fn spawn_mobile_usb_hotplug_watcher(app: tauri::AppHandle) {
    let (change_tx, change_rx) = mpsc::channel::<()>();

    let emit_thread = std::thread::Builder::new()
        .name("mobile-usb-hotplug-emit".into())
        .spawn(move || debounce_and_emit_loop(app, change_rx));
    if let Err(error) = emit_thread {
        tracing::warn!("mobile_usb hotplug: failed to spawn emit thread: {error}");
        return;
    }

    let watch_thread = std::thread::Builder::new()
        .name("mobile-usb-hotplug-watch".into())
        .spawn(move || {
            if rusb::has_hotplug() {
                watch_with_hotplug(change_tx);
            } else {
                watch_with_polling(change_tx);
            }
        });
    if let Err(error) = watch_thread {
        tracing::warn!("mobile_usb hotplug: failed to spawn watch thread: {error}");
    }
}

fn debounce_and_emit_loop(app: tauri::AppHandle, changes: mpsc::Receiver<()>) {
    while changes.recv().is_ok() {
        while changes.recv_timeout(DEBOUNCE_QUIET_WINDOW).is_ok() {}
        if let Err(error) = app.emit(MOBILE_USB_INVENTORY_CHANGED_EVENT, serde_json::json!({})) {
            tracing::warn!("mobile_usb hotplug: failed to emit inventory event: {error}");
        }
    }
}

struct HotplugForwarder {
    changes: mpsc::Sender<()>,
}

impl rusb::Hotplug<rusb::Context> for HotplugForwarder {
    fn device_arrived(&mut self, _device: rusb::Device<rusb::Context>) {
        let _ = self.changes.send(());
    }

    fn device_left(&mut self, _device: rusb::Device<rusb::Context>) {
        let _ = self.changes.send(());
    }
}

fn watch_with_hotplug(changes: mpsc::Sender<()>) {
    use rusb::UsbContext;

    let context = match rusb::Context::new() {
        Ok(context) => context,
        Err(error) => {
            tracing::warn!("mobile_usb hotplug: USB context unavailable: {error}");
            return;
        }
    };
    let registration = rusb::HotplugBuilder::new()
        .enumerate(false)
        .register(context.clone(), Box::new(HotplugForwarder { changes }));
    let _registration = match registration {
        Ok(registration) => registration,
        Err(error) => {
            tracing::warn!("mobile_usb hotplug: callback registration failed: {error}");
            return;
        }
    };

    tracing::info!("mobile_usb hotplug: watching USB bus via libusb hotplug callbacks");
    loop {
        if let Err(error) = context.handle_events(None) {
            tracing::warn!("mobile_usb hotplug: event loop stopped: {error}");
            return;
        }
    }
}

fn watch_with_polling(changes: mpsc::Sender<()>) {
    tracing::info!("mobile_usb hotplug: platform lacks hotplug callbacks, using passive polling");
    let mut previous: Option<BTreeSet<UsbDeviceFingerprint>> = None;
    loop {
        match passive_inventory_fingerprint() {
            Ok(current) => {
                let changed = previous.as_ref().is_some_and(|prev| *prev != current);
                previous = Some(current);
                if changed && changes.send(()).is_err() {
                    return;
                }
            }
            Err(error) => {
                tracing::debug!("mobile_usb hotplug: passive poll failed: {error}");
            }
        }
        std::thread::sleep(POLL_INTERVAL);
    }
}

type UsbDeviceFingerprint = (u8, u8, u16, u16);

fn passive_inventory_fingerprint() -> Result<BTreeSet<UsbDeviceFingerprint>, rusb::Error> {
    use rusb::UsbContext;

    let context = rusb::Context::new()?;
    let mut fingerprint = BTreeSet::new();
    for device in context.devices()?.iter() {
        let Ok(descriptor) = device.device_descriptor() else {
            continue;
        };
        fingerprint.insert((
            device.bus_number(),
            device.address(),
            descriptor.vendor_id(),
            descriptor.product_id(),
        ));
    }
    Ok(fingerprint)
}
