use super::*;

impl MobileUsbController {
    pub(super) async fn connect_inner(
        &self,
        host_id: HostId,
        token: MobileUsbOperationToken,
    ) -> Result<MobileUsbStatus, MobileUsbError> {
        let timeline_trace_id = new_timeline_trace_id();
        let record = self
            .store
            .get(&host_id)?
            .ok_or_else(|| MobileUsbError::new(MobileUsbErrorCode::NotPaired, "host not paired"))?;
        if !record.is_connectable_pairing() {
            return Err(MobileUsbError::new(
                MobileUsbErrorCode::InvalidState,
                "mobile USB pairing record must be removed and paired again before connect",
            ));
        }
        let transport_context = TransportSessionContext::new()
            .with_trace_id(timeline_trace_id.clone())
            .with_host_id(record.host_id.clone())
            .with_bridge_kind(record.bridge_kind)
            .with_transport_type(TransportType::UsbMobile);
        tracing::info!(
            transport_family = MOBILE_USB_TRANSPORT_FAMILY,
            selected_transport = "usb_mobile",
            fallback_allowed = false,
            host_id = %redacted_identifier(Some(&record.host_id)),
            bridge_kind = bridge_kind_name(record.bridge_kind),
            "mobile_usb connect transport selected"
        );
        let client_privkey = self.secrets.load_client_key(&record.client_key_ref)?;
        let (transport, noise_transport) = self
            .open_connect_transport_with_retry(
                &record,
                &client_privkey,
                &timeline_trace_id,
                transport_context.clone(),
            )
            .await?;

        let record = self.store.touch_last_seen(&record.host_id, now_secs())?;
        self.start_data_plane(
            token,
            record,
            transport,
            noise_transport,
            timeline_trace_id,
            transport_context,
        )
        .await
    }

    async fn open_connect_transport_with_retry(
        &self,
        record: &MobileUsbPairedHostRecord,
        client_privkey: &[u8],
        timeline_trace_id: &str,
        transport_context: TransportSessionContext,
    ) -> Result<(Box<dyn RemoteTransport>, chromvoid_protocol::NoiseTransport), MobileUsbError>
    {
        let mut last_error = None;
        let retry_policy = connect_handshake_retry_policy();

        for attempt in 0..retry_policy.attempts {
            log_timeline_event(MobileUsbTimelineEvent {
                trace_id: Some(timeline_trace_id),
                owner: "desktop_client",
                phase: "open_stream",
                operation: "connect",
                host_id: Some(&record.host_id),
                bridge_kind: Some(record.bridge_kind),
                ..MobileUsbTimelineEvent::default()
            });
            let stream = match self.bridge.open_connect_stream(record).await {
                Ok(stream) => stream,
                Err(error) => {
                    log_timeline_event(MobileUsbTimelineEvent {
                        trace_id: Some(timeline_trace_id),
                        owner: "desktop_client",
                        phase: "open_stream",
                        operation: "connect",
                        host_id: Some(&record.host_id),
                        bridge_kind: Some(record.bridge_kind),
                        error_code: Some(error.code),
                        ..MobileUsbTimelineEvent::default()
                    });
                    if attempt + 1 < retry_policy.attempts
                        && error.code == MobileUsbErrorCode::NoAccessory
                    {
                        tracing::warn!(
                            attempt = attempt + 1,
                            next_attempt = attempt + 2,
                            error = %error.message,
                            "mobile_usb connect stream open found no accessory; retrying"
                        );
                        last_error = Some(error);
                        tokio::time::sleep(retry_policy.retry_delay).await;
                        continue;
                    }
                    return Err(error);
                }
            };
            let transport = MobileUsbRemoteTransport::with_context(
                stream,
                record.bridge_kind,
                transport_context.clone(),
            );
            let handshake_started_at = Instant::now();
            log_timeline_event(MobileUsbTimelineEvent {
                trace_id: Some(timeline_trace_id),
                owner: "desktop_client",
                phase: "handshake_ik",
                operation: "connect",
                host_id: Some(&record.host_id),
                bridge_kind: Some(record.bridge_kind),
                ..MobileUsbTimelineEvent::default()
            });
            let handshake_result = match tokio::time::timeout(
                retry_policy.timeout,
                crate::remote_data_plane::handshake_ik_over_transport_typed(
                    Box::new(transport) as Box<dyn RemoteTransport>,
                    client_privkey,
                    &record.peer_pubkey,
                ),
            )
            .await
            {
                Ok(Ok(result)) => Ok(result),
                Ok(Err(error)) => Err(mobile_usb_ik_handshake_error(error)),
                Err(_) => Err(MobileUsbError::new(
                    MobileUsbErrorCode::HandshakeFailed,
                    format!(
                        "mobile USB IK handshake timed out after {:?}",
                        retry_policy.timeout
                    ),
                )),
            };

            match handshake_result {
                Ok(result) => {
                    log_timeline_event(MobileUsbTimelineEvent {
                        trace_id: Some(timeline_trace_id),
                        owner: "desktop_client",
                        phase: "handshake_ik",
                        operation: "connect",
                        duration_ms: Some(handshake_started_at.elapsed().as_millis() as u64),
                        host_id: Some(&record.host_id),
                        bridge_kind: Some(record.bridge_kind),
                        ..MobileUsbTimelineEvent::default()
                    });
                    return Ok(result);
                }
                Err(error) => {
                    log_timeline_event(MobileUsbTimelineEvent {
                        trace_id: Some(timeline_trace_id),
                        owner: "desktop_client",
                        phase: "handshake_ik",
                        operation: "connect",
                        duration_ms: Some(handshake_started_at.elapsed().as_millis() as u64),
                        host_id: Some(&record.host_id),
                        bridge_kind: Some(record.bridge_kind),
                        error_code: Some(error.code),
                        ..MobileUsbTimelineEvent::default()
                    });
                    if attempt + 1 < retry_policy.attempts
                        && is_retryable_ik_handshake_error(&error)
                    {
                        tracing::warn!(
                            attempt = attempt + 1,
                            next_attempt = attempt + 2,
                            error = %error.message,
                            "mobile_usb connect IK handshake failed; reopening USB stream"
                        );
                        last_error = Some(error);
                        tokio::time::sleep(retry_policy.retry_delay).await;
                        continue;
                    }
                    return Err(error);
                }
            }
        }

        Err(last_error.unwrap_or_else(|| {
            MobileUsbError::new(
                MobileUsbErrorCode::HandshakeFailed,
                "mobile USB IK handshake failed before opening USB stream",
            )
        }))
    }

    pub(super) async fn start_data_plane(
        &self,
        token: MobileUsbOperationToken,
        record: MobileUsbPairedHostRecord,
        transport: Box<dyn RemoteTransport>,
        noise_transport: chromvoid_protocol::NoiseTransport,
        timeline_trace_id: String,
        transport_context: TransportSessionContext,
    ) -> Result<MobileUsbStatus, MobileUsbError> {
        if !self.with_state(|state| state.is_current_operation(token))? {
            return Err(MobileUsbError::new(
                MobileUsbErrorCode::InvalidState,
                "mobile USB connect operation was cancelled before data plane start",
            ));
        }
        tracing::info!(
            transport_family = MOBILE_USB_TRANSPORT_FAMILY,
            selected_transport = "usb_mobile",
            fallback_allowed = false,
            host_id = %redacted_identifier(Some(&record.host_id)),
            bridge_kind = bridge_kind_name(record.bridge_kind),
            "mobile_usb data plane start"
        );
        let handle_result = self
            .session_starter
            .start_session(MobileUsbStartSessionRequest {
                host: record.clone(),
                config: crate::remote_data_plane::RemoteIoTaskConfig {
                    transport,
                    noise_transport,
                    peer_features: crate::remote_data_plane::RemotePeerFeatures::new(),
                },
                metrics: TransportMetrics {
                    transport_type: Some(TransportType::UsbMobile),
                    ..TransportMetrics::default()
                },
                timeline_trace_id: timeline_trace_id.clone(),
            })
            .await;
        let handle = match handle_result {
            Ok(handle) => handle,
            Err(error) => {
                log_timeline_event(MobileUsbTimelineEvent {
                    trace_id: Some(&timeline_trace_id),
                    owner: "desktop_client",
                    phase: "client_data_plane_start",
                    operation: "start_session",
                    host_id: Some(&record.host_id),
                    bridge_kind: Some(record.bridge_kind),
                    error_code: Some(error.code),
                    ..MobileUsbTimelineEvent::default()
                });
                return Err(error);
            }
        };
        if !self.with_state(|state| state.is_current_operation(token))? {
            if let Err(error) = self.session_starter.stop_active_session() {
                tracing::warn!(
                    error = %error.message,
                    "mobile_usb failed to stop stale data plane after cancelled connect"
                );
            }
            return Err(MobileUsbError::new(
                MobileUsbErrorCode::InvalidState,
                "mobile USB connect operation was cancelled before session establishment",
            ));
        }
        transport_context.set_host_id(record.host_id.clone());
        transport_context.set_generation(handle.transport_session_generation);

        let (state_from, state_to, establish_result) = self.with_state(|state| {
            let state_from = state.session_state();
            let establish_result = state.establish_session(
                token,
                handle.session_id.clone(),
                MobileUsbHostView::from_record(&record, MobileUsbPairingState::Paired),
                handle.host_unlocked,
            );
            (state_from, state.session_state(), establish_result)
        })?;
        self.record_state_transition(
            state_from,
            state_to,
            establish_result.as_ref().err().map(|error| error.code),
            Some(&record.host_id),
            Some(&handle.session_id),
        );
        if let Err(error) = establish_result {
            if error.code == MobileUsbErrorCode::InvalidState {
                if let Err(stop_error) = self.session_starter.stop_active_session() {
                    tracing::warn!(
                        error = %stop_error.message,
                        "mobile_usb failed to stop data plane after rejected session establishment"
                    );
                }
            }
            return Err(error);
        }
        self.status_inner()
    }
}
