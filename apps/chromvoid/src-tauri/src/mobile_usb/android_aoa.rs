use std::sync::Arc;
#[cfg(test)]
use std::sync::Mutex;
#[cfg(test)]
use std::time::Duration;

use async_trait::async_trait;

use super::bridge::{BoxMobileUsbStream, MobileUsbBridge};
use super::types::{
    MobileUsbBridgeKind, MobileUsbDetectCandidate, MobileUsbError, MobileUsbErrorCode,
    MobileUsbPairRequest, MobileUsbPairedHostRecord, MobileUsbPlatform, MobileUsbScanResult,
};

mod backend;
mod protocol;
mod scan;
mod stream;

#[cfg(test)]
use backend::{
    map_rusb_error, AndroidAoaBackendError, AndroidAoaDeviceHandle, AndroidAoaDeviceId,
    AndroidAoaDeviceInfo, AndroidAoaEndpointHandle, AndroidAoaEndpoints,
};
use backend::{AndroidAoaUsbBackend, RusbAndroidAoaUsbBackend};
use protocol::AndroidAoaIdentity;
#[cfg(test)]
use protocol::{
    negotiate_accessory_mode, AOA_STRING_DESCRIPTION, AOA_STRING_MANUFACTURER, AOA_STRING_MODEL,
    AOA_STRING_SERIAL, AOA_STRING_URI, AOA_STRING_VERSION, CHROMVOID_AOA_DESCRIPTION,
    CHROMVOID_AOA_DEV_MODEL, CHROMVOID_AOA_MANUFACTURER, CHROMVOID_AOA_MODEL,
    CHROMVOID_AOA_PROTOCOL_ID, CHROMVOID_AOA_URI, CHROMVOID_AOA_VERSION,
};
use scan::{detect_blocking, open_matching_accessory, scan_blocking};
#[cfg(test)]
use scan::{
    map_open_backend_error, map_scan_backend_error, scan_result_from_device,
    GOOGLE_ACCESSORY_VENDOR_ID,
};
use stream::AndroidAoaByteStream;
#[cfg(test)]
use stream::{BULK_READ_TIMEOUT, BULK_WRITE_TIMEOUT};

pub(crate) struct AndroidAoaMobileUsbBridge {
    backend: Arc<dyn AndroidAoaUsbBackend>,
    identity: AndroidAoaIdentity,
}

impl AndroidAoaMobileUsbBridge {
    pub(crate) fn new() -> Self {
        Self::new_with_identity(AndroidAoaIdentity::default())
    }

    pub(crate) fn new_for_app_identifier(app_identifier: &str) -> Self {
        Self::new_with_identity(AndroidAoaIdentity::for_app_identifier(app_identifier))
    }

    fn new_with_identity(identity: AndroidAoaIdentity) -> Self {
        Self {
            backend: Arc::new(RusbAndroidAoaUsbBackend),
            identity,
        }
    }

    #[cfg(test)]
    fn new_for_tests(backend: Arc<dyn AndroidAoaUsbBackend>) -> Self {
        Self {
            backend,
            identity: AndroidAoaIdentity::default(),
        }
    }
}

#[async_trait]
impl MobileUsbBridge for AndroidAoaMobileUsbBridge {
    async fn scan(&self) -> Result<Vec<MobileUsbScanResult>, MobileUsbError> {
        let backend = self.backend.clone();
        let identity = self.identity.clone();
        blocking_usb(move || scan_blocking(backend, &identity)).await
    }

    async fn detect(&self) -> Result<Vec<MobileUsbDetectCandidate>, MobileUsbError> {
        let backend = self.backend.clone();
        let identity = self.identity.clone();
        blocking_usb(move || detect_blocking(backend, &identity)).await
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
        let identity = self.identity.clone();
        let endpoint =
            blocking_usb(move || open_matching_accessory(backend, &identity, &hint)).await?;
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
        let identity = self.identity.clone();
        let endpoint =
            blocking_usb(move || open_matching_accessory(backend, &identity, &hint)).await?;
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

#[cfg(test)]
#[path = "android_aoa_tests.rs"]
mod android_aoa_tests;
