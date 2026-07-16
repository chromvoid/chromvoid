#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "lowercase")]
pub enum TextDirection {
    Ltr,
    Rtl,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "lowercase")]
pub enum PhysicalHorizontalEdge {
    Left,
    Right,
}

impl TextDirection {
    fn physical_start_edge(self) -> PhysicalHorizontalEdge {
        match self {
            Self::Ltr => PhysicalHorizontalEdge::Left,
            Self::Rtl => PhysicalHorizontalEdge::Right,
        }
    }

    fn normalize_inward_value(self, physical_x: f64) -> f64 {
        match self {
            Self::Ltr => physical_x,
            Self::Rtl => -physical_x,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeEdgeBackConfiguration {
    pub configuration_id: u64,
    pub direction: TextDirection,
    pub edge: PhysicalHorizontalEdge,
    pub enabled: bool,
}

fn configuration(
    configuration_id: u64,
    direction: TextDirection,
    enabled: bool,
) -> NativeEdgeBackConfiguration {
    NativeEdgeBackConfiguration {
        configuration_id,
        direction,
        edge: direction.physical_start_edge(),
        enabled,
    }
}

#[cfg(any(target_os = "ios", test))]
const REQUEST_PENDING: u8 = 0;
#[cfg(any(target_os = "ios", test))]
const REQUEST_RUNNING: u8 = 1;
#[cfg(any(target_os = "ios", test))]
const REQUEST_CANCELLED: u8 = 2;
#[cfg(any(target_os = "ios", test))]
const REQUEST_COMPLETED: u8 = 3;

#[cfg(any(target_os = "ios", test))]
struct NativeRequestOrder {
    latest: std::sync::atomic::AtomicU64,
    gate: std::sync::Mutex<()>,
}

#[cfg(any(target_os = "ios", test))]
impl NativeRequestOrder {
    const fn new() -> Self {
        Self {
            latest: std::sync::atomic::AtomicU64::new(0),
            gate: std::sync::Mutex::new(()),
        }
    }

    fn publish(&self, request_id: u64) -> Result<(), String> {
        let _gate = self
            .gate
            .lock()
            .map_err(|_| "edge-back request-order lock poisoned".to_owned())?;
        let latest = self.latest.load(std::sync::atomic::Ordering::Acquire);
        if request_id <= latest {
            return Err(format!(
                "edge-back request {request_id} is not newer than {latest}"
            ));
        }
        self.latest
            .store(request_id, std::sync::atomic::Ordering::Release);
        Ok(())
    }

    fn run_if_latest<T>(
        &self,
        request_id: u64,
        operation: impl FnOnce() -> Result<T, String>,
    ) -> Result<T, String> {
        let _gate = self
            .gate
            .lock()
            .map_err(|_| "edge-back request-order lock poisoned".to_owned())?;
        if self.latest.load(std::sync::atomic::Ordering::Acquire) != request_id {
            return Err(format!("edge-back request {request_id} was superseded"));
        }
        operation()
    }
}

#[cfg(target_os = "ios")]
static NATIVE_REQUEST_ORDER: NativeRequestOrder = NativeRequestOrder::new();

#[cfg(any(target_os = "ios", test))]
fn claim_request(lifecycle: &std::sync::atomic::AtomicU8) -> bool {
    lifecycle
        .compare_exchange(
            REQUEST_PENDING,
            REQUEST_RUNNING,
            std::sync::atomic::Ordering::AcqRel,
            std::sync::atomic::Ordering::Acquire,
        )
        .is_ok()
}

#[cfg(any(target_os = "ios", test))]
fn cancel_pending_request(lifecycle: &std::sync::atomic::AtomicU8) -> bool {
    lifecycle
        .compare_exchange(
            REQUEST_PENDING,
            REQUEST_CANCELLED,
            std::sync::atomic::Ordering::AcqRel,
            std::sync::atomic::Ordering::Acquire,
        )
        .is_ok()
}

#[cfg(any(target_os = "ios", test))]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum TimeoutDisposition {
    Cancelled,
    LeaveDisableScheduled,
    WaitForRunningCallback,
}

#[cfg(any(target_os = "ios", test))]
fn timeout_disposition(
    enabled: bool,
    lifecycle: &std::sync::atomic::AtomicU8,
) -> TimeoutDisposition {
    if enabled && cancel_pending_request(lifecycle) {
        return TimeoutDisposition::Cancelled;
    }
    if !enabled && lifecycle.load(std::sync::atomic::Ordering::Acquire) == REQUEST_PENDING {
        return TimeoutDisposition::LeaveDisableScheduled;
    }
    TimeoutDisposition::WaitForRunningCallback
}

#[cfg(target_os = "ios")]
mod native {
    use std::ffi::c_void;
    use std::sync::atomic::{AtomicU8, Ordering};
    use std::sync::{Arc, Mutex};
    use std::time::Duration;

    use objc2::ffi::{
        objc_getAssociatedObject, objc_setAssociatedObject, OBJC_ASSOCIATION_RETAIN_NONATOMIC,
    };
    use objc2::rc::Retained;
    use objc2::runtime::AnyObject;
    use objc2::sel;
    use objc2::{define_class, msg_send, AnyThread, DefinedClass, MainThreadOnly};
    use objc2_foundation::{MainThreadMarker, NSObject, NSObjectProtocol};
    use objc2_ui_kit::{
        UIGestureRecognizerState, UIImpactFeedbackGenerator, UIImpactFeedbackStyle, UIRectEdge,
        UIScreenEdgePanGestureRecognizer, UIView,
    };
    use tauri::{AppHandle, Emitter, Manager};

    use super::{
        claim_request, configuration, timeout_disposition, NativeEdgeBackConfiguration,
        TextDirection, TimeoutDisposition, NATIVE_REQUEST_ORDER, REQUEST_COMPLETED,
        REQUEST_PENDING,
    };

    const CONFIGURE_TIMEOUT: Duration = Duration::from_secs(5);
    const HAPTIC_TRIGGER_DISTANCE: f64 = 80.0;

    static EDGE_BACK_COORDINATOR_KEY: u8 = 0;

    #[derive(Debug, serde::Serialize, Clone)]
    #[serde(rename_all = "camelCase")]
    struct EdgeSwipeEvent {
        configuration_id: u64,
        direction: TextDirection,
        state: &'static str,
        distance: f64,
        velocity: f64,
        y: f64,
    }

    struct CoordinatorState {
        app: AppHandle,
        configuration: NativeEdgeBackConfiguration,
        haptic_fired: bool,
    }

    struct EdgeBackCoordinatorIvars {
        state: Mutex<CoordinatorState>,
        recognizer: Mutex<Option<Retained<UIScreenEdgePanGestureRecognizer>>>,
    }

    define_class!(
        #[unsafe(super(NSObject))]
        #[name = "ChromVoidEdgeBackCoordinator"]
        #[ivars = EdgeBackCoordinatorIvars]
        struct EdgeBackCoordinator;

        impl EdgeBackCoordinator {
            #[unsafe(method(handleEdgeBack:))]
            fn handle_edge_back(&self, gesture: &UIScreenEdgePanGestureRecognizer) {
                self.on_gesture(gesture);
            }
        }

        // SAFETY: NSObjectProtocol has no methods; EdgeBackCoordinator is an objc2 NSObject
        // subclass, so the protocol is structurally satisfied.
        unsafe impl NSObjectProtocol for EdgeBackCoordinator {}
    );

    impl EdgeBackCoordinator {
        fn new_with(
            app: AppHandle,
            configuration: NativeEdgeBackConfiguration,
            _mtm: MainThreadMarker,
        ) -> Retained<Self> {
            let this = Self::alloc();
            let this = this.set_ivars(EdgeBackCoordinatorIvars {
                state: Mutex::new(CoordinatorState {
                    app,
                    configuration,
                    haptic_fired: false,
                }),
                recognizer: Mutex::new(None),
            });
            // SAFETY: `this` is an allocated EdgeBackCoordinator with initialized ivars. Calling
            // NSObject's designated initializer is the standard objc2 subclass pattern.
            unsafe { msg_send![super(this), init] }
        }

        fn reconfigure(
            &self,
            view: &UIView,
            app: AppHandle,
            next_configuration: NativeEdgeBackConfiguration,
            mtm: MainThreadMarker,
        ) -> Result<(), String> {
            // Disabling a recognizer in Began/Changed transitions it to Cancelled synchronously.
            // Keep the previous state installed until this completes so that cancellation carries
            // the previous configuration ID and can never be mistaken for the new configuration.
            let previous_recognizer = self
                .ivars()
                .recognizer
                .lock()
                .map_err(|_| "edge-back recognizer lock poisoned".to_owned())?
                .take();
            if let Some(recognizer) = previous_recognizer {
                recognizer.setEnabled(false);
                view.removeGestureRecognizer(&recognizer);
            }

            {
                let mut state = self
                    .ivars()
                    .state
                    .lock()
                    .map_err(|_| "edge-back state lock poisoned".to_owned())?;
                state.app = app;
                state.configuration = next_configuration;
                state.haptic_fired = false;
            }

            if !next_configuration.enabled {
                return Ok(());
            }

            // SAFETY: the selector is implemented by this class and has the required single
            // UIGestureRecognizer argument. Both objects are confined to UIKit's main thread.
            let recognizer: Retained<UIScreenEdgePanGestureRecognizer> = unsafe {
                UIScreenEdgePanGestureRecognizer::initWithTarget_action(
                    UIScreenEdgePanGestureRecognizer::alloc(mtm),
                    Some(self),
                    Some(sel!(handleEdgeBack:)),
                )
            };
            recognizer.setEdges(match next_configuration.direction {
                TextDirection::Ltr => UIRectEdge::Left,
                TextDirection::Rtl => UIRectEdge::Right,
            });
            let mut recognizer_slot = self
                .ivars()
                .recognizer
                .lock()
                .map_err(|_| "edge-back recognizer lock poisoned".to_owned())?;
            view.addGestureRecognizer(&recognizer);
            *recognizer_slot = Some(recognizer);

            Ok(())
        }

        fn on_gesture(&self, gesture: &UIScreenEdgePanGestureRecognizer) {
            let state_name = match gesture.state() {
                UIGestureRecognizerState::Began => "began",
                UIGestureRecognizerState::Changed => "changed",
                UIGestureRecognizerState::Ended => "ended",
                UIGestureRecognizerState::Cancelled | UIGestureRecognizerState::Failed => {
                    "cancelled"
                }
                _ => return,
            };

            let Some(view) = gesture.view() else {
                tracing::warn!("edge_back: recognizer has no attached view");
                return;
            };
            let translation = gesture.translationInView(Some(&view));
            let velocity = gesture.velocityInView(Some(&view));
            let location = gesture.locationInView(Some(&view));

            let (app, active_configuration) = match self.ivars().state.lock() {
                Ok(state) => (state.app.clone(), state.configuration),
                Err(_) => {
                    tracing::warn!("edge_back: state lock poisoned");
                    return;
                }
            };
            if !active_configuration.enabled {
                return;
            }

            let distance = active_configuration
                .direction
                .normalize_inward_value(translation.x)
                .max(0.0);
            let normalized_velocity = active_configuration
                .direction
                .normalize_inward_value(velocity.x);

            match gesture.state() {
                UIGestureRecognizerState::Began => match self.ivars().state.lock() {
                    Ok(mut state) => state.haptic_fired = false,
                    Err(_) => tracing::warn!("edge_back: haptic state lock poisoned"),
                },
                UIGestureRecognizerState::Ended if distance >= HAPTIC_TRIGGER_DISTANCE => {
                    let should_fire = match self.ivars().state.lock() {
                        Ok(mut state) if !state.haptic_fired => {
                            state.haptic_fired = true;
                            true
                        }
                        Ok(_) => false,
                        Err(_) => {
                            tracing::warn!("edge_back: haptic state lock poisoned");
                            false
                        }
                    };
                    if should_fire {
                        if let Some(mtm) = MainThreadMarker::new() {
                            let generator = UIImpactFeedbackGenerator::initWithStyle(
                                mtm.alloc(),
                                UIImpactFeedbackStyle::Medium,
                            );
                            generator.impactOccurred();
                        }
                    }
                }
                _ => {}
            }

            let event = EdgeSwipeEvent {
                configuration_id: active_configuration.configuration_id,
                direction: active_configuration.direction,
                state: state_name,
                distance,
                velocity: normalized_velocity,
                y: location.y,
            };
            if let Err(error) = app.emit("edge-swipe:progress", &event) {
                tracing::warn!(%error, "edge_back: failed to emit gesture progress");
            }
        }
    }

    fn coordinator_key() -> *const c_void {
        std::ptr::addr_of!(EDGE_BACK_COORDINATOR_KEY).cast()
    }

    // SAFETY: callers run on UIKit's main thread and pass the live WKWebView as a UIView. The
    // associated object, when present, is always installed by `set_attached_coordinator` below.
    unsafe fn attached_coordinator(view: &UIView) -> Option<Retained<EdgeBackCoordinator>> {
        let view_ptr = (view as *const UIView).cast::<AnyObject>();
        let coordinator = unsafe { objc_getAssociatedObject(view_ptr, coordinator_key()) };
        unsafe { Retained::retain(coordinator.cast_mut().cast::<EdgeBackCoordinator>()) }
    }

    // SAFETY: callers run on UIKit's main thread. Association retention ties coordinator lifetime
    // to the WKWebView without a process-global owner or intentionally leaked reference.
    unsafe fn set_attached_coordinator(
        view: &UIView,
        coordinator: Option<&Retained<EdgeBackCoordinator>>,
    ) {
        let view_ptr = (view as *const UIView).cast_mut().cast::<AnyObject>();
        let coordinator_ptr = coordinator.map_or(std::ptr::null_mut(), |coordinator| {
            Retained::as_ptr(coordinator).cast_mut().cast::<AnyObject>()
        });
        unsafe {
            objc_setAssociatedObject(
                view_ptr,
                coordinator_key(),
                coordinator_ptr,
                OBJC_ASSOCIATION_RETAIN_NONATOMIC,
            );
        }
    }

    fn configure_on_main_thread(
        app: AppHandle,
        view: &UIView,
        enabled: bool,
        direction: TextDirection,
        request_id: u64,
        mtm: MainThreadMarker,
    ) -> Result<NativeEdgeBackConfiguration, String> {
        let next_configuration = configuration(request_id, direction, enabled);

        // SAFETY: WKWebView is a UIView subclass and this function only runs inside Tauri's
        // `with_webview` main-thread callback.
        let attached = unsafe { attached_coordinator(view) };
        if let Some(coordinator) = attached {
            coordinator.reconfigure(view, app, next_configuration, mtm)?;
            if !enabled {
                // SAFETY: see the function-level main-thread invariant above.
                unsafe { set_attached_coordinator(view, None) };
            }
        } else if enabled {
            let coordinator = EdgeBackCoordinator::new_with(app.clone(), next_configuration, mtm);
            coordinator.reconfigure(view, app, next_configuration, mtm)?;
            // SAFETY: see the function-level main-thread invariant above.
            unsafe { set_attached_coordinator(view, Some(&coordinator)) };
        }

        Ok(next_configuration)
    }

    pub async fn configure(
        app: AppHandle,
        enabled: bool,
        direction: TextDirection,
        request_id: u64,
    ) -> Result<NativeEdgeBackConfiguration, String> {
        NATIVE_REQUEST_ORDER.publish(request_id)?;
        let webview_window = app
            .get_webview_window("main")
            .ok_or_else(|| "edge-back main webview is unavailable".to_owned())?;
        let (sender, receiver) = tokio::sync::oneshot::channel();
        let lifecycle = Arc::new(AtomicU8::new(REQUEST_PENDING));
        let callback_lifecycle = lifecycle.clone();

        webview_window
            .with_webview(move |webview| {
                if !claim_request(&callback_lifecycle) {
                    return;
                }

                let result = NATIVE_REQUEST_ORDER.run_if_latest(request_id, || {
                    let mtm = MainThreadMarker::new()
                        .ok_or_else(|| "edge-back callback ran off the main thread".to_owned())?;
                    let webview_ptr = webview.inner() as *mut AnyObject;
                    if webview_ptr.is_null() {
                        return Err("edge-back WKWebView pointer is null".to_owned());
                    }

                    // SAFETY: `webview_ptr` is Tauri's live WKWebView, which is a UIView subclass.
                    // The callback is running on the UIKit main thread as proven by `mtm`.
                    let view = unsafe { Retained::retain(webview_ptr.cast::<UIView>()) }
                        .ok_or_else(|| "edge-back failed to retain WKWebView".to_owned())?;
                    // SAFETY: WKWebView implements this selector on iOS. Disabling WebKit's own
                    // history gesture keeps app routing as the single back-navigation owner.
                    unsafe {
                        let _: () =
                            msg_send![webview_ptr, setAllowsBackForwardNavigationGestures: false];
                    }

                    configure_on_main_thread(app, &view, enabled, direction, request_id, mtm)
                });
                callback_lifecycle.store(REQUEST_COMPLETED, Ordering::Release);
                let _ = sender.send(result);
            })
            .map_err(|error| format!("edge-back failed to schedule configuration: {error}"))?;

        let mut receiver = receiver;
        match tokio::time::timeout(CONFIGURE_TIMEOUT, &mut receiver).await {
            Ok(Ok(result)) => result,
            Ok(Err(_)) => Err("edge-back configuration callback was dropped".to_owned()),
            Err(_) => match timeout_disposition(enabled, &lifecycle) {
                TimeoutDisposition::Cancelled => {
                    Err("edge-back enable timed out before UIKit mutation".to_owned())
                }
                TimeoutDisposition::LeaveDisableScheduled => Err(
                    "edge-back disable timed out but remains scheduled on the UIKit thread"
                        .to_owned(),
                ),
                TimeoutDisposition::WaitForRunningCallback => receiver.await.map_err(|_| {
                    "edge-back running configuration callback was dropped".to_owned()
                })?,
            },
        }
    }
}

#[cfg(target_os = "ios")]
pub async fn configure(
    app: tauri::AppHandle,
    enabled: bool,
    direction: TextDirection,
    request_id: u64,
) -> Result<NativeEdgeBackConfiguration, String> {
    native::configure(app, enabled, direction, request_id).await
}

#[cfg(not(target_os = "ios"))]
pub async fn configure(
    _app: tauri::AppHandle,
    _enabled: bool,
    direction: TextDirection,
    request_id: u64,
) -> Result<NativeEdgeBackConfiguration, String> {
    // Android and desktop use the WebView touch implementation. A successful disabled
    // acknowledgement lets callers share one command contract without platform probes.
    Ok(configuration(request_id, direction, false))
}

#[cfg(test)]
mod tests {
    use std::sync::atomic::AtomicU8;

    use super::*;

    #[test]
    fn logical_start_maps_to_physical_edge() {
        assert_eq!(
            TextDirection::Ltr.physical_start_edge(),
            PhysicalHorizontalEdge::Left
        );
        assert_eq!(
            TextDirection::Rtl.physical_start_edge(),
            PhysicalHorizontalEdge::Right
        );
    }

    #[test]
    fn inward_values_are_direction_normalized() {
        assert_eq!(TextDirection::Ltr.normalize_inward_value(24.0), 24.0);
        assert_eq!(TextDirection::Rtl.normalize_inward_value(-24.0), 24.0);
    }

    #[test]
    fn configuration_uses_frontend_field_names() {
        let value = serde_json::to_value(configuration(42, TextDirection::Rtl, true)).unwrap();
        assert_eq!(
            value,
            serde_json::json!({
                "configurationId": 42,
                "direction": "rtl",
                "edge": "right",
                "enabled": true,
            })
        );
    }

    #[test]
    fn newer_request_prevents_an_older_callback_from_mutating() {
        let order = NativeRequestOrder::new();
        order.publish(100).unwrap();
        order.publish(101).unwrap();

        let accepted = order.run_if_latest(101, || Ok("rtl")).unwrap();
        let stale = order.run_if_latest(100, || Ok("ltr"));

        assert_eq!(accepted, "rtl");
        assert!(stale.unwrap_err().contains("superseded"));
    }

    #[test]
    fn newer_disable_request_supersedes_a_pending_enable() {
        let order = NativeRequestOrder::new();
        order.publish(200).unwrap();
        order.publish(201).unwrap();

        assert!(order.run_if_latest(200, || Ok(())).is_err());
        assert!(order.run_if_latest(201, || Ok(())).is_ok());
    }

    #[test]
    fn timeout_can_cancel_only_a_pending_callback() {
        let pending_enable = AtomicU8::new(REQUEST_PENDING);
        assert_eq!(
            timeout_disposition(true, &pending_enable),
            TimeoutDisposition::Cancelled
        );
        assert!(!claim_request(&pending_enable));

        let pending_disable = AtomicU8::new(REQUEST_PENDING);
        assert_eq!(
            timeout_disposition(false, &pending_disable),
            TimeoutDisposition::LeaveDisableScheduled
        );
        assert!(claim_request(&pending_disable));

        let running = AtomicU8::new(REQUEST_PENDING);
        assert!(claim_request(&running));
        assert_eq!(
            timeout_disposition(true, &running),
            TimeoutDisposition::WaitForRunningCallback
        );
    }
}
