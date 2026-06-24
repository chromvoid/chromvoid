use std::future::Future;
use std::io;
use std::pin::Pin;
use std::sync::{
    atomic::{AtomicBool, AtomicU64, Ordering},
    Arc, Mutex,
};
use std::task::{Context, Poll};
use std::time::{Duration, Instant};

use async_trait::async_trait;
use tokio::io::{AsyncRead, AsyncWrite, AsyncWriteExt, DuplexStream, ReadBuf};

use super::bridge::{BoxMobileUsbStream, MobileUsbBridge};
use super::record_transport::MAX_USB_REMOTE_RECORD_BYTES;
use super::types::{
    MobileUsbBridgeKind, MobileUsbError, MobileUsbErrorCode, MobileUsbPairRequest,
    MobileUsbPairedHostRecord, MobileUsbPlatform, MobileUsbScanResult, UsbHint,
};

const AOA_GET_PROTOCOL_REQUEST: u8 = 51;
const AOA_SEND_STRING_REQUEST: u8 = 52;
const AOA_START_REQUEST: u8 = 53;
const AOA_GET_PROTOCOL_REQUEST_TYPE: u8 = 0xC0;
const AOA_SEND_REQUEST_TYPE: u8 = 0x40;

const AOA_STRING_MANUFACTURER: u16 = 0;
const AOA_STRING_MODEL: u16 = 1;
const AOA_STRING_DESCRIPTION: u16 = 2;
const AOA_STRING_VERSION: u16 = 3;
const AOA_STRING_URI: u16 = 4;
const AOA_STRING_SERIAL: u16 = 5;

const GOOGLE_ACCESSORY_VENDOR_ID: u16 = 0x18D1;
const GOOGLE_ACCESSORY_PRODUCT_IDS: &[u16] = &[0x2D00, 0x2D01, 0x2D02, 0x2D03, 0x2D04, 0x2D05];

const CHROMVOID_AOA_MANUFACTURER: &str = "ChromVoid";
const CHROMVOID_AOA_MODEL: &str = "ChromVoid Mobile Host";
const CHROMVOID_AOA_DESCRIPTION: &str = "ChromVoid USB Remote";
const CHROMVOID_AOA_VERSION: &str = "1";
const CHROMVOID_AOA_URI: &str = "https://chromvoid.com";
const CHROMVOID_AOA_PROTOCOL_ID: &str = "chromvoid.usb_remote.v1";

const CONTROL_TIMEOUT: Duration = Duration::from_millis(500);
const BULK_READ_TIMEOUT: Duration = Duration::from_millis(50);
const BULK_WRITE_TIMEOUT: Duration = Duration::from_secs(2);
const AOA_REENUMERATION_ATTEMPTS: usize = 5;
const AOA_REENUMERATION_DELAY: Duration = Duration::from_millis(150);
const AOA_WORKER_BUFFER_BYTES: usize = 16 * 1024;
static NEXT_AOA_STREAM_ID: AtomicU64 = AtomicU64::new(1);

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
struct AndroidAoaDeviceId {
    bus_number: u8,
    address: u8,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct AndroidAoaDeviceInfo {
    id: AndroidAoaDeviceId,
    vendor_id: u16,
    product_id: u16,
    manufacturer: Option<String>,
    product: Option<String>,
    serial_number: Option<String>,
    endpoints: Option<AndroidAoaEndpoints>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct AndroidAoaEndpoints {
    interface_number: u8,
    in_address: u8,
    out_address: u8,
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum AndroidAoaBackendError {
    PermissionDenied,
    NoDevice,
    UnsupportedProtocol,
    Timeout,
    Io(String),
}

trait AndroidAoaUsbBackend: Send + Sync + 'static {
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

trait AndroidAoaDeviceHandle: Send + 'static {
    fn read_protocol_version(&mut self) -> Result<u16, AndroidAoaBackendError>;

    fn send_string(&mut self, index: u16, value: &str) -> Result<(), AndroidAoaBackendError>;

    fn start_accessory(&mut self) -> Result<(), AndroidAoaBackendError>;
}

trait AndroidAoaEndpointHandle: Send + 'static {
    fn bulk_read(
        &mut self,
        buf: &mut [u8],
        timeout: Duration,
    ) -> Result<usize, AndroidAoaBackendError>;

    fn bulk_write(
        &mut self,
        data: &[u8],
        timeout: Duration,
    ) -> Result<usize, AndroidAoaBackendError>;

    fn close(&mut self) -> Result<(), AndroidAoaBackendError> {
        Ok(())
    }
}

pub(crate) struct AndroidAoaMobileUsbBridge {
    backend: Arc<dyn AndroidAoaUsbBackend>,
}

impl AndroidAoaMobileUsbBridge {
    pub(crate) fn new() -> Self {
        Self {
            backend: Arc::new(RusbAndroidAoaUsbBackend),
        }
    }

    #[cfg(test)]
    fn new_for_tests(backend: Arc<dyn AndroidAoaUsbBackend>) -> Self {
        Self { backend }
    }
}

#[async_trait]
impl MobileUsbBridge for AndroidAoaMobileUsbBridge {
    async fn scan(&self) -> Result<Vec<MobileUsbScanResult>, MobileUsbError> {
        let backend = self.backend.clone();
        blocking_usb(move || scan_blocking(backend)).await
    }

    async fn open_pair_stream(
        &self,
        request: &MobileUsbPairRequest,
    ) -> Result<BoxMobileUsbStream, MobileUsbError> {
        if request.platform != MobileUsbPlatform::Android
            || request.bridge_kind != MobileUsbBridgeKind::AndroidAoa
        {
            return Err(MobileUsbError::new(
                MobileUsbErrorCode::InvalidState,
                "Android AOA bridge can only pair android/android_aoa targets",
            ));
        }

        let backend = self.backend.clone();
        let hint = request.usb_hint.canonical();
        let endpoint = blocking_usb(move || open_matching_accessory(backend, &hint)).await?;
        Ok(Box::new(AndroidAoaByteStream::new(endpoint)))
    }

    async fn open_connect_stream(
        &self,
        record: &MobileUsbPairedHostRecord,
    ) -> Result<BoxMobileUsbStream, MobileUsbError> {
        if record.platform != MobileUsbPlatform::Android
            || record.bridge_kind != MobileUsbBridgeKind::AndroidAoa
        {
            return Err(MobileUsbError::new(
                MobileUsbErrorCode::InvalidState,
                "Android AOA bridge can only connect android/android_aoa records",
            ));
        }

        let backend = self.backend.clone();
        let hint = record.usb_hint.canonical();
        let endpoint = blocking_usb(move || open_matching_accessory(backend, &hint)).await?;
        Ok(Box::new(AndroidAoaByteStream::new(endpoint)))
    }
}

async fn blocking_usb<T, F>(work: F) -> Result<T, MobileUsbError>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T, MobileUsbError> + Send + 'static,
{
    tokio::task::spawn_blocking(work).await.map_err(|error| {
        MobileUsbError::new(
            MobileUsbErrorCode::BridgeUnavailable,
            format!("Android AOA blocking task failed: {error}"),
        )
    })?
}

fn scan_blocking(
    backend: Arc<dyn AndroidAoaUsbBackend>,
) -> Result<Vec<MobileUsbScanResult>, MobileUsbError> {
    let devices = ensure_accessory_devices(backend)?;
    if devices.is_empty() {
        return Err(MobileUsbError::new(
            MobileUsbErrorCode::NoAccessory,
            "no Android AOA accessory device found",
        ));
    }
    Ok(devices.iter().map(scan_result_from_device).collect())
}

fn open_matching_accessory(
    backend: Arc<dyn AndroidAoaUsbBackend>,
    target_hint: &UsbHint,
) -> Result<Box<dyn AndroidAoaEndpointHandle>, MobileUsbError> {
    let devices = ensure_accessory_devices(backend.clone())?;
    let matches = devices
        .into_iter()
        .filter(|device| scan_result_from_device(device).usb_hint.canonical() == *target_hint)
        .collect::<Vec<_>>();

    match matches.len() {
        0 => Err(MobileUsbError::new(
            MobileUsbErrorCode::NoAccessory,
            "no Android AOA accessory matched the requested USB hint",
        )),
        1 => backend
            .open_accessory(&matches[0])
            .map_err(map_open_backend_error),
        _ => Err(MobileUsbError::new(
            MobileUsbErrorCode::AmbiguousDiscovery,
            "multiple Android AOA accessories matched the requested USB hint",
        )),
    }
}

fn ensure_accessory_devices(
    backend: Arc<dyn AndroidAoaUsbBackend>,
) -> Result<Vec<AndroidAoaDeviceInfo>, MobileUsbError> {
    let mut devices = backend.list_devices().map_err(map_scan_backend_error)?;
    let mut accessories = accessory_devices(&devices);
    tracing::info!(
        device_count = devices.len(),
        accessory_count = accessories.len(),
        devices = %device_list_debug_label(&devices),
        "mobile_usb android_aoa scan initial USB inventory"
    );
    if !accessories.is_empty() {
        return Ok(accessories);
    }

    let mut first_error = None;
    let mut started_accessory_mode = false;
    let mut probe_count = 0usize;
    for device in devices.iter().filter(|device| !is_accessory_mode(device)) {
        probe_count += 1;
        match backend
            .open_device(&device.id)
            .and_then(|mut handle| negotiate_accessory_mode(handle.as_mut()))
        {
            Ok(()) => {
                started_accessory_mode = true;
                tracing::info!(
                    device = %device_debug_label(device),
                    "mobile_usb android_aoa probe started accessory mode"
                );
            }
            Err(
                error @ (AndroidAoaBackendError::UnsupportedProtocol
                | AndroidAoaBackendError::NoDevice),
            ) => {
                tracing::info!(
                    device = %device_debug_label(device),
                    error = ?error,
                    "mobile_usb android_aoa probe skipped incompatible USB device"
                );
            }
            Err(error) => {
                tracing::warn!(
                    device = %device_debug_label(device),
                    error = ?error,
                    "mobile_usb android_aoa probe failed"
                );
                if first_error.is_none() {
                    first_error = Some(error);
                }
            }
        }
    }
    if probe_count == 0 {
        tracing::info!("mobile_usb android_aoa scan found no non-accessory USB devices to probe");
    }

    if started_accessory_mode {
        for attempt in 1..=AOA_REENUMERATION_ATTEMPTS {
            std::thread::sleep(AOA_REENUMERATION_DELAY);
            devices = backend.list_devices().map_err(map_scan_backend_error)?;
            accessories = accessory_devices(&devices);
            tracing::info!(
                attempt,
                device_count = devices.len(),
                accessory_count = accessories.len(),
                devices = %device_list_debug_label(&devices),
                "mobile_usb android_aoa scan reenumeration poll"
            );
            if !accessories.is_empty() {
                return Ok(accessories);
            }
        }
    }

    if let Some(error) = first_error {
        return Err(map_scan_backend_error(error));
    }

    Ok(Vec::new())
}

fn device_list_debug_label(devices: &[AndroidAoaDeviceInfo]) -> String {
    if devices.is_empty() {
        return "none".to_string();
    }

    let mut labels = devices
        .iter()
        .take(12)
        .map(device_debug_label)
        .collect::<Vec<_>>();
    if devices.len() > labels.len() {
        labels.push(format!("+{} more", devices.len() - labels.len()));
    }
    labels.join(", ")
}

fn device_debug_label(device: &AndroidAoaDeviceInfo) -> String {
    format!(
        "bus={} address={} vid=0x{:04x} pid=0x{:04x} accessory={} bulk_endpoints={}",
        device.id.bus_number,
        device.id.address,
        device.vendor_id,
        device.product_id,
        is_accessory_mode(device),
        device.endpoints.is_some()
    )
}

fn accessory_devices(devices: &[AndroidAoaDeviceInfo]) -> Vec<AndroidAoaDeviceInfo> {
    devices
        .iter()
        .filter(|device| is_accessory_mode(device))
        .cloned()
        .collect()
}

fn is_accessory_mode(device: &AndroidAoaDeviceInfo) -> bool {
    device.vendor_id == GOOGLE_ACCESSORY_VENDOR_ID
        && GOOGLE_ACCESSORY_PRODUCT_IDS.contains(&device.product_id)
}

fn negotiate_accessory_mode(
    handle: &mut dyn AndroidAoaDeviceHandle,
) -> Result<(), AndroidAoaBackendError> {
    let version = handle.read_protocol_version()?;
    if version == 0 {
        return Err(AndroidAoaBackendError::UnsupportedProtocol);
    }

    for (index, value) in chromvoid_accessory_strings() {
        handle.send_string(index, value)?;
    }
    handle.start_accessory()
}

fn chromvoid_accessory_strings() -> [(u16, &'static str); 6] {
    [
        (AOA_STRING_MANUFACTURER, CHROMVOID_AOA_MANUFACTURER),
        (AOA_STRING_MODEL, CHROMVOID_AOA_MODEL),
        (AOA_STRING_DESCRIPTION, CHROMVOID_AOA_DESCRIPTION),
        (AOA_STRING_VERSION, CHROMVOID_AOA_VERSION),
        (AOA_STRING_URI, CHROMVOID_AOA_URI),
        (AOA_STRING_SERIAL, CHROMVOID_AOA_PROTOCOL_ID),
    ]
}

fn scan_result_from_device(device: &AndroidAoaDeviceInfo) -> MobileUsbScanResult {
    let manufacturer = clean_hint_part(device.manufacturer.as_deref());
    let model = clean_hint_part(device.product.as_deref());
    let serial_number = clean_hint_part(device.serial_number.as_deref())
        .filter(|value| value != CHROMVOID_AOA_PROTOCOL_ID);
    let label = label_for_device(manufacturer.as_deref(), model.as_deref());

    MobileUsbScanResult {
        platform: MobileUsbPlatform::Android,
        bridge_kind: MobileUsbBridgeKind::AndroidAoa,
        usb_hint: UsbHint {
            manufacturer,
            model,
            serial_number,
            protocol_id: Some(CHROMVOID_AOA_PROTOCOL_ID.to_string()),
        },
        label: Some(label),
    }
}

fn clean_hint_part(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
}

fn label_for_device(manufacturer: Option<&str>, model: Option<&str>) -> String {
    match (manufacturer, model) {
        (_, Some(model)) => model.to_string(),
        (Some(manufacturer), None) => manufacturer.to_string(),
        (None, None) => "Android USB device".to_string(),
    }
}

fn map_scan_backend_error(error: AndroidAoaBackendError) -> MobileUsbError {
    match error {
        AndroidAoaBackendError::PermissionDenied => MobileUsbError::new(
            MobileUsbErrorCode::PermissionDenied,
            "permission denied while accessing Android USB device",
        ),
        AndroidAoaBackendError::NoDevice | AndroidAoaBackendError::UnsupportedProtocol => {
            MobileUsbError::new(
                MobileUsbErrorCode::NoAccessory,
                "no compatible Android AOA accessory device found",
            )
        }
        AndroidAoaBackendError::Timeout => MobileUsbError::new(
            MobileUsbErrorCode::NoAccessory,
            "timed out while discovering Android AOA accessory",
        ),
        AndroidAoaBackendError::Io(message) => MobileUsbError::new(
            MobileUsbErrorCode::BridgeUnavailable,
            format!("Android AOA bridge failed: {message}"),
        ),
    }
}

fn map_open_backend_error(error: AndroidAoaBackendError) -> MobileUsbError {
    match error {
        AndroidAoaBackendError::PermissionDenied => MobileUsbError::new(
            MobileUsbErrorCode::PermissionDenied,
            "permission denied while opening Android AOA accessory",
        ),
        AndroidAoaBackendError::NoDevice => MobileUsbError::new(
            MobileUsbErrorCode::CableDisconnected,
            "Android AOA accessory disconnected while opening",
        ),
        AndroidAoaBackendError::UnsupportedProtocol => MobileUsbError::new(
            MobileUsbErrorCode::NoAccessory,
            "Android AOA accessory is not available",
        ),
        AndroidAoaBackendError::Timeout => MobileUsbError::new(
            MobileUsbErrorCode::NoAccessory,
            "timed out while opening Android AOA accessory",
        ),
        AndroidAoaBackendError::Io(message) => MobileUsbError::new(
            MobileUsbErrorCode::BridgeUnavailable,
            format!("Android AOA bridge failed: {message}"),
        ),
    }
}

struct AndroidAoaByteStream {
    stream_id: u64,
    inner: DuplexStream,
    endpoint: Arc<Mutex<Box<dyn AndroidAoaEndpointHandle>>>,
    closed: Arc<AtomicBool>,
    pending_write: Option<tokio::task::JoinHandle<io::Result<usize>>>,
    pending_shutdown: Option<tokio::task::JoinHandle<io::Result<()>>>,
    shutdown_complete: bool,
}

impl AndroidAoaByteStream {
    fn new(endpoint: Box<dyn AndroidAoaEndpointHandle>) -> Self {
        let stream_id = NEXT_AOA_STREAM_ID.fetch_add(1, Ordering::Relaxed);
        let buffer_size = (MAX_USB_REMOTE_RECORD_BYTES * 2).max(AOA_WORKER_BUFFER_BYTES);
        let (app_stream, worker_stream) = tokio::io::duplex(buffer_size);
        let (_worker_read, worker_write) = tokio::io::split(worker_stream);
        let endpoint = Arc::new(Mutex::new(endpoint));
        let closed = Arc::new(AtomicBool::new(false));

        tracing::info!(
            stream_id,
            buffer_size,
            "mobile_usb android_aoa stream created"
        );
        spawn_read_worker(stream_id, endpoint.clone(), closed.clone(), worker_write);

        Self {
            stream_id,
            inner: app_stream,
            endpoint,
            closed,
            pending_write: None,
            pending_shutdown: None,
            shutdown_complete: false,
        }
    }

    fn poll_pending_write(&mut self, cx: &mut Context<'_>) -> Poll<io::Result<usize>> {
        let Some(handle) = self.pending_write.as_mut() else {
            return Poll::Ready(Ok(0));
        };

        match Pin::new(handle).poll(cx) {
            Poll::Pending => Poll::Pending,
            Poll::Ready(result) => {
                self.pending_write = None;
                match result {
                    Ok(Ok(len)) => {
                        tracing::info!(
                            stream_id = self.stream_id,
                            len,
                            "mobile_usb android_aoa write worker done"
                        );
                        Poll::Ready(Ok(len))
                    }
                    Ok(Err(error)) => {
                        self.closed.store(true, Ordering::SeqCst);
                        tracing::warn!(
                            stream_id = self.stream_id,
                            error = %error,
                            "mobile_usb android_aoa write worker error"
                        );
                        Poll::Ready(Err(error))
                    }
                    Err(error) => {
                        self.closed.store(true, Ordering::SeqCst);
                        tracing::warn!(
                            stream_id = self.stream_id,
                            error = %error,
                            "mobile_usb android_aoa write worker join error"
                        );
                        Poll::Ready(Err(io::Error::other(format!(
                            "Android AOA write worker failed: {error}"
                        ))))
                    }
                }
            }
        }
    }

    fn poll_pending_shutdown(&mut self, cx: &mut Context<'_>) -> Poll<io::Result<()>> {
        let Some(handle) = self.pending_shutdown.as_mut() else {
            return Poll::Ready(Ok(()));
        };

        match Pin::new(handle).poll(cx) {
            Poll::Pending => Poll::Pending,
            Poll::Ready(result) => {
                self.pending_shutdown = None;
                match result {
                    Ok(result) => Poll::Ready(result),
                    Err(error) => Poll::Ready(Err(io::Error::other(format!(
                        "Android AOA shutdown worker failed: {error}"
                    )))),
                }
            }
        }
    }
}

impl AsyncRead for AndroidAoaByteStream {
    fn poll_read(
        mut self: Pin<&mut Self>,
        cx: &mut Context<'_>,
        buf: &mut ReadBuf<'_>,
    ) -> Poll<io::Result<()>> {
        std::pin::Pin::new(&mut self.inner).poll_read(cx, buf)
    }
}

impl AsyncWrite for AndroidAoaByteStream {
    fn poll_write(
        mut self: Pin<&mut Self>,
        cx: &mut Context<'_>,
        data: &[u8],
    ) -> Poll<io::Result<usize>> {
        if self.closed.load(Ordering::SeqCst) {
            return Poll::Ready(Err(io::Error::new(
                io::ErrorKind::BrokenPipe,
                "Android AOA endpoint is closed",
            )));
        }
        if self.pending_write.is_some() {
            return self.poll_pending_write(cx);
        }
        if data.is_empty() {
            return Poll::Ready(Ok(0));
        }

        let endpoint = self.endpoint.clone();
        let bytes = data.to_vec();
        let stream_id = self.stream_id;
        tracing::info!(
            stream_id,
            len = bytes.len(),
            "mobile_usb android_aoa write worker posted"
        );
        self.pending_write = Some(tokio::task::spawn_blocking(move || {
            let len = bytes.len();
            write_all_endpoint(stream_id, endpoint, &bytes)
                .map(|()| len)
                .map_err(endpoint_error_to_io)
        }));
        self.poll_pending_write(cx)
    }

    fn poll_flush(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<io::Result<()>> {
        match self.poll_pending_write(cx) {
            Poll::Pending => Poll::Pending,
            Poll::Ready(Ok(_)) => Poll::Ready(Ok(())),
            Poll::Ready(Err(error)) => Poll::Ready(Err(error)),
        }
    }

    fn poll_shutdown(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<io::Result<()>> {
        if self.shutdown_complete {
            return Poll::Ready(Ok(()));
        }

        match self.poll_pending_write(cx) {
            Poll::Pending => return Poll::Pending,
            Poll::Ready(Ok(_)) => {}
            Poll::Ready(Err(error)) => return Poll::Ready(Err(error)),
        }

        self.closed.store(true, Ordering::SeqCst);
        if self.pending_shutdown.is_none() {
            let endpoint = self.endpoint.clone();
            self.pending_shutdown = Some(tokio::task::spawn_blocking(move || {
                close_endpoint(endpoint).map_err(endpoint_error_to_io)
            }));
        }
        match self.poll_pending_shutdown(cx) {
            Poll::Pending => Poll::Pending,
            Poll::Ready(Ok(())) => {
                self.shutdown_complete = true;
                Poll::Ready(Ok(()))
            }
            Poll::Ready(Err(error)) => Poll::Ready(Err(error)),
        }
    }
}

impl Drop for AndroidAoaByteStream {
    fn drop(&mut self) {
        tracing::info!(
            stream_id = self.stream_id,
            shutdown_complete = self.shutdown_complete,
            "mobile_usb android_aoa stream drop"
        );
        self.closed.store(true, Ordering::SeqCst);
        if self.shutdown_complete {
            return;
        }
        if let Ok(mut endpoint) = self.endpoint.try_lock() {
            let _ = endpoint.close();
        }
    }
}

fn spawn_read_worker(
    stream_id: u64,
    endpoint: Arc<Mutex<Box<dyn AndroidAoaEndpointHandle>>>,
    closed: Arc<AtomicBool>,
    mut writer: tokio::io::WriteHalf<DuplexStream>,
) {
    tokio::spawn(async move {
        tracing::info!(stream_id, "mobile_usb android_aoa read worker started");
        loop {
            if closed.load(Ordering::SeqCst) {
                tracing::info!(
                    stream_id,
                    reason = "closed_flag",
                    "mobile_usb android_aoa read worker stopping"
                );
                let _ = writer.shutdown().await;
                break;
            }

            let endpoint = endpoint.clone();
            let result = tokio::task::spawn_blocking(move || {
                let mut buf = vec![0_u8; AOA_WORKER_BUFFER_BYTES];
                let len = {
                    let mut endpoint = endpoint.lock().map_err(|_| {
                        AndroidAoaBackendError::Io(
                            "Android AOA endpoint mutex poisoned".to_string(),
                        )
                    })?;
                    endpoint.bulk_read(&mut buf, BULK_READ_TIMEOUT)?
                };
                buf.truncate(len);
                Ok::<_, AndroidAoaBackendError>(buf)
            })
            .await;

            match result {
                Ok(Ok(bytes)) if bytes.is_empty() => {}
                Ok(Ok(bytes)) => {
                    tracing::info!(
                        stream_id,
                        len = bytes.len(),
                        "mobile_usb android_aoa read worker received bytes"
                    );
                    if writer.write_all(&bytes).await.is_err() {
                        closed.store(true, Ordering::SeqCst);
                        tracing::warn!(
                            stream_id,
                            "mobile_usb android_aoa read worker failed to forward bytes"
                        );
                        break;
                    }
                }
                Ok(Err(AndroidAoaBackendError::Timeout)) => {}
                Ok(Err(AndroidAoaBackendError::NoDevice)) => {
                    closed.store(true, Ordering::SeqCst);
                    tracing::info!(
                        stream_id,
                        "mobile_usb android_aoa read worker device disconnected"
                    );
                    let _ = writer.shutdown().await;
                    break;
                }
                Ok(Err(error)) => {
                    closed.store(true, Ordering::SeqCst);
                    tracing::warn!(
                        stream_id,
                        error = ?error,
                        "mobile_usb android_aoa read worker endpoint error"
                    );
                    let _ = writer.shutdown().await;
                    break;
                }
                Err(error) => {
                    closed.store(true, Ordering::SeqCst);
                    tracing::warn!(
                        stream_id,
                        error = %error,
                        "mobile_usb android_aoa read worker join error"
                    );
                    let _ = writer.shutdown().await;
                    break;
                }
            }
        }
        tracing::info!(stream_id, "mobile_usb android_aoa read worker ended");
    });
}

fn write_all_endpoint(
    stream_id: u64,
    endpoint: Arc<Mutex<Box<dyn AndroidAoaEndpointHandle>>>,
    mut data: &[u8],
) -> Result<(), AndroidAoaBackendError> {
    let total_len = data.len();
    let mut offset = 0usize;
    let mut chunk_index = 0usize;
    while !data.is_empty() {
        chunk_index += 1;
        let started_at = Instant::now();
        tracing::info!(
            stream_id,
            chunk_index,
            offset,
            remaining_len = data.len(),
            total_len,
            timeout_ms = BULK_WRITE_TIMEOUT.as_millis() as u64,
            "mobile_usb android_aoa bulk_write start"
        );
        let written = {
            let mut endpoint = endpoint.lock().map_err(|_| {
                AndroidAoaBackendError::Io("Android AOA endpoint mutex poisoned".to_string())
            })?;
            match endpoint.bulk_write(data, BULK_WRITE_TIMEOUT) {
                Ok(written) => {
                    tracing::info!(
                        stream_id,
                        chunk_index,
                        offset,
                        written,
                        duration_ms = started_at.elapsed().as_millis() as u64,
                        "mobile_usb android_aoa bulk_write done"
                    );
                    written
                }
                Err(error) => {
                    tracing::warn!(
                        stream_id,
                        chunk_index,
                        offset,
                        remaining_len = data.len(),
                        duration_ms = started_at.elapsed().as_millis() as u64,
                        error = ?error,
                        "mobile_usb android_aoa bulk_write failed"
                    );
                    return Err(error);
                }
            }
        };
        if written == 0 {
            return Err(AndroidAoaBackendError::Io(
                "Android AOA endpoint wrote zero bytes".to_string(),
            ));
        }
        offset += written;
        data = &data[written..];
    }
    Ok(())
}

fn close_endpoint(
    endpoint: Arc<Mutex<Box<dyn AndroidAoaEndpointHandle>>>,
) -> Result<(), AndroidAoaBackendError> {
    endpoint
        .lock()
        .map_err(|_| AndroidAoaBackendError::Io("Android AOA endpoint mutex poisoned".to_string()))?
        .close()
}

fn endpoint_error_to_io(error: AndroidAoaBackendError) -> io::Error {
    let kind = match error {
        AndroidAoaBackendError::PermissionDenied => io::ErrorKind::PermissionDenied,
        AndroidAoaBackendError::NoDevice => io::ErrorKind::BrokenPipe,
        AndroidAoaBackendError::UnsupportedProtocol => io::ErrorKind::Unsupported,
        AndroidAoaBackendError::Timeout => io::ErrorKind::TimedOut,
        AndroidAoaBackendError::Io(_) => io::ErrorKind::Other,
    };
    io::Error::new(kind, format!("Android AOA endpoint failed: {error:?}"))
}

struct RusbAndroidAoaUsbBackend;

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
        &mut self,
        buf: &mut [u8],
        timeout: Duration,
    ) -> Result<usize, AndroidAoaBackendError> {
        self.handle
            .read_bulk(self.endpoints.in_address, buf, timeout)
            .map_err(map_rusb_error)
    }

    fn bulk_write(
        &mut self,
        data: &[u8],
        timeout: Duration,
    ) -> Result<usize, AndroidAoaBackendError> {
        self.handle
            .write_bulk(self.endpoints.out_address, data, timeout)
            .map_err(map_rusb_error)
    }

    fn close(&mut self) -> Result<(), AndroidAoaBackendError> {
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

fn map_rusb_error(error: rusb::Error) -> AndroidAoaBackendError {
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

#[cfg(test)]
mod tests {
    use std::collections::{HashMap, VecDeque};
    use std::sync::atomic::{AtomicUsize, Ordering};

    use super::super::record_transport::MobileUsbRemoteTransport;
    use chromvoid_protocol::{RemoteTransport, TransportError};
    use tokio::io::{AsyncReadExt, AsyncWriteExt};

    use super::*;

    #[test]
    fn android_aoa_protocol_sends_descriptor_sequence() {
        let log = Arc::new(Mutex::new(Vec::new()));
        let mut handle = FakeDeviceHandle {
            protocol_version: 2,
            log: log.clone(),
        };

        negotiate_accessory_mode(&mut handle).expect("negotiate accessory mode");

        let log = log.lock().expect("log");
        assert_eq!(log[0], FakeControl::GetProtocol);
        assert_eq!(
            &log[1..7],
            &[
                FakeControl::SendString(AOA_STRING_MANUFACTURER, CHROMVOID_AOA_MANUFACTURER),
                FakeControl::SendString(AOA_STRING_MODEL, CHROMVOID_AOA_MODEL),
                FakeControl::SendString(AOA_STRING_DESCRIPTION, CHROMVOID_AOA_DESCRIPTION),
                FakeControl::SendString(AOA_STRING_VERSION, CHROMVOID_AOA_VERSION),
                FakeControl::SendString(AOA_STRING_URI, CHROMVOID_AOA_URI),
                FakeControl::SendString(AOA_STRING_SERIAL, CHROMVOID_AOA_PROTOCOL_ID),
            ]
        );
        assert_eq!(log[7], FakeControl::Start);
    }

    #[test]
    fn android_aoa_protocol_rejects_zero_version() {
        let log = Arc::new(Mutex::new(Vec::new()));
        let mut handle = FakeDeviceHandle {
            protocol_version: 0,
            log,
        };

        let error = negotiate_accessory_mode(&mut handle).expect_err("zero version fails");

        assert_eq!(error, AndroidAoaBackendError::UnsupportedProtocol);
    }

    #[tokio::test]
    async fn android_aoa_scan_negotiates_and_maps_reenumerated_accessory() {
        let backend = Arc::new(FakeBackend::new(vec![
            vec![plain_android_device()],
            vec![accessory_device("serial-1")],
        ]));
        let bridge = AndroidAoaMobileUsbBridge::new_for_tests(backend.clone());

        let scans = bridge.scan().await.expect("scan");

        assert_eq!(backend.control_count(), 8);
        assert_eq!(scans.len(), 1);
        assert_eq!(scans[0].platform, MobileUsbPlatform::Android);
        assert_eq!(scans[0].bridge_kind, MobileUsbBridgeKind::AndroidAoa);
        assert_eq!(scans[0].usb_hint.serial_number.as_deref(), Some("serial-1"));
        assert_eq!(
            scans[0].usb_hint.protocol_id.as_deref(),
            Some(CHROMVOID_AOA_PROTOCOL_ID)
        );
    }

    #[tokio::test]
    async fn android_aoa_scan_maps_no_devices_and_permission_denied() {
        let bridge =
            AndroidAoaMobileUsbBridge::new_for_tests(Arc::new(FakeBackend::new(vec![Vec::new()])));
        let error = bridge.scan().await.expect_err("no accessory");
        assert_eq!(error.code, MobileUsbErrorCode::NoAccessory);

        let backend = Arc::new(FakeBackend::new(vec![vec![plain_android_device()]]));
        backend.set_open_error(AndroidAoaBackendError::PermissionDenied);
        let bridge = AndroidAoaMobileUsbBridge::new_for_tests(backend);
        let error = bridge.scan().await.expect_err("permission denied");
        assert_eq!(error.code, MobileUsbErrorCode::PermissionDenied);
    }

    #[tokio::test]
    async fn android_aoa_scan_maps_unsupported_probe_to_no_accessory() {
        let backend = Arc::new(FakeBackend::new(vec![vec![plain_android_device()]]));
        backend.set_open_error(AndroidAoaBackendError::UnsupportedProtocol);
        let bridge = AndroidAoaMobileUsbBridge::new_for_tests(backend);

        let error = bridge
            .scan()
            .await
            .expect_err("unsupported accessory probe");

        assert_eq!(error.code, MobileUsbErrorCode::NoAccessory);
    }

    #[tokio::test]
    async fn android_aoa_open_stream_rejects_ambiguous_matches() {
        let backend = Arc::new(FakeBackend::new(vec![vec![
            accessory_device("serial-1"),
            accessory_device("serial-1"),
        ]]));
        let bridge = AndroidAoaMobileUsbBridge::new_for_tests(backend);
        let request = MobileUsbPairRequest {
            platform: MobileUsbPlatform::Android,
            bridge_kind: MobileUsbBridgeKind::AndroidAoa,
            usb_hint: scan_result_from_device(&accessory_device("serial-1")).usb_hint,
            label: None,
        };

        let error = match bridge.open_pair_stream(&request).await {
            Ok(_) => panic!("ambiguous match should fail"),
            Err(error) => error,
        };

        assert_eq!(error.code, MobileUsbErrorCode::AmbiguousDiscovery);
    }

    #[test]
    fn android_aoa_backend_error_mapping_maps_canonical_codes() {
        assert_eq!(
            map_scan_backend_error(AndroidAoaBackendError::PermissionDenied).code,
            MobileUsbErrorCode::PermissionDenied
        );
        assert_eq!(
            map_scan_backend_error(AndroidAoaBackendError::UnsupportedProtocol).code,
            MobileUsbErrorCode::NoAccessory
        );
        assert_eq!(
            map_open_backend_error(AndroidAoaBackendError::NoDevice).code,
            MobileUsbErrorCode::CableDisconnected
        );
        assert_eq!(
            map_open_backend_error(AndroidAoaBackendError::Io("boom".to_string())).code,
            MobileUsbErrorCode::BridgeUnavailable
        );
        assert_eq!(
            map_rusb_error(rusb::Error::Pipe),
            AndroidAoaBackendError::UnsupportedProtocol
        );
        assert_eq!(
            map_rusb_error(rusb::Error::NotSupported),
            AndroidAoaBackendError::UnsupportedProtocol
        );
    }

    #[test]
    fn android_aoa_scan_mapping_never_uses_protocol_marker_as_serial_number() {
        let mut device = accessory_device(CHROMVOID_AOA_PROTOCOL_ID);
        device.serial_number = Some(CHROMVOID_AOA_PROTOCOL_ID.to_string());

        let scan = scan_result_from_device(&device);

        assert_eq!(scan.usb_hint.serial_number, None);
        assert_eq!(
            scan.usb_hint.protocol_id.as_deref(),
            Some(CHROMVOID_AOA_PROTOCOL_ID)
        );
    }

    #[tokio::test]
    async fn android_aoa_bridge_opens_matching_accessory_stream() {
        let backend = Arc::new(FakeBackend::new(vec![vec![accessory_device("serial-1")]]));
        let bridge = AndroidAoaMobileUsbBridge::new_for_tests(backend);
        let request = MobileUsbPairRequest {
            platform: MobileUsbPlatform::Android,
            bridge_kind: MobileUsbBridgeKind::AndroidAoa,
            usb_hint: scan_result_from_device(&accessory_device("serial-1")).usb_hint,
            label: None,
        };

        let stream = bridge.open_pair_stream(&request).await;

        assert!(stream.is_ok());
    }

    #[tokio::test]
    async fn android_aoa_stream_carries_opaque_records() {
        let endpoint = SharedFakeEndpoint::default();
        endpoint.push_read_chunk([0_u8, 0, 0, 5]);
        endpoint.push_read_chunk(*b"hello");
        let stream = AndroidAoaByteStream::new(Box::new(endpoint.clone()));
        let mut transport = MobileUsbRemoteTransport::new(stream, MobileUsbBridgeKind::AndroidAoa);

        let received = transport.recv().await.expect("recv record");
        assert_eq!(received, b"hello");

        transport.send(b"bye").await.expect("send record");
        tokio::time::sleep(Duration::from_millis(25)).await;
        let written = endpoint.written_bytes();
        assert!(written.windows(3).any(|window| window == b"bye"));
    }

    #[tokio::test]
    async fn android_aoa_stream_uses_longer_timeout_for_bulk_writes() {
        let endpoint = SharedFakeEndpoint::default();
        let stream = AndroidAoaByteStream::new(Box::new(endpoint.clone()));
        let mut transport = MobileUsbRemoteTransport::new(stream, MobileUsbBridgeKind::AndroidAoa);

        transport.send(b"hello").await.expect("send record");
        tokio::time::sleep(Duration::from_millis(25)).await;

        let write_timeouts = endpoint.write_timeouts();
        assert!(!write_timeouts.is_empty());
        assert!(write_timeouts
            .into_iter()
            .all(|timeout| timeout == BULK_WRITE_TIMEOUT));
        assert!(BULK_WRITE_TIMEOUT > BULK_READ_TIMEOUT);
    }

    #[tokio::test]
    async fn android_aoa_stream_write_failure_reaches_record_transport() {
        let endpoint = SharedFakeEndpoint::default();
        endpoint.push_write_error(AndroidAoaBackendError::NoDevice);
        let stream = AndroidAoaByteStream::new(Box::new(endpoint));
        let mut transport = MobileUsbRemoteTransport::new(stream, MobileUsbBridgeKind::AndroidAoa);

        let error = transport.send(b"fails").await.expect_err("write failure");

        assert!(matches!(
            error,
            TransportError::Closed | TransportError::Io(_)
        ));
    }

    #[tokio::test]
    async fn android_aoa_stream_detach_closes_read_side() {
        let endpoint = SharedFakeEndpoint::default();
        endpoint.push_error(AndroidAoaBackendError::NoDevice);
        let mut stream = AndroidAoaByteStream::new(Box::new(endpoint));
        let mut byte = [0_u8; 1];

        let read = stream
            .read(&mut byte)
            .await
            .expect("closed read returns EOF");

        assert_eq!(read, 0);
    }

    #[tokio::test]
    async fn android_aoa_stream_detach_closes_record_transport_write_side() {
        let endpoint = SharedFakeEndpoint::default();
        endpoint.push_error(AndroidAoaBackendError::NoDevice);
        let stream = AndroidAoaByteStream::new(Box::new(endpoint));
        let mut transport = MobileUsbRemoteTransport::new(stream, MobileUsbBridgeKind::AndroidAoa);

        let recv_error = transport.recv().await.expect_err("detach closes recv");
        let send_error = transport
            .send(b"after-detach")
            .await
            .expect_err("send closed");

        assert!(matches!(recv_error, TransportError::Closed));
        assert!(matches!(
            send_error,
            TransportError::Closed | TransportError::Io(_)
        ));
    }

    #[tokio::test]
    async fn android_aoa_stream_shutdown_closes_endpoint() {
        let endpoint = SharedFakeEndpoint::default();
        let mut stream = AndroidAoaByteStream::new(Box::new(endpoint.clone()));

        stream.shutdown().await.expect("shutdown stream");
        stream.shutdown().await.expect("shutdown is idempotent");

        assert!(endpoint.is_closed());
    }

    #[derive(Debug, Clone, PartialEq, Eq)]
    enum FakeControl {
        GetProtocol,
        SendString(u16, &'static str),
        Start,
    }

    struct FakeDeviceHandle {
        protocol_version: u16,
        log: Arc<Mutex<Vec<FakeControl>>>,
    }

    impl AndroidAoaDeviceHandle for FakeDeviceHandle {
        fn read_protocol_version(&mut self) -> Result<u16, AndroidAoaBackendError> {
            self.log.lock().expect("log").push(FakeControl::GetProtocol);
            Ok(self.protocol_version)
        }

        fn send_string(&mut self, index: u16, value: &str) -> Result<(), AndroidAoaBackendError> {
            let value = match value {
                CHROMVOID_AOA_MANUFACTURER => CHROMVOID_AOA_MANUFACTURER,
                CHROMVOID_AOA_MODEL => CHROMVOID_AOA_MODEL,
                CHROMVOID_AOA_DESCRIPTION => CHROMVOID_AOA_DESCRIPTION,
                CHROMVOID_AOA_VERSION => CHROMVOID_AOA_VERSION,
                CHROMVOID_AOA_URI => CHROMVOID_AOA_URI,
                CHROMVOID_AOA_PROTOCOL_ID => CHROMVOID_AOA_PROTOCOL_ID,
                _ => return Err(AndroidAoaBackendError::Io("unexpected string".to_string())),
            };
            self.log
                .lock()
                .expect("log")
                .push(FakeControl::SendString(index, value));
            Ok(())
        }

        fn start_accessory(&mut self) -> Result<(), AndroidAoaBackendError> {
            self.log.lock().expect("log").push(FakeControl::Start);
            Ok(())
        }
    }

    #[derive(Default)]
    struct FakeBackend {
        device_lists: Mutex<VecDeque<Vec<AndroidAoaDeviceInfo>>>,
        open_error: Mutex<Option<AndroidAoaBackendError>>,
        control_log: Arc<Mutex<Vec<FakeControl>>>,
        endpoint_by_serial: Mutex<HashMap<String, SharedFakeEndpoint>>,
        list_calls: AtomicUsize,
    }

    impl FakeBackend {
        fn new(device_lists: Vec<Vec<AndroidAoaDeviceInfo>>) -> Self {
            Self {
                device_lists: Mutex::new(device_lists.into()),
                open_error: Mutex::new(None),
                control_log: Arc::new(Mutex::new(Vec::new())),
                endpoint_by_serial: Mutex::new(HashMap::new()),
                list_calls: AtomicUsize::new(0),
            }
        }

        fn set_open_error(&self, error: AndroidAoaBackendError) {
            *self.open_error.lock().expect("open error") = Some(error);
        }

        fn control_count(&self) -> usize {
            self.control_log.lock().expect("control log").len()
        }
    }

    impl AndroidAoaUsbBackend for FakeBackend {
        fn list_devices(&self) -> Result<Vec<AndroidAoaDeviceInfo>, AndroidAoaBackendError> {
            self.list_calls.fetch_add(1, Ordering::SeqCst);
            let mut lists = self.device_lists.lock().expect("device lists");
            if lists.len() > 1 {
                return Ok(lists.pop_front().expect("device list"));
            }
            Ok(lists.front().cloned().unwrap_or_default())
        }

        fn open_device(
            &self,
            _id: &AndroidAoaDeviceId,
        ) -> Result<Box<dyn AndroidAoaDeviceHandle>, AndroidAoaBackendError> {
            if let Some(error) = self.open_error.lock().expect("open error").clone() {
                return Err(error);
            }
            Ok(Box::new(FakeDeviceHandle {
                protocol_version: 2,
                log: self.control_log.clone(),
            }))
        }

        fn open_accessory(
            &self,
            device: &AndroidAoaDeviceInfo,
        ) -> Result<Box<dyn AndroidAoaEndpointHandle>, AndroidAoaBackendError> {
            let serial = device
                .serial_number
                .clone()
                .unwrap_or_else(|| "missing".to_string());
            let endpoint = self
                .endpoint_by_serial
                .lock()
                .expect("endpoints")
                .entry(serial)
                .or_default()
                .clone();
            Ok(Box::new(endpoint))
        }
    }

    #[derive(Clone, Default)]
    struct SharedFakeEndpoint {
        inner: Arc<Mutex<FakeEndpointState>>,
    }

    #[derive(Default)]
    struct FakeEndpointState {
        reads: VecDeque<Result<Vec<u8>, AndroidAoaBackendError>>,
        write_errors: VecDeque<AndroidAoaBackendError>,
        writes: Vec<Vec<u8>>,
        write_timeouts: Vec<Duration>,
        closed: bool,
    }

    impl SharedFakeEndpoint {
        fn push_read_chunk<const N: usize>(&self, bytes: [u8; N]) {
            self.inner
                .lock()
                .expect("endpoint")
                .reads
                .push_back(Ok(bytes.to_vec()));
        }

        fn push_error(&self, error: AndroidAoaBackendError) {
            self.inner
                .lock()
                .expect("endpoint")
                .reads
                .push_back(Err(error));
        }

        fn push_write_error(&self, error: AndroidAoaBackendError) {
            self.inner
                .lock()
                .expect("endpoint")
                .write_errors
                .push_back(error);
        }

        fn written_bytes(&self) -> Vec<u8> {
            self.inner
                .lock()
                .expect("endpoint")
                .writes
                .iter()
                .flatten()
                .copied()
                .collect()
        }

        fn write_timeouts(&self) -> Vec<Duration> {
            self.inner.lock().expect("endpoint").write_timeouts.clone()
        }

        fn is_closed(&self) -> bool {
            self.inner.lock().expect("endpoint").closed
        }
    }

    impl AndroidAoaEndpointHandle for SharedFakeEndpoint {
        fn bulk_read(
            &mut self,
            buf: &mut [u8],
            _timeout: Duration,
        ) -> Result<usize, AndroidAoaBackendError> {
            let mut inner = self.inner.lock().expect("endpoint");
            match inner.reads.pop_front() {
                Some(Ok(bytes)) => {
                    let len = bytes.len().min(buf.len());
                    buf[..len].copy_from_slice(&bytes[..len]);
                    Ok(len)
                }
                Some(Err(error)) => Err(error),
                None => Err(AndroidAoaBackendError::Timeout),
            }
        }

        fn bulk_write(
            &mut self,
            data: &[u8],
            timeout: Duration,
        ) -> Result<usize, AndroidAoaBackendError> {
            let mut inner = self.inner.lock().expect("endpoint");
            if inner.closed {
                return Err(AndroidAoaBackendError::NoDevice);
            }
            if let Some(error) = inner.write_errors.pop_front() {
                return Err(error);
            }
            inner.write_timeouts.push(timeout);
            inner.writes.push(data.to_vec());
            Ok(data.len())
        }

        fn close(&mut self) -> Result<(), AndroidAoaBackendError> {
            self.inner.lock().expect("endpoint").closed = true;
            Ok(())
        }
    }

    fn plain_android_device() -> AndroidAoaDeviceInfo {
        AndroidAoaDeviceInfo {
            id: AndroidAoaDeviceId {
                bus_number: 1,
                address: 1,
            },
            vendor_id: 0x18D2,
            product_id: 0x4EE7,
            manufacturer: Some("Android".to_string()),
            product: Some("Phone".to_string()),
            serial_number: Some("plain".to_string()),
            endpoints: None,
        }
    }

    fn accessory_device(serial: &str) -> AndroidAoaDeviceInfo {
        AndroidAoaDeviceInfo {
            id: AndroidAoaDeviceId {
                bus_number: 1,
                address: 2,
            },
            vendor_id: GOOGLE_ACCESSORY_VENDOR_ID,
            product_id: 0x2D00,
            manufacturer: Some(CHROMVOID_AOA_MANUFACTURER.to_string()),
            product: Some(CHROMVOID_AOA_MODEL.to_string()),
            serial_number: Some(serial.to_string()),
            endpoints: Some(AndroidAoaEndpoints {
                interface_number: 0,
                in_address: 0x81,
                out_address: 0x01,
            }),
        }
    }
}
