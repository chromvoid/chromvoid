use async_trait::async_trait;

use super::record_transport::MobileUsbByteStream;
use super::types::{
    MobileUsbError, MobileUsbErrorCode, MobileUsbPairRequest, MobileUsbPairedHostRecord,
    MobileUsbScanResult,
};

pub type BoxMobileUsbStream = Box<dyn MobileUsbByteStream>;

#[async_trait]
pub trait MobileUsbBridge: Send + Sync {
    async fn scan(&self) -> Result<Vec<MobileUsbScanResult>, MobileUsbError>;

    async fn open_pair_stream(
        &self,
        request: &MobileUsbPairRequest,
    ) -> Result<BoxMobileUsbStream, MobileUsbError>;

    async fn open_connect_stream(
        &self,
        record: &MobileUsbPairedHostRecord,
    ) -> Result<BoxMobileUsbStream, MobileUsbError>;
}

#[derive(Default)]
pub struct UnsupportedMobileUsbBridge;

#[async_trait]
impl MobileUsbBridge for UnsupportedMobileUsbBridge {
    async fn scan(&self) -> Result<Vec<MobileUsbScanResult>, MobileUsbError> {
        Err(unsupported())
    }

    async fn open_pair_stream(
        &self,
        _request: &MobileUsbPairRequest,
    ) -> Result<BoxMobileUsbStream, MobileUsbError> {
        Err(unsupported())
    }

    async fn open_connect_stream(
        &self,
        _record: &MobileUsbPairedHostRecord,
    ) -> Result<BoxMobileUsbStream, MobileUsbError> {
        Err(unsupported())
    }
}

fn unsupported() -> MobileUsbError {
    MobileUsbError::new(
        MobileUsbErrorCode::BridgeUnavailable,
        "mobile USB production bridge is not available in this build",
    )
}
