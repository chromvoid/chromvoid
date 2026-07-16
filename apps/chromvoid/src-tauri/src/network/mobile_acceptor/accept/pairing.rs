use std::path::PathBuf;

use chromvoid_protocol::{NoiseTransport, RemoteTransport};
use rand::RngCore as _;
use uuid::Uuid;

use super::super::state::UsbPairingApprovalDecision;
use super::hex_decode;
use crate::mobile_usb::pairing_protocol::{
    pairing_fingerprint, recv_pairing_approval_proof, send_pairing_approval_ack,
    send_pairing_approval_challenge, verify_pairing_approval_proof, MobileUsbPairingApprovalAck,
    MobileUsbPairingApprovalChallenge, MobileUsbPairingHello,
};
use crate::mobile_usb::{
    mobile_usb_hex_encode, recv_mobile_usb_pairing_hello, send_mobile_usb_pairing_hello,
    MobileUsbHostApprovalDecision, MobileUsbHostPairingApprovalView,
};
use crate::network::mobile_acceptor::MobileAcceptorRuntimeState;
use crate::network::paired_peers::{PairedPeer, PairedPeerStore};
use crate::network::LocalDeviceIdentity;
use std::sync::Arc;
#[cfg(target_os = "android")]
use tauri::Emitter as _;

pub(super) async fn confirm_usb_mobile_pairing(
    runtime: Arc<MobileAcceptorRuntimeState>,
    transport: &mut dyn RemoteTransport,
    mut noise: NoiseTransport,
    store_path: PathBuf,
    remote_pubkey: Vec<u8>,
    local_identity: &LocalDeviceIdentity,
) -> Result<(NoiseTransport, String, String), String> {
    let hello = recv_mobile_usb_pairing_hello(transport, &mut noise).await?;
    let remote_pubkey_hex = mobile_usb_hex_encode(&remote_pubkey);
    if hello.peer_pubkey_hex != remote_pubkey_hex {
        return Err("USB pairing hello pubkey mismatch".to_string());
    }

    let local_pubkey = hex_decode(&local_identity.static_pubkey_hex)?;
    send_mobile_usb_pairing_hello(
        transport,
        &mut noise,
        &MobileUsbPairingHello {
            peer_id: local_identity.device_id.clone(),
            peer_label: local_identity.device_label.clone(),
            peer_pubkey_hex: local_identity.static_pubkey_hex.clone(),
            platform: "android".to_string(),
        },
    )
    .await?;

    let attempt_id = Uuid::new_v4().to_string();
    let salt_hex = random_salt_hex();
    let expires_at_ms = now_ms().saturating_add(5 * 60 * 1000);
    let approval_pin = random_pin();
    let peer_fingerprint = pairing_fingerprint(&remote_pubkey);
    runtime.register_usb_pairing_approval(MobileUsbHostPairingApprovalView {
        attempt_id: attempt_id.clone(),
        approval_pin: approval_pin.clone(),
        peer_label: hello.peer_label.clone(),
        peer_fingerprint: peer_fingerprint.clone(),
        attempts_left: 5,
        decision: MobileUsbHostApprovalDecision::Pending,
        expires_at_ms,
    })?;
    emit_usb_pairing_approval_required(&attempt_id);

    let challenge = MobileUsbPairingApprovalChallenge {
        attempt_id: attempt_id.clone(),
        salt_hex,
        host_pubkey_hex: local_identity.static_pubkey_hex.clone(),
        peer_fingerprint,
        attempts_left: 5,
        expires_at_ms,
    };
    send_pairing_approval_challenge(transport, &mut noise, &challenge).await?;

    let mut attempts_left = 5_u8;
    loop {
        let proof = recv_pairing_approval_proof(transport, &mut noise).await?;
        if proof.attempt_id != attempt_id {
            attempts_left = attempts_left.saturating_sub(1);
            send_pairing_approval_ack(
                transport,
                &mut noise,
                &MobileUsbPairingApprovalAck {
                    attempt_id: attempt_id.clone(),
                    accepted: false,
                    error: Some("approval attempt mismatch".to_string()),
                    attempts_left,
                },
            )
            .await?;
            if attempts_left == 0 {
                let _ = runtime.finish_usb_pairing_approval(&attempt_id);
                return Err("USB pairing approval attempts exhausted".to_string());
            }
            continue;
        }
        let proof_ok = verify_pairing_approval_proof(
            &approval_pin,
            &attempt_id,
            &challenge.salt_hex,
            &remote_pubkey_hex,
            &local_identity.static_pubkey_hex,
            &proof.proof_hex,
        )?;
        if !proof_ok {
            attempts_left = attempts_left.saturating_sub(1);
            send_pairing_approval_ack(
                transport,
                &mut noise,
                &MobileUsbPairingApprovalAck {
                    attempt_id: attempt_id.clone(),
                    accepted: false,
                    error: Some("approval PIN proof failed".to_string()),
                    attempts_left,
                },
            )
            .await?;
            if attempts_left == 0 {
                let _ = runtime.finish_usb_pairing_approval(&attempt_id);
                return Err("USB pairing approval attempts exhausted".to_string());
            }
            continue;
        }
        break;
    }

    match runtime.wait_usb_pairing_approval(&attempt_id).await? {
        UsbPairingApprovalDecision::Approved => {}
        UsbPairingApprovalDecision::Rejected => {
            let _ = runtime.finish_usb_pairing_approval(&attempt_id);
            send_pairing_approval_ack(
                transport,
                &mut noise,
                &MobileUsbPairingApprovalAck {
                    attempt_id,
                    accepted: false,
                    error: Some("phone rejected USB pairing approval".to_string()),
                    attempts_left,
                },
            )
            .await?;
            return Err("phone rejected USB pairing approval".to_string());
        }
        UsbPairingApprovalDecision::Expired | UsbPairingApprovalDecision::Missing => {
            let _ = runtime.finish_usb_pairing_approval(&attempt_id);
            send_pairing_approval_ack(
                transport,
                &mut noise,
                &MobileUsbPairingApprovalAck {
                    attempt_id,
                    accepted: false,
                    error: Some("USB pairing approval expired".to_string()),
                    attempts_left,
                },
            )
            .await?;
            return Err("USB pairing approval expired".to_string());
        }
    }

    runtime.finish_usb_pairing_approval(&attempt_id)?;
    if let Err(error) = persist_usb_mobile_pairing_blocking(
        store_path,
        PairedPeer {
            peer_id: hello.peer_id.clone(),
            label: hello.peer_label.clone(),
            relay_url: "usb://android-aoa".to_string(),
            peer_pubkey: remote_pubkey,
            client_pubkey: local_pubkey,
            client_privkey_hex: local_identity.static_privkey_hex.clone(),
            last_seen: now_secs(),
            paired_at: now_secs(),
            platform: hello.platform.clone(),
        },
    )
    .await
    {
        send_pairing_approval_ack(
            transport,
            &mut noise,
            &MobileUsbPairingApprovalAck {
                attempt_id,
                accepted: false,
                error: Some(error.clone()),
                attempts_left,
            },
        )
        .await?;
        return Err(error);
    }
    send_pairing_approval_ack(
        transport,
        &mut noise,
        &MobileUsbPairingApprovalAck {
            attempt_id,
            accepted: true,
            error: None,
            attempts_left,
        },
    )
    .await?;

    Ok((noise, hello.peer_id, hello.peer_label))
}

async fn persist_usb_mobile_pairing_blocking(
    store_path: PathBuf,
    peer: PairedPeer,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut store = PairedPeerStore::load(&store_path);
        store.upsert(peer)?;
        store.save()
    })
    .await
    .map_err(|error| format!("USB mobile pairing persistence task failed: {error}"))?
}

fn now_secs() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or_default()
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or_default()
}

fn random_pin() -> String {
    let pin = rand::random::<u32>() % 1_000_000;
    format!("{pin:06}")
}

fn random_salt_hex() -> String {
    let mut salt = [0_u8; 16];
    rand::thread_rng().fill_bytes(&mut salt);
    mobile_usb_hex_encode(&salt)
}

fn emit_usb_pairing_approval_required(attempt_id: &str) {
    #[cfg(target_os = "android")]
    {
        if let Some(app) = crate::mobile::android::app_handle() {
            let _ = app.emit(
                "mobile_usb_host_pairing_approval_required",
                serde_json::json!({ "attempt_id": attempt_id }),
            );
        }
        crate::mobile::android::notify_mobile_usb_approval_required("pairing", attempt_id);
    }

    #[cfg(not(target_os = "android"))]
    let _ = attempt_id;
}
