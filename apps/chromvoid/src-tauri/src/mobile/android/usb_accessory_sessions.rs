use std::os::fd::RawFd;

use tokio::sync::oneshot;

use super::usb_accessory_fd::{AndroidAccessoryDetachedFd, AndroidAccessoryFdCloseHandle};
use super::usb_accessory_host_failure::AndroidMobileUsbHostStopReason;
use super::usb_accessory_runtime::{
    AndroidMobileUsbAccessoryIdentity, AndroidMobileUsbAccessoryRuntimeState,
};
use crate::mobile_usb::SessionId;

pub(crate) struct AndroidMobileUsbAccessorySession {
    pub(crate) state: AndroidMobileUsbAccessorySessionState,
}

pub(crate) enum AndroidMobileUsbAccessorySessionState {
    Active {
        shutdown: Option<tokio::sync::oneshot::Sender<AndroidMobileUsbHostStopReason>>,
        fd_close: Option<AndroidAccessoryFdCloseHandle>,
    },
    PendingFd {
        identity: AndroidMobileUsbAccessoryIdentity,
        fd: AndroidAccessoryDetachedFd,
    },
}

pub(crate) fn pending_fd_session(
    identity: AndroidMobileUsbAccessoryIdentity,
    fd: RawFd,
) -> AndroidMobileUsbAccessorySession {
    AndroidMobileUsbAccessorySession {
        state: AndroidMobileUsbAccessorySessionState::PendingFd {
            identity,
            fd: AndroidAccessoryDetachedFd::new(fd),
        },
    }
}

pub(crate) fn active_session(
    shutdown: tokio::sync::oneshot::Sender<AndroidMobileUsbHostStopReason>,
) -> AndroidMobileUsbAccessorySession {
    AndroidMobileUsbAccessorySession {
        state: AndroidMobileUsbAccessorySessionState::Active {
            shutdown: Some(shutdown),
            fd_close: None,
        },
    }
}

impl AndroidMobileUsbAccessoryRuntimeState {
    pub(crate) fn stop_all_sessions(&self, reason: AndroidMobileUsbHostStopReason) -> usize {
        let session_ids = self
            .sessions
            .lock()
            .expect("mobile usb accessory sessions lock")
            .keys()
            .cloned()
            .collect::<Vec<_>>();

        session_ids
            .iter()
            .filter(|session_id| self.stop_session(session_id, reason))
            .count()
    }

    pub(crate) fn stop_session(
        &self,
        session_id: &str,
        reason: AndroidMobileUsbHostStopReason,
    ) -> bool {
        let session = self
            .sessions
            .lock()
            .expect("mobile usb accessory sessions lock")
            .remove(session_id);
        let Some(mut session) = session else {
            return false;
        };
        if let AndroidMobileUsbAccessorySessionState::Active {
            shutdown,
            #[cfg(unix)]
            fd_close,
        } = &mut session.state
        {
            let shutdown_delivered = shutdown
                .take()
                .map(|shutdown| shutdown.send(reason).is_ok())
                .unwrap_or(false);
            #[cfg(unix)]
            if let Some(fd_close) = fd_close.take() {
                // A vault lock has an authenticated terminal notification that
                // the host RPC loop must flush before closing the transport.
                // Keep the FD alive after delivering that shutdown signal; the
                // loop owns the stream and closes it immediately after the push.
                if reason != AndroidMobileUsbHostStopReason::VaultLocked || !shutdown_delivered {
                    fd_close.close(reason.as_str());
                }
            }
        }
        true
    }

    #[cfg(test)]
    pub(crate) fn active_session_count(&self) -> usize {
        self.sessions
            .lock()
            .expect("mobile usb accessory sessions lock")
            .len()
    }

    pub(super) fn reserve_active_session(
        &self,
        session_id: SessionId,
    ) -> Result<oneshot::Receiver<AndroidMobileUsbHostStopReason>, String> {
        let (shutdown_tx, shutdown_rx) = oneshot::channel();
        let mut sessions = self
            .sessions
            .lock()
            .expect("mobile usb accessory sessions lock");
        if sessions.contains_key(&session_id) {
            return Err(format!(
                "Android mobile USB accessory session already exists: {session_id}"
            ));
        }
        sessions.insert(session_id, active_session(shutdown_tx));
        Ok(shutdown_rx)
    }

    #[cfg(unix)]
    pub(super) fn reserve_pending_fd_session(
        &self,
        session_id: SessionId,
        identity: AndroidMobileUsbAccessoryIdentity,
        fd: RawFd,
    ) -> Result<(), String> {
        let mut sessions = self
            .sessions
            .lock()
            .expect("mobile usb accessory sessions lock");
        if sessions.contains_key(&session_id) {
            return Err(format!(
                "Android mobile USB accessory session already exists: {session_id}"
            ));
        }
        sessions.insert(session_id, pending_fd_session(identity, fd));
        Ok(())
    }

    pub(super) fn remove_reserved_session(&self, session_id: &str) {
        let session = self
            .sessions
            .lock()
            .expect("mobile usb accessory sessions lock")
            .remove(session_id);
        #[cfg(unix)]
        if let Some(mut session) = session {
            if let AndroidMobileUsbAccessorySessionState::Active {
                fd_close: Some(fd_close),
                ..
            } = &mut session.state
            {
                fd_close.close("session_removed");
            }
        }
    }

    #[cfg(unix)]
    pub(super) fn set_active_fd_close(
        &self,
        session_id: &str,
        close: AndroidAccessoryFdCloseHandle,
    ) -> Result<(), AndroidAccessoryFdCloseHandle> {
        let mut sessions = self
            .sessions
            .lock()
            .expect("mobile usb accessory sessions lock");
        let Some(session) = sessions.get_mut(session_id) else {
            return Err(close);
        };
        let AndroidMobileUsbAccessorySessionState::Active { fd_close, .. } = &mut session.state
        else {
            return Err(close);
        };
        *fd_close = Some(close);
        Ok(())
    }

    #[cfg(unix)]
    pub(super) fn pending_fd_session_count(&self) -> usize {
        self.sessions
            .lock()
            .expect("mobile usb accessory sessions lock")
            .values()
            .filter(|session| {
                matches!(
                    session.state,
                    AndroidMobileUsbAccessorySessionState::PendingFd { .. }
                )
            })
            .count()
    }

    #[cfg(unix)]
    pub(super) fn take_pending_fd_sessions(
        &self,
    ) -> Vec<(SessionId, AndroidMobileUsbAccessoryIdentity, RawFd)> {
        let mut sessions = self
            .sessions
            .lock()
            .expect("mobile usb accessory sessions lock");
        let pending_session_ids = sessions
            .iter()
            .filter_map(|(session_id, session)| match &session.state {
                AndroidMobileUsbAccessorySessionState::PendingFd { .. } => Some(session_id.clone()),
                AndroidMobileUsbAccessorySessionState::Active { .. } => None,
            })
            .collect::<Vec<_>>();

        pending_session_ids
            .into_iter()
            .filter_map(|session_id| {
                let session = sessions.remove(&session_id)?;
                match session.state {
                    AndroidMobileUsbAccessorySessionState::PendingFd { identity, fd } => {
                        Some((session_id, identity, fd.into_raw_fd()))
                    }
                    AndroidMobileUsbAccessorySessionState::Active { .. } => None,
                }
            })
            .collect()
    }
}
