use super::*;

impl MobileUsbController {
    pub(super) async fn pair_inner(
        &self,
        request: MobileUsbPairRequest,
        token: MobileUsbOperationToken,
    ) -> Result<MobileUsbStatus, MobileUsbError> {
        let timeline_trace_id = new_timeline_trace_id();
        let transport_context = TransportSessionContext::new()
            .with_trace_id(timeline_trace_id.clone())
            .with_bridge_kind(request.bridge_kind)
            .with_transport_type(TransportType::UsbMobile);
        let keypair = noise_static_keypair()?;
        let (mut transport, mut noise_transport, peer_pubkey) = self
            .open_pair_transport_with_retry(
                &request,
                &keypair.private,
                &timeline_trace_id,
                transport_context.clone(),
            )
            .await?;

        let host_id = new_host_id();
        transport_context.set_host_id(host_id.clone());
        let (challenge, supports_graceful_cancel) = Self::begin_usb_pairing_with_remote(
            transport.as_mut(),
            &mut noise_transport,
            &host_id,
            &keypair.public,
            &peer_pubkey,
        )
        .await?;

        let approval = pairing_approval_view(&request, &challenge);
        let pending = PendingMobileUsbPairingSession {
            attempt_id: challenge.attempt_id.clone(),
            host_id,
            request,
            client_private_key: keypair.private,
            client_public_key: keypair.public,
            peer_pubkey,
            supports_graceful_cancel,
            challenge,
            transport,
            noise_transport,
            timeline_trace_id,
            transport_context,
        };
        {
            let mut pending_pairing = self.pending_pairing.lock().map_err(|_| {
                MobileUsbError::new(
                    MobileUsbErrorCode::InvalidState,
                    "mobile USB pending pairing lock poisoned",
                )
            })?;
            *pending_pairing = Some(pending);
        }
        let (state_from, state_to) = self.with_state(|state| {
            let state_from = state.session_state();
            state.require_pairing_approval(token, approval);
            (state_from, state.session_state())
        })?;
        self.record_state_transition(state_from, state_to, None, None, None);
        self.status_inner()
    }

    pub(super) async fn begin_usb_pairing_with_remote(
        transport: &mut dyn RemoteTransport,
        noise_transport: &mut chromvoid_protocol::NoiseTransport,
        host_id: &HostId,
        client_pubkey: &[u8],
        peer_pubkey: &[u8],
    ) -> Result<(MobileUsbPairingApprovalChallenge, bool), MobileUsbError> {
        let client_peer_id = format!("{host_id}:desktop");
        let hello = MobileUsbPairingHello {
            peer_id: client_peer_id,
            peer_label: desktop_usb_pairing_label(),
            peer_pubkey_hex: mobile_usb_hex_encode(client_pubkey),
            platform: "desktop".to_string(),
            capabilities: vec![USB_PAIRING_CANCEL_V1.to_string()],
        };
        send_mobile_usb_pairing_hello(transport, noise_transport, &hello)
            .await
            .map_err(mobile_usb_pairing_confirmation_error)?;
        let remote = recv_mobile_usb_pairing_hello(transport, noise_transport)
            .await
            .map_err(mobile_usb_pairing_confirmation_error)?;
        if remote.peer_pubkey_hex != mobile_usb_hex_encode(peer_pubkey) {
            return Err(mobile_usb_pairing_confirmation_error(
                "remote pairing hello pubkey mismatch".to_string(),
            ));
        }
        let challenge = recv_pairing_approval_challenge(transport, noise_transport)
            .await
            .map_err(mobile_usb_pairing_confirmation_error)?;
        if challenge.host_pubkey_hex != mobile_usb_hex_encode(peer_pubkey) {
            return Err(mobile_usb_pairing_confirmation_error(
                "remote approval challenge pubkey mismatch".to_string(),
            ));
        }
        let supports_graceful_cancel = remote
            .capabilities
            .iter()
            .any(|capability| capability == USB_PAIRING_CANCEL_V1);
        Ok((challenge, supports_graceful_cancel))
    }

    pub(super) async fn confirm_pairing_inner(
        &self,
        request: MobileUsbPairConfirmRequest,
        token: MobileUsbOperationToken,
    ) -> Result<MobileUsbStatus, MobileUsbError> {
        let mut pending = {
            let mut pending_pairing = self.pending_pairing.lock().map_err(|_| {
                MobileUsbError::new(
                    MobileUsbErrorCode::InvalidState,
                    "mobile USB pending pairing lock poisoned",
                )
            })?;
            pending_pairing.take().ok_or_else(|| {
                MobileUsbError::new(
                    MobileUsbErrorCode::InvalidState,
                    "no mobile USB pairing approval is pending",
                )
            })?
        };
        if pending.attempt_id != request.attempt_id {
            let mut pending_pairing = self.pending_pairing.lock().map_err(|_| {
                MobileUsbError::new(
                    MobileUsbErrorCode::InvalidState,
                    "mobile USB pending pairing lock poisoned",
                )
            })?;
            *pending_pairing = Some(pending);
            return Err(MobileUsbError::new(
                MobileUsbErrorCode::InvalidState,
                "mobile USB pairing approval attempt does not match pending attempt",
            ));
        }

        let proof_hex = pairing_approval_proof_hex(
            request.approval_pin.trim(),
            &pending.challenge.attempt_id,
            &pending.challenge.salt_hex,
            &mobile_usb_hex_encode(&pending.client_public_key),
            &pending.challenge.host_pubkey_hex,
        )
        .map_err(mobile_usb_pairing_confirmation_error)?;
        send_pairing_approval_proof(
            pending.transport.as_mut(),
            &mut pending.noise_transport,
            &MobileUsbPairingApprovalProof {
                attempt_id: pending.attempt_id.clone(),
                proof_hex,
                action: MobileUsbPairingApprovalAction::Confirm,
            },
        )
        .await
        .map_err(mobile_usb_pairing_confirmation_error)?;
        let ack =
            recv_pairing_approval_ack(pending.transport.as_mut(), &mut pending.noise_transport)
                .await
                .map_err(mobile_usb_pairing_confirmation_error)?;
        if !ack.accepted {
            if ack.attempts_left > 0 {
                pending.challenge.attempts_left = ack.attempts_left;
                let approval = pairing_approval_view(&pending.request, &pending.challenge);
                {
                    let mut pending_pairing = self.pending_pairing.lock().map_err(|_| {
                        MobileUsbError::new(
                            MobileUsbErrorCode::InvalidState,
                            "mobile USB pending pairing lock poisoned",
                        )
                    })?;
                    *pending_pairing = Some(pending);
                }

                let (state_from, state_to) = self.with_state(|state| {
                    let state_from = state.session_state();
                    state.require_pairing_approval(token, approval);
                    (state_from, state.session_state())
                })?;
                self.record_state_transition(
                    state_from,
                    state_to,
                    Some(MobileUsbErrorCode::PairingApprovalRejected),
                    None,
                    None,
                );
            }
            return Err(MobileUsbError::new(
                MobileUsbErrorCode::PairingApprovalRejected,
                ack.error
                    .unwrap_or_else(|| "mobile USB pairing approval rejected".to_string()),
            ));
        }

        let now = now_secs();
        let record = MobileUsbPairedHostRecord {
            host_id: pending.host_id,
            label: pending
                .request
                .label
                .clone()
                .unwrap_or_else(|| "Mobile USB host".to_string()),
            platform: pending.request.platform,
            bridge_kind: pending.request.bridge_kind,
            peer_pubkey: pending.peer_pubkey,
            client_pubkey: pending.client_public_key.clone(),
            client_key_ref: String::new(),
            usb_hint: pending.request.usb_hint,
            paired_at: now,
            last_seen: Some(now),
            pairing_confirmed_at: Some(now),
        };
        let record = commit_pairing_with_secret(
            self.store.as_ref(),
            self.secrets.as_ref(),
            record,
            &pending.client_private_key,
        )?;

        self.start_data_plane(
            token,
            record,
            pending.transport,
            pending.noise_transport,
            pending.timeline_trace_id,
            pending.transport_context,
        )
        .await
    }

    async fn open_pair_transport_with_retry(
        &self,
        request: &MobileUsbPairRequest,
        client_privkey: &[u8],
        timeline_trace_id: &str,
        transport_context: TransportSessionContext,
    ) -> Result<
        (
            Box<dyn RemoteTransport>,
            chromvoid_protocol::NoiseTransport,
            Vec<u8>,
        ),
        MobileUsbError,
    > {
        let mut last_error = None;
        let retry_policy = pair_handshake_retry_policy();

        for attempt in 0..retry_policy.attempts {
            log_timeline_event(MobileUsbTimelineEvent {
                trace_id: Some(timeline_trace_id),
                owner: "desktop_client",
                phase: "open_stream",
                operation: "pair",
                bridge_kind: Some(request.bridge_kind),
                ..MobileUsbTimelineEvent::default()
            });
            let stream = match self.bridge.open_pair_stream(request).await {
                Ok(stream) => stream,
                Err(error) => {
                    log_timeline_event(MobileUsbTimelineEvent {
                        trace_id: Some(timeline_trace_id),
                        owner: "desktop_client",
                        phase: "open_stream",
                        operation: "pair",
                        bridge_kind: Some(request.bridge_kind),
                        error_code: Some(error.code),
                        ..MobileUsbTimelineEvent::default()
                    });
                    return Err(error);
                }
            };
            let transport = MobileUsbRemoteTransport::with_context(
                stream,
                request.bridge_kind,
                transport_context.clone(),
            );
            let handshake_started_at = Instant::now();
            log_timeline_event(MobileUsbTimelineEvent {
                trace_id: Some(timeline_trace_id),
                owner: "desktop_client",
                phase: "handshake_xx",
                operation: "pair",
                bridge_kind: Some(request.bridge_kind),
                ..MobileUsbTimelineEvent::default()
            });
            let result = match tokio::time::timeout(
                retry_policy.timeout,
                crate::remote_data_plane::handshake_xx_over_transport_typed(
                    Box::new(transport) as Box<dyn RemoteTransport>,
                    client_privkey,
                ),
            )
            .await
            {
                Ok(result) => result,
                Err(_) => {
                    log_timeline_event(MobileUsbTimelineEvent {
                        trace_id: Some(timeline_trace_id),
                        owner: "desktop_client",
                        phase: "handshake_xx",
                        operation: "pair",
                        duration_ms: Some(handshake_started_at.elapsed().as_millis() as u64),
                        bridge_kind: Some(request.bridge_kind),
                        error_code: Some(MobileUsbErrorCode::HandshakeFailed),
                        ..MobileUsbTimelineEvent::default()
                    });
                    return Err(MobileUsbError::new(
                        MobileUsbErrorCode::HandshakeFailed,
                        format!(
                            "mobile USB XX handshake timed out after {:?}",
                            retry_policy.timeout
                        ),
                    ));
                }
            };

            match result {
                Ok(result) => {
                    log_timeline_event(MobileUsbTimelineEvent {
                        trace_id: Some(timeline_trace_id),
                        owner: "desktop_client",
                        phase: "handshake_xx",
                        operation: "pair",
                        duration_ms: Some(handshake_started_at.elapsed().as_millis() as u64),
                        bridge_kind: Some(request.bridge_kind),
                        ..MobileUsbTimelineEvent::default()
                    });
                    return Ok(result);
                }
                Err(error) => {
                    let retryable = (is_retryable_xx_first_write_error(&error)
                        || is_retryable_xx_msg2_stale_stream_error(&error))
                        && attempt + 1 < retry_policy.attempts;
                    let mobile_error = mobile_usb_xx_handshake_error(&error);
                    log_timeline_event(MobileUsbTimelineEvent {
                        trace_id: Some(timeline_trace_id),
                        owner: "desktop_client",
                        phase: "handshake_xx",
                        operation: "pair",
                        duration_ms: Some(handshake_started_at.elapsed().as_millis() as u64),
                        bridge_kind: Some(request.bridge_kind),
                        error_code: Some(mobile_error.code),
                        ..MobileUsbTimelineEvent::default()
                    });
                    if retryable {
                        tracing::warn!(
                            attempt = attempt + 1,
                            next_attempt = attempt + 2,
                            error = %error,
                            "mobile_usb pair XX handshake failed early; reopening USB stream"
                        );
                        last_error = Some(mobile_error);
                        tokio::time::sleep(retry_policy.retry_delay).await;
                        continue;
                    }
                    return Err(mobile_error);
                }
            }
        }

        Err(last_error.unwrap_or_else(|| {
            MobileUsbError::new(
                MobileUsbErrorCode::HandshakeFailed,
                "mobile USB XX handshake failed before opening USB stream",
            )
        }))
    }
}

fn pairing_approval_view(
    request: &MobileUsbPairRequest,
    challenge: &MobileUsbPairingApprovalChallenge,
) -> MobileUsbPairingApprovalView {
    MobileUsbPairingApprovalView {
        attempt_id: challenge.attempt_id.clone(),
        peer_label: request
            .label
            .clone()
            .unwrap_or_else(|| "Mobile USB host".to_string()),
        peer_fingerprint: challenge.peer_fingerprint.clone(),
        attempts_left: challenge.attempts_left,
        locked_until_ms: None,
        expires_at_ms: challenge.expires_at_ms,
    }
}
