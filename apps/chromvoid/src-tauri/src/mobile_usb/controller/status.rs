use super::*;

impl MobileUsbController {
    pub(super) fn status_inner(&self) -> Result<MobileUsbStatus, MobileUsbError> {
        let paired_hosts = self.list_paired_inner()?;
        self.with_state(|state| state.status(paired_hosts))
    }

    pub(super) fn list_paired_inner(&self) -> Result<Vec<MobileUsbHostView>, MobileUsbError> {
        Ok(self
            .store
            .list()?
            .iter()
            .map(|record| {
                let pairing_state = if record.is_connectable_pairing()
                    && self.secrets.load_client_key(&record.client_key_ref).is_ok()
                {
                    MobileUsbPairingState::Paired
                } else {
                    MobileUsbPairingState::BrokenLocalState
                };
                MobileUsbHostView::from_record(record, pairing_state)
            })
            .collect())
    }

    pub(super) fn remove_paired_inner(
        &self,
        host_id: &HostId,
    ) -> Result<Vec<MobileUsbHostView>, MobileUsbError> {
        if self.with_state(|state| state.is_active_host(host_id))? {
            return Err(MobileUsbError::new(
                MobileUsbErrorCode::InvalidState,
                "cannot remove active mobile USB host before disconnect",
            ));
        }

        let existing = self.store.get(host_id)?;
        self.store.remove(host_id)?;
        if let Some(record) = existing {
            let _ = self.secrets.delete_client_key(&record.client_key_ref);
        }
        self.list_paired_inner()
    }

    pub(super) async fn scan_inner(&self) -> Result<Vec<MobileUsbScannedHost>, MobileUsbError> {
        let records = self.store.list()?;
        let scans = self.bridge.scan().await?;
        let hosts = scans
            .into_iter()
            .map(|scan| MobileUsbScannedHost {
                classification: classify_scan_result(&scan, &records, self.secrets.as_ref()),
                scan,
            })
            .collect::<Vec<_>>();
        tracing::info!(
            scan_count = hosts.len(),
            classifications = %scan_classification_summary(&hosts),
            "mobile_usb scan classified hosts"
        );
        Ok(hosts)
    }

    pub(super) async fn detect_inner(
        &self,
    ) -> Result<Vec<MobileUsbDetectedDevice>, MobileUsbError> {
        let records = self.store.list()?;
        let candidates = self.bridge.detect().await?;
        let total = candidates.len();
        let devices = candidates
            .into_iter()
            .filter_map(|candidate| {
                let paired_match = match_detected_device(&candidate, &records);
                // Unmatched non-accessory devices are generic USB noise (hubs,
                // keyboards); only accessory-mode devices and paired matches are
                // meaningful to surface.
                if !candidate.accessory_mode && paired_match.is_none() {
                    return None;
                }
                Some(MobileUsbDetectedDevice {
                    scan: candidate.scan,
                    accessory_mode: candidate.accessory_mode,
                    paired_match,
                })
            })
            .collect::<Vec<_>>();
        tracing::info!(
            device_count = total,
            detected_count = devices.len(),
            "mobile_usb passive detect classified plugged devices"
        );
        Ok(devices)
    }
}

fn match_detected_device(
    candidate: &MobileUsbDetectCandidate,
    records: &[MobileUsbPairedHostRecord],
) -> Option<MobileUsbDetectedPairedMatch> {
    // Passive inventory is intentionally record-only. Loading the private key
    // here can block page entry behind an operating-system credential prompt.
    // Explicit scan/list/connect operations remain responsible for proving
    // that the referenced secret exists.
    if candidate.accessory_mode {
        let matches = records
            .iter()
            .filter(|record| record.matches_scan_result(&candidate.scan))
            .collect::<Vec<_>>();
        if let [record] = matches.as_slice() {
            return Some(detected_match_for_record(record));
        }
    }

    // Serial heuristic for devices in normal USB mode; ambiguity means no claim.
    let matches: Vec<&MobileUsbPairedHostRecord> = records
        .iter()
        .filter(|record| record.matches_detect_serial(&candidate.scan))
        .collect();
    match matches.as_slice() {
        [record] => Some(detected_match_for_record(record)),
        _ => None,
    }
}

fn detected_match_for_record(record: &MobileUsbPairedHostRecord) -> MobileUsbDetectedPairedMatch {
    MobileUsbDetectedPairedMatch {
        host_id: record.host_id.clone(),
        label: record.label.clone(),
        pairing_state: if record.is_connectable_pairing() {
            MobileUsbDetectedPairingState::Confirmed
        } else {
            MobileUsbDetectedPairingState::Incomplete
        },
    }
}

pub(super) fn active_host_id_from_status_result(
    result: &Result<MobileUsbStatus, MobileUsbError>,
) -> Option<HostId> {
    result
        .as_ref()
        .ok()
        .and_then(|status| status.active_host.as_ref())
        .map(|host| host.host_id.clone())
}

fn scan_classification_summary(hosts: &[MobileUsbScannedHost]) -> String {
    if hosts.is_empty() {
        return "none".to_string();
    }

    hosts
        .iter()
        .map(|host| {
            let classification = match &host.classification {
                MobileUsbScanClassification::Unpaired => "unpaired".to_string(),
                MobileUsbScanClassification::Ambiguous => "ambiguous".to_string(),
                MobileUsbScanClassification::Paired { host_id } => {
                    format!("paired:{}", redacted_identifier(Some(host_id)))
                }
                MobileUsbScanClassification::BrokenLocalState { host_id } => {
                    format!("broken_local_state:{}", redacted_identifier(Some(host_id)))
                }
            };
            let label = host.scan.label.as_deref().unwrap_or("unknown");
            format!("{label}:{classification}")
        })
        .collect::<Vec<_>>()
        .join(",")
}
