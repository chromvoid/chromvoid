use super::*;

pub(in crate::mobile_usb::tests) struct FakeMobileUsbBridge {
    scans: Mutex<Vec<MobileUsbScanResult>>,
    detects: Mutex<Vec<MobileUsbDetectCandidate>>,
    host_private_key: Vec<u8>,
    host_public_key: Vec<u8>,
    scan_count: AtomicUsize,
    pair_open_count: AtomicUsize,
    connect_open_count: AtomicUsize,
    stale_connect: AtomicBool,
    pair_disconnect_after_open: AtomicBool,
    pair_first_write_timeout_once: AtomicBool,
    pair_first_write_android_endpoint_error_once: AtomicBool,
    pair_invalid_msg2_once: AtomicBool,
    pair_supports_cancel: AtomicBool,
    connect_first_write_timeout_once: AtomicBool,
    connect_first_write_android_endpoint_error_once: AtomicBool,
    connect_bad_record_len_once: AtomicBool,
    connect_invalid_msg2: AtomicBool,
    connect_invalid_msg2_once: AtomicBool,
    connect_msg2_timeout_then_first_write_hang_step: AtomicUsize,
    connect_no_response: AtomicBool,
    connect_no_response_once: AtomicBool,
    connect_cable_disconnected: AtomicBool,
    connect_no_accessory_once: AtomicBool,
    connect_disconnect_after_open: AtomicBool,
}

impl FakeMobileUsbBridge {
    pub(in crate::mobile_usb::tests) fn new(scans: Vec<MobileUsbScanResult>) -> Self {
        let host_keys = noise_keypair();
        Self {
            scans: Mutex::new(scans),
            detects: Mutex::new(Vec::new()),
            host_private_key: host_keys.private,
            host_public_key: host_keys.public,
            scan_count: AtomicUsize::new(0),
            pair_open_count: AtomicUsize::new(0),
            connect_open_count: AtomicUsize::new(0),
            stale_connect: AtomicBool::new(false),
            pair_disconnect_after_open: AtomicBool::new(false),
            pair_first_write_timeout_once: AtomicBool::new(false),
            pair_first_write_android_endpoint_error_once: AtomicBool::new(false),
            pair_invalid_msg2_once: AtomicBool::new(false),
            pair_supports_cancel: AtomicBool::new(true),
            connect_first_write_timeout_once: AtomicBool::new(false),
            connect_first_write_android_endpoint_error_once: AtomicBool::new(false),
            connect_bad_record_len_once: AtomicBool::new(false),
            connect_invalid_msg2: AtomicBool::new(false),
            connect_invalid_msg2_once: AtomicBool::new(false),
            connect_msg2_timeout_then_first_write_hang_step: AtomicUsize::new(0),
            connect_no_response: AtomicBool::new(false),
            connect_no_response_once: AtomicBool::new(false),
            connect_cable_disconnected: AtomicBool::new(false),
            connect_no_accessory_once: AtomicBool::new(false),
            connect_disconnect_after_open: AtomicBool::new(false),
        }
    }

    pub(in crate::mobile_usb::tests) fn host_public_key(&self) -> Vec<u8> {
        self.host_public_key.clone()
    }

    pub(in crate::mobile_usb::tests) fn scan_count(&self) -> usize {
        self.scan_count.load(Ordering::SeqCst)
    }

    pub(in crate::mobile_usb::tests) fn set_detected(
        &self,
        candidates: Vec<MobileUsbDetectCandidate>,
    ) {
        *self.detects.lock().expect("detects") = candidates;
    }

    pub(in crate::mobile_usb::tests) fn pair_open_count(&self) -> usize {
        self.pair_open_count.load(Ordering::SeqCst)
    }

    pub(in crate::mobile_usb::tests) fn connect_open_count(&self) -> usize {
        self.connect_open_count.load(Ordering::SeqCst)
    }

    pub(in crate::mobile_usb::tests) fn set_stale_connect(&self, stale: bool) {
        self.stale_connect.store(stale, Ordering::SeqCst);
    }

    pub(in crate::mobile_usb::tests) fn set_pair_disconnect_after_open(&self, disconnected: bool) {
        self.pair_disconnect_after_open
            .store(disconnected, Ordering::SeqCst);
    }

    pub(in crate::mobile_usb::tests) fn set_pair_first_write_timeout_once(&self, timeout: bool) {
        self.pair_first_write_timeout_once
            .store(timeout, Ordering::SeqCst);
    }

    pub(in crate::mobile_usb::tests) fn set_pair_first_write_android_endpoint_error_once(
        &self,
        fail: bool,
    ) {
        self.pair_first_write_android_endpoint_error_once
            .store(fail, Ordering::SeqCst);
    }

    pub(in crate::mobile_usb::tests) fn set_pair_invalid_msg2_once(&self, invalid: bool) {
        self.pair_invalid_msg2_once.store(invalid, Ordering::SeqCst);
    }

    pub(in crate::mobile_usb::tests) fn set_pair_supports_cancel(&self, supported: bool) {
        self.pair_supports_cancel.store(supported, Ordering::SeqCst);
    }

    pub(in crate::mobile_usb::tests) fn set_connect_first_write_timeout_once(&self, timeout: bool) {
        self.connect_first_write_timeout_once
            .store(timeout, Ordering::SeqCst);
    }

    pub(in crate::mobile_usb::tests) fn set_connect_first_write_android_endpoint_error_once(
        &self,
        fail: bool,
    ) {
        self.connect_first_write_android_endpoint_error_once
            .store(fail, Ordering::SeqCst);
    }

    pub(in crate::mobile_usb::tests) fn set_connect_bad_record_len_once(
        &self,
        bad_record_len: bool,
    ) {
        self.connect_bad_record_len_once
            .store(bad_record_len, Ordering::SeqCst);
    }

    pub(in crate::mobile_usb::tests) fn set_connect_invalid_msg2(&self, invalid: bool) {
        self.connect_invalid_msg2.store(invalid, Ordering::SeqCst);
    }

    pub(in crate::mobile_usb::tests) fn set_connect_invalid_msg2_once(&self, invalid: bool) {
        self.connect_invalid_msg2_once
            .store(invalid, Ordering::SeqCst);
    }

    pub(in crate::mobile_usb::tests) fn set_connect_msg2_timeout_then_first_write_hang_once(
        &self,
        enabled: bool,
    ) {
        self.connect_msg2_timeout_then_first_write_hang_step
            .store(if enabled { 1 } else { 0 }, Ordering::SeqCst);
    }

    pub(in crate::mobile_usb::tests) fn set_connect_no_response(&self, no_response: bool) {
        self.connect_no_response
            .store(no_response, Ordering::SeqCst);
    }

    pub(in crate::mobile_usb::tests) fn set_connect_no_response_once(&self, no_response: bool) {
        self.connect_no_response_once
            .store(no_response, Ordering::SeqCst);
    }

    pub(in crate::mobile_usb::tests) fn set_connect_cable_disconnected(&self, disconnected: bool) {
        self.connect_cable_disconnected
            .store(disconnected, Ordering::SeqCst);
    }

    pub(in crate::mobile_usb::tests) fn set_connect_no_accessory_once(&self, no_accessory: bool) {
        self.connect_no_accessory_once
            .store(no_accessory, Ordering::SeqCst);
    }

    pub(in crate::mobile_usb::tests) fn set_connect_disconnect_after_open(
        &self,
        disconnected: bool,
    ) {
        self.connect_disconnect_after_open
            .store(disconnected, Ordering::SeqCst);
    }
}

#[async_trait::async_trait]
impl MobileUsbBridge for FakeMobileUsbBridge {
    async fn scan(&self) -> Result<Vec<MobileUsbScanResult>, MobileUsbError> {
        self.scan_count.fetch_add(1, Ordering::SeqCst);
        Ok(self.scans.lock().expect("scans").clone())
    }

    async fn detect(&self) -> Result<Vec<MobileUsbDetectCandidate>, MobileUsbError> {
        Ok(self.detects.lock().expect("detects").clone())
    }

    async fn open_pair_stream(
        &self,
        request: &MobileUsbPairRequest,
    ) -> Result<BoxMobileUsbStream, MobileUsbError> {
        self.pair_open_count.fetch_add(1, Ordering::SeqCst);
        assert_eq!(request.platform, MobileUsbPlatform::Android);
        assert_eq!(request.bridge_kind, MobileUsbBridgeKind::AndroidAoa);
        assert_eq!(request.usb_hint.canonical(), usb_hint().canonical());
        let (client, host) = duplex(4096);
        if self.pair_disconnect_after_open.load(Ordering::SeqCst) {
            drop(host);
            return Ok(Box::new(client));
        }
        if self
            .pair_first_write_timeout_once
            .swap(false, Ordering::SeqCst)
        {
            drop(host);
            return Ok(Box::new(FirstWriteErrorStream::new(
                client,
                io::ErrorKind::TimedOut,
                "fake Android AOA first write timeout",
            )));
        }
        if self
            .pair_first_write_android_endpoint_error_once
            .swap(false, Ordering::SeqCst)
        {
            drop(host);
            return Ok(Box::new(FirstWriteErrorStream::new(
                client,
                io::ErrorKind::Other,
                "Android AOA endpoint failed: Io(\"Pipe\")",
            )));
        }
        if self.pair_invalid_msg2_once.swap(false, Ordering::SeqCst) {
            spawn_invalid_msg2_responder(host);
            return Ok(Box::new(client));
        }
        spawn_xx_pair_responder(
            host,
            self.host_private_key.clone(),
            self.host_public_key.clone(),
            self.pair_supports_cancel.load(Ordering::SeqCst),
        );
        Ok(Box::new(client))
    }

    async fn open_connect_stream(
        &self,
        record: &MobileUsbPairedHostRecord,
    ) -> Result<BoxMobileUsbStream, MobileUsbError> {
        self.connect_open_count.fetch_add(1, Ordering::SeqCst);
        assert_eq!(record.platform, MobileUsbPlatform::Android);
        assert_eq!(record.bridge_kind, MobileUsbBridgeKind::AndroidAoa);
        assert_eq!(record.usb_hint.canonical(), usb_hint().canonical());
        if self.connect_cable_disconnected.load(Ordering::SeqCst) {
            return Err(MobileUsbError::new(
                MobileUsbErrorCode::CableDisconnected,
                "fake cable disconnected",
            ));
        }
        if self.connect_no_accessory_once.swap(false, Ordering::SeqCst) {
            return Err(MobileUsbError::new(
                MobileUsbErrorCode::NoAccessory,
                "fake accessory enumeration blip",
            ));
        }
        let host_private_key = if self.stale_connect.load(Ordering::SeqCst) {
            noise_keypair().private
        } else {
            self.host_private_key.clone()
        };
        let (client, host) = duplex(4096);
        if self.connect_disconnect_after_open.load(Ordering::SeqCst) {
            drop(host);
            return Ok(Box::new(client));
        }
        if self
            .connect_first_write_timeout_once
            .swap(false, Ordering::SeqCst)
        {
            drop(host);
            return Ok(Box::new(FirstWriteErrorStream::new(
                client,
                io::ErrorKind::TimedOut,
                "fake Android AOA connect first write timeout",
            )));
        }
        if self
            .connect_first_write_android_endpoint_error_once
            .swap(false, Ordering::SeqCst)
        {
            drop(host);
            return Ok(Box::new(FirstWriteErrorStream::new(
                client,
                io::ErrorKind::Other,
                "Android AOA endpoint failed: Timeout",
            )));
        }
        if self
            .connect_bad_record_len_once
            .swap(false, Ordering::SeqCst)
        {
            tokio::spawn(async move {
                let bad_len = (MAX_USB_REMOTE_RECORD_BYTES as u32) + 1;
                let mut host = host;
                let _ = host.write_all(&bad_len.to_be_bytes()).await;
            });
            return Ok(Box::new(client));
        }
        if self.connect_invalid_msg2_once.swap(false, Ordering::SeqCst)
            || self.connect_invalid_msg2.load(Ordering::SeqCst)
        {
            spawn_invalid_msg2_responder(host);
            return Ok(Box::new(client));
        }
        match self
            .connect_msg2_timeout_then_first_write_hang_step
            .load(Ordering::SeqCst)
        {
            1 => {
                self.connect_msg2_timeout_then_first_write_hang_step
                    .store(2, Ordering::SeqCst);
                tokio::spawn(async move {
                    let _keep_stream_open = host;
                    std::future::pending::<()>().await;
                });
                return Ok(Box::new(client));
            }
            2 => {
                self.connect_msg2_timeout_then_first_write_hang_step
                    .store(0, Ordering::SeqCst);
                drop(host);
                return Ok(Box::new(FirstWritePendingStream::new(client)));
            }
            _ => {}
        }
        if self.connect_no_response_once.swap(false, Ordering::SeqCst)
            || self.connect_no_response.load(Ordering::SeqCst)
        {
            tokio::spawn(async move {
                let _keep_stream_open = host;
                std::future::pending::<()>().await;
            });
            return Ok(Box::new(client));
        }
        spawn_ik_responder(host, host_private_key);
        Ok(Box::new(client))
    }
}

pub(in crate::mobile_usb::tests) struct FirstWritePendingStream {
    inner: tokio::io::DuplexStream,
}

impl FirstWritePendingStream {
    pub(in crate::mobile_usb::tests) fn new(inner: tokio::io::DuplexStream) -> Self {
        Self { inner }
    }
}

impl AsyncRead for FirstWritePendingStream {
    fn poll_read(
        mut self: Pin<&mut Self>,
        cx: &mut Context<'_>,
        buf: &mut ReadBuf<'_>,
    ) -> Poll<io::Result<()>> {
        Pin::new(&mut self.inner).poll_read(cx, buf)
    }
}

impl AsyncWrite for FirstWritePendingStream {
    fn poll_write(
        self: Pin<&mut Self>,
        _cx: &mut Context<'_>,
        _data: &[u8],
    ) -> Poll<io::Result<usize>> {
        Poll::Pending
    }

    fn poll_flush(self: Pin<&mut Self>, _cx: &mut Context<'_>) -> Poll<io::Result<()>> {
        Poll::Pending
    }

    fn poll_shutdown(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<io::Result<()>> {
        Pin::new(&mut self.inner).poll_shutdown(cx)
    }
}

pub(in crate::mobile_usb::tests) struct FirstWriteErrorStream {
    inner: tokio::io::DuplexStream,
    error: Option<io::Error>,
}

impl FirstWriteErrorStream {
    pub(in crate::mobile_usb::tests) fn new(
        inner: tokio::io::DuplexStream,
        kind: io::ErrorKind,
        message: &'static str,
    ) -> Self {
        Self {
            inner,
            error: Some(io::Error::new(kind, message)),
        }
    }
}

impl AsyncRead for FirstWriteErrorStream {
    fn poll_read(
        mut self: Pin<&mut Self>,
        cx: &mut Context<'_>,
        buf: &mut ReadBuf<'_>,
    ) -> Poll<io::Result<()>> {
        Pin::new(&mut self.inner).poll_read(cx, buf)
    }
}

impl AsyncWrite for FirstWriteErrorStream {
    fn poll_write(
        mut self: Pin<&mut Self>,
        cx: &mut Context<'_>,
        data: &[u8],
    ) -> Poll<io::Result<usize>> {
        if let Some(error) = self.error.take() {
            return Poll::Ready(Err(error));
        }
        Pin::new(&mut self.inner).poll_write(cx, data)
    }

    fn poll_flush(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<io::Result<()>> {
        Pin::new(&mut self.inner).poll_flush(cx)
    }

    fn poll_shutdown(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<io::Result<()>> {
        Pin::new(&mut self.inner).poll_shutdown(cx)
    }
}
