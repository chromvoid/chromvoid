use std::ptr::NonNull;
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant};

use objc2::runtime::AnyClass;
use objc2_authentication_services::{
    ASCredentialIdentityStore, ASCredentialIdentityStoreState, ASSettingsHelper,
};
use tauri::AppHandle;
use tokio::sync::oneshot;

const STATUS_TIMEOUT: Duration = Duration::from_secs(5);
const SETTINGS_TIMEOUT: Duration = Duration::from_secs(120);
const ENABLE_REQUEST_COOLDOWN: Duration = Duration::from_secs(10);

#[derive(Debug, Default)]
struct EnableRequestGate {
    active_token: Option<u64>,
    next_token: u64,
    next_allowed_at: Option<Instant>,
}

impl EnableRequestGate {
    fn reserve(&mut self, now: Instant) -> Result<u64, &'static str> {
        if self.active_token.is_some() {
            return Err("A Credential Provider enable request is already in progress");
        }
        if self
            .next_allowed_at
            .is_some_and(|allowed_at| now < allowed_at)
        {
            return Err("Wait 10 seconds before requesting Credential Provider access again");
        }
        self.next_token = self.next_token.wrapping_add(1);
        self.active_token = Some(self.next_token);
        Ok(self.next_token)
    }

    fn complete(&mut self, token: u64, now: Instant) {
        if self.active_token == Some(token) {
            self.active_token = None;
            self.next_allowed_at = Some(now + ENABLE_REQUEST_COOLDOWN);
        }
    }

    fn cancel(&mut self, token: u64) {
        if self.active_token == Some(token) {
            self.active_token = None;
        }
    }
}

fn enable_request_gate() -> &'static Mutex<EnableRequestGate> {
    static GATE: OnceLock<Mutex<EnableRequestGate>> = OnceLock::new();
    GATE.get_or_init(|| Mutex::new(EnableRequestGate::default()))
}

fn reserve_enable_request() -> Result<u64, String> {
    enable_request_gate()
        .lock()
        .map_err(|_| "Credential Provider enable request state is unavailable".to_string())?
        .reserve(Instant::now())
        .map_err(str::to_string)
}

fn complete_enable_request(token: u64) {
    if let Ok(mut gate) = enable_request_gate().lock() {
        gate.complete(token, Instant::now());
    }
}

fn cancel_enable_request(token: u64) {
    if let Ok(mut gate) = enable_request_gate().lock() {
        gate.cancel(token);
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum SettingsAction {
    RequestEnable,
    OpenSettings,
    Unavailable,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum SettingsOutcome {
    EnableRequested { enabled: bool },
    SettingsOpened,
}

fn choose_action(
    provider_enabled: bool,
    can_request_enable: bool,
    can_open_settings: bool,
) -> SettingsAction {
    if !provider_enabled && can_request_enable {
        SettingsAction::RequestEnable
    } else if can_open_settings {
        SettingsAction::OpenSettings
    } else {
        SettingsAction::Unavailable
    }
}

fn settings_capabilities() -> (bool, bool) {
    let Some(class) = AnyClass::get(c"ASSettingsHelper") else {
        return (false, false);
    };
    let metaclass = class.metaclass();
    let can_request_enable = objc2::available!(macos = 15.0)
        && metaclass.responds_to(objc2::sel!(
            requestToTurnOnCredentialProviderExtensionWithCompletionHandler:
        ));
    let can_open_settings = objc2::available!(macos = 14.0)
        && metaclass.responds_to(objc2::sel!(
            openCredentialProviderAppSettingsWithCompletionHandler:
        ));
    (can_request_enable, can_open_settings)
}

pub(crate) fn settings_action(provider_enabled: bool) -> &'static str {
    let (can_request_enable, can_open_settings) = settings_capabilities();
    match choose_action(provider_enabled, can_request_enable, can_open_settings) {
        SettingsAction::RequestEnable => "request_enable",
        SettingsAction::OpenSettings => "open_system_autofill",
        SettingsAction::Unavailable => "show_instructions",
    }
}

pub(crate) async fn credential_provider_enabled() -> Result<bool, String> {
    let (sender, receiver) = oneshot::channel();
    {
        let sender = Mutex::new(Some(sender));
        let completion =
            block2::RcBlock::new(move |state: NonNull<ASCredentialIdentityStoreState>| {
                let enabled = unsafe { state.as_ref().isEnabled() };
                if let Some(sender) = sender.lock().ok().and_then(|mut slot| slot.take()) {
                    let _ = sender.send(enabled);
                }
            });

        unsafe {
            ASCredentialIdentityStore::sharedStore()
                .getCredentialIdentityStoreStateWithCompletion(&completion);
        }
    }

    match tokio::time::timeout(STATUS_TIMEOUT, receiver).await {
        Ok(Ok(enabled)) => Ok(enabled),
        Ok(Err(_)) => Err("Credential provider status callback was dropped".to_string()),
        Err(_) => Err("Credential provider status query timed out".to_string()),
    }
}

fn send_once(
    sender: &Mutex<Option<oneshot::Sender<Result<SettingsOutcome, String>>>>,
    result: Result<SettingsOutcome, String>,
) {
    if let Some(sender) = sender.lock().ok().and_then(|mut slot| slot.take()) {
        let _ = sender.send(result);
    }
}

pub(crate) async fn open_or_request_settings(app: &AppHandle) -> Result<SettingsOutcome, String> {
    let provider_enabled = credential_provider_enabled().await?;
    let (can_request_enable, can_open_settings) = settings_capabilities();
    let action = choose_action(provider_enabled, can_request_enable, can_open_settings);
    if action == SettingsAction::Unavailable {
        return Err("Credential Provider settings require macOS 14 or later".to_string());
    }
    let enable_request_token = (action == SettingsAction::RequestEnable)
        .then(reserve_enable_request)
        .transpose()?;

    let (sender, receiver) = oneshot::channel();
    let sender = Arc::new(Mutex::new(Some(sender)));
    let schedule_result = app.run_on_main_thread(move || match action {
        SettingsAction::RequestEnable => {
            let token = enable_request_token.expect("enable request must have a reservation");
            let completion_sender = sender.clone();
            let completion = block2::RcBlock::new(move |enabled: objc2::runtime::Bool| {
                complete_enable_request(token);
                send_once(
                    &completion_sender,
                    Ok(SettingsOutcome::EnableRequested {
                        enabled: enabled.as_bool(),
                    }),
                );
            });
            unsafe {
                ASSettingsHelper::requestToTurnOnCredentialProviderExtensionWithCompletionHandler(
                    &completion,
                );
            }
        }
        SettingsAction::OpenSettings => {
            let completion_sender = sender.clone();
            let completion = block2::RcBlock::new(move |error: *mut objc2_foundation::NSError| {
                let result = if error.is_null() {
                    Ok(SettingsOutcome::SettingsOpened)
                } else {
                    Err("macOS failed to open AutoFill settings".to_string())
                };
                send_once(&completion_sender, result);
            });
            unsafe {
                ASSettingsHelper::openCredentialProviderAppSettingsWithCompletionHandler(Some(
                    &completion,
                ));
            }
        }
        SettingsAction::Unavailable => unreachable!(),
    });
    if let Err(error) = schedule_result {
        if let Some(token) = enable_request_token {
            cancel_enable_request(token);
        }
        return Err(format!(
            "Failed to schedule Credential Provider settings: {error}"
        ));
    }

    let result = match tokio::time::timeout(SETTINGS_TIMEOUT, receiver).await {
        Ok(Ok(result)) => result,
        Ok(Err(_)) => Err("Credential Provider settings callback was dropped".to_string()),
        Err(_) => Err("Credential Provider settings request timed out".to_string()),
    };
    if result.is_err() {
        if let Some(token) = enable_request_token {
            cancel_enable_request(token);
        }
    }
    result
}

#[cfg(test)]
mod tests {
    use std::time::{Duration, Instant};

    use super::{choose_action, EnableRequestGate, SettingsAction};

    #[test]
    fn disabled_provider_prefers_direct_enable_request() {
        assert_eq!(
            choose_action(false, true, true),
            SettingsAction::RequestEnable
        );
    }

    #[test]
    fn enabled_provider_opens_settings_instead_of_repeating_enable_request() {
        assert_eq!(
            choose_action(true, true, true),
            SettingsAction::OpenSettings
        );
    }

    #[test]
    fn macos_fourteen_falls_back_to_settings() {
        assert_eq!(
            choose_action(false, false, true),
            SettingsAction::OpenSettings
        );
    }

    #[test]
    fn unavailable_api_reports_manual_instructions() {
        assert_eq!(
            choose_action(false, false, false),
            SettingsAction::Unavailable
        );
    }

    #[test]
    fn enable_request_gate_serializes_requests_and_enforces_cooldown() {
        let now = Instant::now();
        let mut gate = EnableRequestGate::default();

        let token = gate.reserve(now).unwrap();
        assert_eq!(
            gate.reserve(now),
            Err("A Credential Provider enable request is already in progress")
        );

        gate.complete(token, now);
        assert_eq!(
            gate.reserve(now + Duration::from_secs(9)),
            Err("Wait 10 seconds before requesting Credential Provider access again")
        );
        assert!(gate.reserve(now + Duration::from_secs(10)).is_ok());
    }

    #[test]
    fn cancelled_enable_request_can_be_retried_immediately() {
        let now = Instant::now();
        let mut gate = EnableRequestGate::default();

        let token = gate.reserve(now).unwrap();
        gate.cancel(token);

        assert!(gate.reserve(now).is_ok());
    }

    #[test]
    fn late_completion_cannot_change_a_new_request() {
        let now = Instant::now();
        let mut gate = EnableRequestGate::default();
        let expired_token = gate.reserve(now).unwrap();
        gate.cancel(expired_token);
        let active_token = gate.reserve(now).unwrap();

        gate.complete(expired_token, now);

        assert_eq!(
            gate.reserve(now),
            Err("A Credential Provider enable request is already in progress")
        );
        gate.complete(active_token, now);
    }
}
