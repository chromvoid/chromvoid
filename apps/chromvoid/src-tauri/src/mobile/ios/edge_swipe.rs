#[cfg(target_os = "ios")]
mod native {
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::Mutex;

    use objc2::rc::Retained;
    use objc2::sel;
    use objc2::{define_class, msg_send, AnyThread, DefinedClass, MainThreadOnly};
    use objc2_core_foundation::CGPoint;
    use objc2_foundation::{MainThreadMarker, NSObject, NSObjectProtocol};
    use objc2_ui_kit::{
        UIGestureRecognizerState, UIImpactFeedbackGenerator, UIImpactFeedbackStyle, UIRectEdge,
        UIScreenEdgePanGestureRecognizer, UIView,
    };

    use tauri::{AppHandle, Emitter, Manager};
    use tracing::warn;

    static EDGE_SWIPE_SETUP_DONE: AtomicBool = AtomicBool::new(false);

    #[derive(Debug, serde::Serialize, Clone)]
    pub struct EdgeSwipeEvent {
        pub state: &'static str,
        #[serde(rename = "deltaX")]
        pub delta_x: f64,
        pub y: f64,
        #[serde(rename = "velocityX")]
        pub velocity_x: f64,
    }

    struct SwipeTargetIvars {
        app: Mutex<Option<AppHandle>>,
        view: Mutex<Option<Retained<UIView>>>,
        haptic_fired: Mutex<bool>,
    }

    define_class!(
        #[unsafe(super(NSObject))]
        #[name = "ChromVoidEdgeSwipeTarget"]
        #[ivars = SwipeTargetIvars]
        struct SwipeTarget;

        impl SwipeTarget {
            #[unsafe(method(handleSwipe:))]
            fn handle_swipe(&self, gesture: &UIScreenEdgePanGestureRecognizer) {
                self.on_gesture(gesture);
            }
        }

        // SAFETY: NSObjectProtocol has no methods; SwipeTarget is an objc2 ObjC subclass of NSObject so
        // the protocol is structurally satisfied.
        unsafe impl NSObjectProtocol for SwipeTarget {}
    );

    impl SwipeTarget {
        fn new_with(
            app: AppHandle,
            view: Retained<UIView>,
            _mtm: MainThreadMarker,
        ) -> Retained<Self> {
            let this = SwipeTarget::alloc();
            let this = this.set_ivars(SwipeTargetIvars {
                app: Mutex::new(Some(app)),
                view: Mutex::new(Some(view)),
                haptic_fired: Mutex::new(false),
            });
            // SAFETY: this is an alloc'd SwipeTarget with ivars set; calling -[NSObject init] via msg_send
            // is the standard objc2 designated-initializer pattern.
            unsafe { msg_send![super(this), init] }
        }

        fn on_gesture(&self, gesture: &UIScreenEdgePanGestureRecognizer) {
            let app_guard = match self.ivars().app.lock() {
                Ok(guard) => guard,
                Err(_) => {
                    warn!("edge_swipe: app ivar lock poisoned");
                    return;
                }
            };
            let view_guard = match self.ivars().view.lock() {
                Ok(guard) => guard,
                Err(_) => {
                    warn!("edge_swipe: view ivar lock poisoned");
                    return;
                }
            };
            let (Some(app), Some(view)) = (app_guard.as_ref(), view_guard.as_ref()) else {
                return;
            };

            let state = gesture.state();
            let state_str = match state {
                UIGestureRecognizerState::Began => "began",
                UIGestureRecognizerState::Changed => "changed",
                UIGestureRecognizerState::Ended => "ended",
                UIGestureRecognizerState::Cancelled | UIGestureRecognizerState::Failed => {
                    "cancelled"
                }
                _ => return,
            };

            // SAFETY: gesture is a live UIScreenEdgePanGestureRecognizer borrow; view is a live UIView
            // borrow; translationInView: returns a CGPoint by value.
            let translation: CGPoint = unsafe { msg_send![gesture, translationInView: &**view] };
            // SAFETY: gesture is a live UIScreenEdgePanGestureRecognizer borrow; view is a live UIView
            // borrow; velocityInView: returns a CGPoint by value.
            let velocity: CGPoint = unsafe { msg_send![gesture, velocityInView: &**view] };
            // SAFETY: gesture is a live UIScreenEdgePanGestureRecognizer borrow; view is a live UIView
            // borrow; locationInView: returns a CGPoint by value.
            let location: CGPoint = unsafe { msg_send![gesture, locationInView: &**view] };

            let delta_x = translation.x.max(0.0);

            match state {
                UIGestureRecognizerState::Began => match self.ivars().haptic_fired.lock() {
                    Ok(mut haptic_fired) => *haptic_fired = false,
                    Err(_) => tracing::warn!("ios_edge_swipe: haptic state mutex poisoned"),
                },
                UIGestureRecognizerState::Ended => {
                    let should_fire = delta_x >= 80.0;
                    let already_fired = match self.ivars().haptic_fired.lock() {
                        Ok(haptic_fired) => *haptic_fired,
                        Err(_) => {
                            tracing::warn!("ios_edge_swipe: haptic state mutex poisoned");
                            true
                        }
                    };

                    if should_fire && !already_fired {
                        match self.ivars().haptic_fired.lock() {
                            Ok(mut haptic_fired) => *haptic_fired = true,
                            Err(_) => {
                                tracing::warn!("ios_edge_swipe: haptic state mutex poisoned")
                            }
                        }
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
                state: state_str,
                delta_x,
                y: location.y,
                velocity_x: velocity.x,
            };

            let _: Result<(), _> = app.emit("edge-swipe:progress", &event);
        }
    }

    /// Setup edge swipe gesture recognizer on the main WKWebView.
    ///
    /// Attaches a `UIScreenEdgePanGestureRecognizer` (left edge) to the webview
    /// and emits `edge-swipe:progress` events back to JS with gesture state.
    pub fn setup(app: AppHandle) {
        if EDGE_SWIPE_SETUP_DONE
            .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
            .is_err()
        {
            tracing::debug!("edge_swipe: native gesture setup already completed");
            return;
        }

        if MainThreadMarker::new().is_none() {
            EDGE_SWIPE_SETUP_DONE.store(false, Ordering::SeqCst);
            tracing::warn!("edge_swipe::setup called off main thread, skipping");
            return;
        }

        let Some(webview_window) = app.get_webview_window("main") else {
            EDGE_SWIPE_SETUP_DONE.store(false, Ordering::SeqCst);
            tracing::warn!("edge_swipe::setup: no 'main' webview window found");
            return;
        };

        let app_handle = app.clone();
        let attached = std::sync::Arc::new(AtomicBool::new(false));
        let attached_flag = attached.clone();

        let _ = webview_window.with_webview(move |webview| {
            // Re-obtain MainThreadMarker inside the closure (with_webview runs on main thread).
            let Some(mtm) = MainThreadMarker::new() else {
                return;
            };

            // SAFETY: runs on the main thread (mtm above); wv_ptr is the WKWebView from Tauri
            // (null-checked); WKWebView is a UIView subclass so the cast is sound; recognizer keeps
            // target alive via std::mem::forget for the app lifetime.
            unsafe {
                let wv_ptr = webview.inner() as *mut objc2::runtime::AnyObject;
                if wv_ptr.is_null() {
                    tracing::warn!("edge_swipe::setup: webview inner ptr is null");
                    return;
                }

                // Disable native WebKit back/forward swipe navigation so the
                // app can route edge-swipe consistently through its own
                // transient-state back contract first.
                let _: () = msg_send![wv_ptr, setAllowsBackForwardNavigationGestures: false];

                // WKWebView *is* a UIView subclass, so we can cast directly.
                let Some(view) = Retained::retain(wv_ptr as *mut UIView) else {
                    tracing::warn!("edge_swipe::setup: failed to retain webview UIView");
                    return;
                };

                // Create target for the gesture recognizer action.
                let target = SwipeTarget::new_with(app_handle.clone(), view.clone(), mtm);

                // Create UIScreenEdgePanGestureRecognizer with target + action.
                let recognizer: Retained<UIScreenEdgePanGestureRecognizer> = msg_send![
                    UIScreenEdgePanGestureRecognizer::alloc(mtm),
                    initWithTarget: &*target,
                    action: sel!(handleSwipe:),
                ];

                // Set edges to left.
                let _: () = msg_send![&recognizer, setEdges: UIRectEdge::Left];

                // Add recognizer to the view.
                view.addGestureRecognizer(&recognizer);

                // Prevent target from being deallocated by leaking a retained reference.
                // This is intentional — the gesture recognizer lives for the app lifetime.
                std::mem::forget(target);
                attached_flag.store(true, Ordering::SeqCst);

                tracing::info!(
                    "edge_swipe: UIScreenEdgePanGestureRecognizer attached successfully"
                );
            }
        });

        if !attached.load(Ordering::SeqCst) {
            EDGE_SWIPE_SETUP_DONE.store(false, Ordering::SeqCst);
        }
    }
}

#[cfg(target_os = "ios")]
pub fn setup(app: tauri::AppHandle) {
    native::setup(app);
}

#[cfg(not(target_os = "ios"))]
pub fn setup(_app: tauri::AppHandle) {
    // No-op on non-iOS platforms.
}
