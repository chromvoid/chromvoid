use super::types::{
    normalize_non_empty_owned, CachedEntryMeta, PassmanagerOtpTargetRequest, ResolvedOtpTarget,
};

pub(super) fn resolve_from_entries(
    entries: &[CachedEntryMeta],
    request: PassmanagerOtpTargetRequest<'_>,
) -> Option<ResolvedOtpTarget> {
    let fallback_label = normalize_non_empty_owned(request.fallback_label);

    for entry in entries {
        let entry_match = request
            .entry_id
            .map(|id| entry.entry_id.as_deref() == Some(id))
            .unwrap_or(false);
        if request.entry_id.is_some() && !entry_match {
            continue;
        }

        if let Some(otp_id) = request.otp_id {
            if let Some(found) = entry
                .otps
                .iter()
                .find(|otp| otp.id.as_deref() == Some(otp_id))
            {
                let label = found
                    .preferred_label
                    .clone()
                    .or_else(|| fallback_label.clone())
                    .unwrap_or_else(|| otp_id.to_string());
                return Some(ResolvedOtpTarget {
                    node_id: entry.node_id,
                    label,
                });
            }
            // If entry_id uniquely identifies this entry, fall back to otp_id as
            // the label so callers can still generate or set a secret after
            // meta.json was saved without the OTP list.
            if entry_match {
                return Some(ResolvedOtpTarget {
                    node_id: entry.node_id,
                    label: fallback_label.clone().unwrap_or_else(|| otp_id.to_string()),
                });
            }
        }
        if entry_match {
            if let Some(label) = fallback_label.clone() {
                return Some(ResolvedOtpTarget {
                    node_id: entry.node_id,
                    label,
                });
            }
            if entry.otps.len() == 1 {
                if let Some(label) = entry.otps[0].preferred_label.clone() {
                    return Some(ResolvedOtpTarget {
                        node_id: entry.node_id,
                        label,
                    });
                }
            }
        }
    }

    None
}
