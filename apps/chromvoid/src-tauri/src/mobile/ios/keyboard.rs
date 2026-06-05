#[derive(Debug, Clone, Copy, PartialEq)]
struct RectMetrics {
    origin_y: f64,
    height: f64,
}

impl RectMetrics {
    fn bottom(self) -> f64 {
        self.origin_y + self.height
    }
}

fn keyboard_bottom_overlap(screen: RectMetrics, keyboard: RectMetrics) -> f64 {
    if !screen.origin_y.is_finite()
        || !screen.height.is_finite()
        || !keyboard.origin_y.is_finite()
        || !keyboard.height.is_finite()
        || screen.height <= 0.0
        || keyboard.height <= 0.0
    {
        return 0.0;
    }

    let screen_bottom = screen.bottom();
    let keyboard_bottom = keyboard.bottom();
    if keyboard.origin_y >= screen_bottom || keyboard_bottom < screen_bottom {
        return 0.0;
    }

    (screen_bottom - keyboard.origin_y)
        .max(0.0)
        .min(screen.height)
        .round()
}

#[cfg(target_os = "ios")]
mod native {
    use super::{keyboard_bottom_overlap, RectMetrics};

    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::Mutex;

    use objc2::rc::Retained;
    use objc2::runtime::AnyObject;
    use objc2::{define_class, msg_send, sel, AnyThread, DefinedClass};
    use objc2_core_foundation::CGRect;
    use objc2_foundation::{MainThreadMarker, NSObject, NSObjectProtocol};
    use objc2_ui_kit::UIEdgeInsets;

    use tauri::{AppHandle, Emitter, Manager};
    use tracing::warn;

    const IOS_KEYBOARD_INSETS_EVENT: &str = "chromvoid:ios-keyboard-insets-changed";

    static KEYBOARD_SETUP_DONE: AtomicBool = AtomicBool::new(false);

    #[derive(Debug, serde::Serialize, Clone, PartialEq)]
    #[serde(rename_all = "camelCase")]
    pub struct KeyboardInsetsPayload {
        pub visible: bool,
        pub bottom_inset: f64,
        pub safe_area_top_inset: f64,
        pub safe_area_bottom_inset: f64,
        pub phase: &'static str,
        pub source: &'static str,
        pub viewport_mode: &'static str,
    }

    #[derive(Debug, Clone, Copy, Default)]
    struct SafeAreaInsets {
        top: f64,
        bottom: f64,
    }

    struct KeyboardObserverIvars {
        app: Mutex<Option<AppHandle>>,
        last_payload: Mutex<Option<KeyboardInsetsPayload>>,
    }

    define_class!(
        #[unsafe(super(NSObject))]
        #[name = "ChromVoidKeyboardObserver"]
        #[ivars = KeyboardObserverIvars]
        struct KeyboardObserver;

        impl KeyboardObserver {
            #[unsafe(method(onKeyboardWillShow:))]
            fn on_keyboard_will_show(&self, notification: &NSObject) {
                let bottom_inset = keyboard_bottom_inset(notification);
                self.emit_payload(keyboard_payload(bottom_inset, safe_area_insets()));
            }

            #[unsafe(method(onKeyboardWillHide:))]
            fn on_keyboard_will_hide(&self, _notification: &NSObject) {
                self.emit_payload(keyboard_payload(0.0, safe_area_insets()));
            }
        }

        // SAFETY: NSObjectProtocol has no methods; KeyboardObserver is an objc2 ObjC subclass of NSObject
        // so the protocol is structurally satisfied.
        unsafe impl NSObjectProtocol for KeyboardObserver {}
    );

    impl KeyboardObserver {
        fn new_with(app: AppHandle, _mtm: MainThreadMarker) -> Retained<Self> {
            let this = KeyboardObserver::alloc();
            let this = this.set_ivars(KeyboardObserverIvars {
                app: Mutex::new(Some(app)),
                last_payload: Mutex::new(None),
            });
            // SAFETY: this is an alloc'd KeyboardObserver with ivars set; calling -[NSObject init] via
            // msg_send is the standard objc2 designated-initializer pattern.
            unsafe { msg_send![super(this), init] }
        }

        fn emit_payload(&self, payload: KeyboardInsetsPayload) {
            let app_guard = match self.ivars().app.lock() {
                Ok(guard) => guard,
                Err(_) => {
                    warn!("keyboard: app ivar lock poisoned");
                    return;
                }
            };
            let Some(app) = app_guard.as_ref() else {
                return;
            };

            let mut last_payload = match self.ivars().last_payload.lock() {
                Ok(payload) => payload,
                Err(_) => {
                    warn!("keyboard: last payload mutex poisoned");
                    return;
                }
            };
            if last_payload.as_ref() == Some(&payload) {
                return;
            }
            *last_payload = Some(payload.clone());

            if dispatch_webview_payload(app, &payload) {
                return;
            }

            let _: Result<(), _> = app.emit("keyboard:visibility-changed", payload);
        }
    }

    fn keyboard_payload(bottom_inset: f64, safe_area: SafeAreaInsets) -> KeyboardInsetsPayload {
        let normalized_bottom = normalize_non_negative(bottom_inset);

        KeyboardInsetsPayload {
            visible: normalized_bottom > 0.0,
            bottom_inset: normalized_bottom,
            safe_area_top_inset: safe_area.top,
            safe_area_bottom_inset: safe_area.bottom,
            phase: "settled",
            source: "ios-native",
            viewport_mode: "native-resize",
        }
    }

    fn dispatch_webview_payload(app: &AppHandle, payload: &KeyboardInsetsPayload) -> bool {
        let Some(webview_window) = app.get_webview_window("main") else {
            warn!("keyboard: main webview window is unavailable");
            return false;
        };

        let payload_json = match serde_json::to_string(payload) {
            Ok(payload_json) => payload_json,
            Err(error) => {
                warn!("keyboard: failed to serialize payload: {error}");
                return false;
            }
        };
        let event_json = match serde_json::to_string(IOS_KEYBOARD_INSETS_EVENT) {
            Ok(event_json) => event_json,
            Err(error) => {
                warn!("keyboard: failed to serialize event name: {error}");
                return false;
            }
        };
        let script = format!(
            r#"(function () {{
  try {{
    const payload = {payload_json};
    window.__chromvoidIosKeyboardInsets = payload;
    window.dispatchEvent(new CustomEvent({event_json}, {{ detail: payload }}));
    return true;
  }} catch (_error) {{
    return false;
  }}
}})();"#
        );

        if let Err(error) = webview_window.eval(script) {
            warn!("keyboard: webview payload eval failed: {error}");
            return false;
        }

        true
    }

    fn keyboard_bottom_inset(notification: &NSObject) -> f64 {
        unsafe {
            let user_info: *const AnyObject = msg_send![notification, userInfo];
            if user_info.is_null() {
                return 0.0;
            }

            let keyboard_frame_value: *const AnyObject =
                msg_send![user_info, objectForKey: UIKeyboardFrameEndUserInfoKey];
            if keyboard_frame_value.is_null() {
                return 0.0;
            }

            let keyboard_frame: CGRect = msg_send![keyboard_frame_value, CGRectValue];
            let screen: *const AnyObject = msg_send![objc2::class!(UIScreen), mainScreen];
            if screen.is_null() {
                return normalize_non_negative(keyboard_frame.size.height);
            }

            let screen_bounds: CGRect = msg_send![screen, bounds];
            keyboard_bottom_overlap(
                RectMetrics {
                    origin_y: screen_bounds.origin.y,
                    height: screen_bounds.size.height,
                },
                RectMetrics {
                    origin_y: keyboard_frame.origin.y,
                    height: keyboard_frame.size.height,
                },
            )
        }
    }

    fn safe_area_insets() -> SafeAreaInsets {
        unsafe {
            let app: *const AnyObject = msg_send![objc2::class!(UIApplication), sharedApplication];
            if app.is_null() {
                return SafeAreaInsets::default();
            }

            let window: *const AnyObject = msg_send![app, keyWindow];
            let view: *const AnyObject = if window.is_null() {
                std::ptr::null()
            } else {
                let root_view_controller: *const AnyObject = msg_send![window, rootViewController];
                if root_view_controller.is_null() {
                    std::ptr::null()
                } else {
                    msg_send![root_view_controller, view]
                }
            };

            if view.is_null() {
                return SafeAreaInsets::default();
            }

            let insets: UIEdgeInsets = msg_send![view, safeAreaInsets];
            SafeAreaInsets {
                top: normalize_non_negative(insets.top),
                bottom: normalize_non_negative(insets.bottom),
            }
        }
    }

    fn normalize_non_negative(value: f64) -> f64 {
        if value.is_finite() && value >= 0.0 {
            value.round()
        } else {
            0.0
        }
    }

    extern "C" {
        static UIKeyboardWillShowNotification: *const AnyObject;
        static UIKeyboardWillHideNotification: *const AnyObject;
        static UIKeyboardFrameEndUserInfoKey: *const AnyObject;
    }

    pub fn setup(app: AppHandle) {
        if KEYBOARD_SETUP_DONE
            .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
            .is_err()
        {
            tracing::debug!("keyboard: NSNotificationCenter observer already attached");
            return;
        }

        let Some(mtm) = MainThreadMarker::new() else {
            KEYBOARD_SETUP_DONE.store(false, Ordering::SeqCst);
            tracing::warn!("keyboard::setup called off main thread, skipping");
            return;
        };

        let observer = KeyboardObserver::new_with(app, mtm);

        // SAFETY: defaultCenter is a +0 singleton; observer is retained for the app lifetime via
        // std::mem::forget below; UIKeyboardWill*Notification globals are 'static NSStrings provided by
        // UIKit.
        unsafe {
            let center: *const AnyObject =
                msg_send![objc2::class!(NSNotificationCenter), defaultCenter];

            let _: () = msg_send![
                center,
                addObserver: &*observer,
                selector: sel!(onKeyboardWillShow:),
                name: UIKeyboardWillShowNotification,
                object: std::ptr::null::<AnyObject>(),
            ];

            let _: () = msg_send![
                center,
                addObserver: &*observer,
                selector: sel!(onKeyboardWillHide:),
                name: UIKeyboardWillHideNotification,
                object: std::ptr::null::<AnyObject>(),
            ];
        }

        std::mem::forget(observer);

        tracing::info!("keyboard: NSNotificationCenter observer attached successfully");
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

#[cfg(test)]
mod tests {
    use super::{keyboard_bottom_overlap, RectMetrics};

    #[test]
    fn keyboard_overlap_uses_bottom_aligned_visible_frame() {
        let screen = RectMetrics {
            origin_y: 0.0,
            height: 844.0,
        };
        let keyboard = RectMetrics {
            origin_y: 522.0,
            height: 322.0,
        };

        assert_eq!(keyboard_bottom_overlap(screen, keyboard), 322.0);
    }

    #[test]
    fn keyboard_overlap_returns_zero_for_hidden_frame_at_screen_bottom() {
        let screen = RectMetrics {
            origin_y: 0.0,
            height: 844.0,
        };
        let keyboard = RectMetrics {
            origin_y: 844.0,
            height: 322.0,
        };

        assert_eq!(keyboard_bottom_overlap(screen, keyboard), 0.0);
    }

    #[test]
    fn keyboard_overlap_ignores_floating_non_bottom_frame() {
        let screen = RectMetrics {
            origin_y: 0.0,
            height: 844.0,
        };
        let keyboard = RectMetrics {
            origin_y: 320.0,
            height: 240.0,
        };

        assert_eq!(keyboard_bottom_overlap(screen, keyboard), 0.0);
    }

    #[test]
    fn keyboard_overlap_clamps_to_screen_height() {
        let screen = RectMetrics {
            origin_y: 0.0,
            height: 844.0,
        };
        let keyboard = RectMetrics {
            origin_y: -40.0,
            height: 900.0,
        };

        assert_eq!(keyboard_bottom_overlap(screen, keyboard), 844.0);
    }
}
