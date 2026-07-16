use super::*;

impl MobileUsbController {
    pub(super) fn begin(
        &self,
        operation: MobileUsbOperationKind,
    ) -> Result<(MobileUsbOperationToken, Instant), MobileUsbError> {
        let operation_name = mobile_usb_operation_name(operation);
        let result = self.with_state(|state| {
            let state_from = state.session_state();
            let result = state.begin_operation(operation);
            (state_from, state.session_state(), result)
        });

        match result {
            Ok((state_from, state_to, Ok(token))) => {
                self.record_state_transition(state_from, state_to, None, None, None);
                log_operation_start(operation_name, None, None, None);
                Ok((token, Instant::now()))
            }
            Ok((_, _, Err(error))) | Err(error) => {
                self.observability
                    .record_operation(operation_name, "error", Some(error.code), 0);
                log_operation_finish(
                    operation_name,
                    "error",
                    Some(error.code),
                    0,
                    None,
                    None,
                    None,
                );
                Err(error)
            }
        }
    }

    pub(super) fn complete_or_fail<T>(
        &self,
        token: MobileUsbOperationToken,
        started_at: Instant,
        result: &Result<T, MobileUsbError>,
        host_id: Option<&HostId>,
        session_id: Option<&SessionId>,
        bridge_kind: Option<crate::mobile_usb::types::MobileUsbBridgeKind>,
    ) {
        let error_code = result.as_ref().err().map(|error| error.code);
        let transition = self.with_state(|state| {
            let state_from = state.session_state();
            if let Err(error) = result {
                state.fail_operation(token, error.code);
            } else {
                state.complete_operation(token);
            }
            (state_from, state.session_state())
        });
        if let Ok((state_from, state_to)) = transition {
            self.record_state_transition(state_from, state_to, error_code, host_id, session_id);
        }
        self.record_operation_result(
            mobile_usb_operation_name(token.kind),
            started_at,
            result,
            host_id,
            session_id,
            bridge_kind,
        );
    }

    pub(super) fn record_operation_result<T>(
        &self,
        operation: &str,
        started_at: Instant,
        result: &Result<T, MobileUsbError>,
        host_id: Option<&HostId>,
        session_id: Option<&SessionId>,
        bridge_kind: Option<crate::mobile_usb::types::MobileUsbBridgeKind>,
    ) {
        let duration_ms = started_at.elapsed().as_millis() as u64;
        let error_code = result.as_ref().err().map(|error| error.code);
        let outcome = if result.is_ok() { "success" } else { "error" };
        self.observability
            .record_operation(operation, outcome, error_code, duration_ms);
        log_operation_finish(
            operation,
            outcome,
            error_code,
            duration_ms,
            host_id,
            session_id,
            bridge_kind,
        );
    }

    pub(super) fn record_state_transition(
        &self,
        state_from: MobileUsbSessionState,
        state_to: MobileUsbSessionState,
        error_code: Option<MobileUsbErrorCode>,
        host_id: Option<&HostId>,
        session_id: Option<&SessionId>,
    ) {
        self.observability
            .record_state_transition(state_from, state_to);
        log_state_transition(state_from, state_to, error_code, host_id, session_id);
    }

    #[cfg(test)]
    pub(crate) fn observability_snapshot_for_test(&self) -> MobileUsbMetricsSnapshot {
        self.observability.snapshot()
    }

    pub(super) fn with_state<T>(
        &self,
        f: impl FnOnce(&mut MobileUsbStateMachine) -> T,
    ) -> Result<T, MobileUsbError> {
        let mut state = self.state.lock().map_err(|_| {
            MobileUsbError::new(
                MobileUsbErrorCode::InvalidState,
                "mobile USB controller state lock poisoned",
            )
        })?;
        Ok(f(&mut state))
    }
}
