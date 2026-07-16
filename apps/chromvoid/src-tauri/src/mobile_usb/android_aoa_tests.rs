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

    negotiate_accessory_mode(&mut handle, &AndroidAoaIdentity::default())
        .expect("negotiate accessory mode");

    let log = log.lock().expect("log");
    assert_eq!(log[0], FakeControl::GetProtocol);
    assert_eq!(
        &log[1..7],
        &[
            FakeControl::SendString(
                AOA_STRING_MANUFACTURER,
                CHROMVOID_AOA_MANUFACTURER.to_string(),
            ),
            FakeControl::SendString(AOA_STRING_MODEL, CHROMVOID_AOA_MODEL.to_string()),
            FakeControl::SendString(
                AOA_STRING_DESCRIPTION,
                CHROMVOID_AOA_DESCRIPTION.to_string(),
            ),
            FakeControl::SendString(AOA_STRING_VERSION, CHROMVOID_AOA_VERSION.to_string()),
            FakeControl::SendString(AOA_STRING_URI, CHROMVOID_AOA_URI.to_string()),
            FakeControl::SendString(AOA_STRING_SERIAL, CHROMVOID_AOA_PROTOCOL_ID.to_string()),
        ]
    );
    assert_eq!(log[7], FakeControl::Start);
}

#[test]
fn android_aoa_protocol_uses_dev_model_for_dev_app_identifier() {
    let identity = AndroidAoaIdentity::for_app_identifier("com.chromvoid.app.dev");
    let log = Arc::new(Mutex::new(Vec::new()));
    let mut handle = FakeDeviceHandle {
        protocol_version: 2,
        log: log.clone(),
    };

    negotiate_accessory_mode(&mut handle, &identity).expect("negotiate accessory mode");

    assert!(log.lock().expect("log").contains(&FakeControl::SendString(
        AOA_STRING_MODEL,
        CHROMVOID_AOA_DEV_MODEL.to_string(),
    )));
}

#[test]
fn android_aoa_protocol_rejects_zero_version() {
    let log = Arc::new(Mutex::new(Vec::new()));
    let mut handle = FakeDeviceHandle {
        protocol_version: 0,
        log,
    };

    let error = negotiate_accessory_mode(&mut handle, &AndroidAoaIdentity::default())
        .expect_err("zero version fails");

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
async fn android_aoa_scan_waits_for_slow_reenumerated_accessory() {
    let backend = Arc::new(FakeBackend::new(vec![
        vec![plain_android_device()],
        Vec::new(),
        Vec::new(),
        Vec::new(),
        Vec::new(),
        Vec::new(),
        vec![accessory_device("serial-slow")],
    ]));
    let bridge = AndroidAoaMobileUsbBridge::new_for_tests(backend.clone());

    let scans = bridge.scan().await.expect("slow reenumerated scan");

    assert_eq!(backend.control_count(), 8);
    assert_eq!(backend.list_calls.load(Ordering::SeqCst), 7);
    assert_eq!(scans.len(), 1);
    assert_eq!(
        scans[0].usb_hint.serial_number.as_deref(),
        Some("serial-slow")
    );
}

#[tokio::test]
async fn android_aoa_scan_returns_empty_list_for_empty_bus_and_errors_on_permission_denied() {
    let bridge =
        AndroidAoaMobileUsbBridge::new_for_tests(Arc::new(FakeBackend::new(vec![Vec::new()])));
    let scans = bridge.scan().await.expect("empty bus scan");
    assert!(scans.is_empty());

    let backend = Arc::new(FakeBackend::new(vec![vec![plain_android_device()]]));
    backend.set_open_error(AndroidAoaBackendError::PermissionDenied);
    let bridge = AndroidAoaMobileUsbBridge::new_for_tests(backend);
    let error = bridge.scan().await.expect_err("permission denied");
    assert_eq!(error.code, MobileUsbErrorCode::PermissionDenied);
}

#[tokio::test]
async fn android_aoa_scan_returns_empty_list_when_probe_is_unsupported() {
    let backend = Arc::new(FakeBackend::new(vec![vec![plain_android_device()]]));
    backend.set_open_error(AndroidAoaBackendError::UnsupportedProtocol);
    let bridge = AndroidAoaMobileUsbBridge::new_for_tests(backend);

    let scans = bridge
        .scan()
        .await
        .expect("unsupported probe is skipped as incompatible device");

    assert!(scans.is_empty());
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
        usb_hint: scan_result_from_device(&accessory_device("serial-1"), &bridge.identity).usb_hint,
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

    let scan = scan_result_from_device(&device, &AndroidAoaIdentity::default());

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
        usb_hint: scan_result_from_device(&accessory_device("serial-1"), &bridge.identity).usb_hint,
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
async fn android_aoa_stream_writes_record_prefix_and_payload_in_one_bulk_write() {
    let endpoint = SharedFakeEndpoint::default();
    let stream = AndroidAoaByteStream::new(Box::new(endpoint.clone()));
    let mut transport = MobileUsbRemoteTransport::new(stream, MobileUsbBridgeKind::AndroidAoa);

    transport.send(b"hello").await.expect("send record");
    tokio::time::sleep(Duration::from_millis(25)).await;

    let expected_record = [5_u32.to_be_bytes().as_slice(), b"hello"].concat();
    let write_chunks = endpoint.write_chunks();
    assert_eq!(write_chunks, vec![expected_record]);
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
async fn android_aoa_stream_reads_while_bulk_write_blocks() {
    let endpoint = SharedFakeEndpoint::default();
    endpoint.set_write_delay(Duration::from_millis(250));
    endpoint.push_read_chunk(*b"pong");
    let stream = AndroidAoaByteStream::new(Box::new(endpoint));
    let (mut reader, mut writer) = tokio::io::split(stream);

    let write_task = tokio::spawn(async move {
        writer
            .write_all(b"slow-write")
            .await
            .expect("blocking bulk write eventually finishes");
    });
    let mut buf = [0_u8; 4];

    tokio::time::timeout(Duration::from_millis(150), reader.read_exact(&mut buf))
        .await
        .expect("read should not wait for blocked write")
        .expect("read bytes");

    assert_eq!(&buf, b"pong");
    write_task.await.expect("write task");
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

#[tokio::test]
async fn android_aoa_stream_drop_closes_endpoint_after_busy_read() {
    let endpoint = SharedFakeEndpoint::default();
    endpoint.set_read_delay(Duration::from_millis(100));
    let stream = AndroidAoaByteStream::new(Box::new(endpoint.clone()));

    tokio::time::sleep(Duration::from_millis(10)).await;
    drop(stream);

    tokio::time::timeout(Duration::from_millis(500), async {
        loop {
            if endpoint.is_closed() {
                break;
            }
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    })
    .await
    .expect("busy endpoint should close after read returns");
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum FakeControl {
    GetProtocol,
    SendString(u16, String),
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
            CHROMVOID_AOA_DEV_MODEL => CHROMVOID_AOA_DEV_MODEL,
            CHROMVOID_AOA_DESCRIPTION => CHROMVOID_AOA_DESCRIPTION,
            CHROMVOID_AOA_VERSION => CHROMVOID_AOA_VERSION,
            CHROMVOID_AOA_URI => CHROMVOID_AOA_URI,
            CHROMVOID_AOA_PROTOCOL_ID => CHROMVOID_AOA_PROTOCOL_ID,
            _ => return Err(AndroidAoaBackendError::Io("unexpected string".to_string())),
        };
        self.log
            .lock()
            .expect("log")
            .push(FakeControl::SendString(index, value.to_string()));
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
    read_delay: Option<Duration>,
    write_delay: Option<Duration>,
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

    fn set_read_delay(&self, delay: Duration) {
        self.inner.lock().expect("endpoint").read_delay = Some(delay);
    }

    fn set_write_delay(&self, delay: Duration) {
        self.inner.lock().expect("endpoint").write_delay = Some(delay);
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

    fn write_chunks(&self) -> Vec<Vec<u8>> {
        self.inner.lock().expect("endpoint").writes.clone()
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
        &self,
        buf: &mut [u8],
        _timeout: Duration,
    ) -> Result<usize, AndroidAoaBackendError> {
        let read_delay = self.inner.lock().expect("endpoint").read_delay;
        if let Some(delay) = read_delay {
            std::thread::sleep(delay);
        }
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

    fn bulk_write(&self, data: &[u8], timeout: Duration) -> Result<usize, AndroidAoaBackendError> {
        let write_delay = self.inner.lock().expect("endpoint").write_delay;
        if let Some(delay) = write_delay {
            std::thread::sleep(delay);
        }
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

    fn close(&self) -> Result<(), AndroidAoaBackendError> {
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
