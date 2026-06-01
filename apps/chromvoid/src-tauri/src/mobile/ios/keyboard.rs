#[cfg(target_os = "ios")]
mod native {
    use std::sync::Mutex;

    use objc2::rc::Retained;
    use objc2::runtime::AnyObject;
    use objc2::{define_class, msg_send, sel, AnyThread, DefinedClass};
    use objc2_core_foundation::CGRect;
    use objc2_foundation::{MainThreadMarker, NSObject, NSObjectProtocol};

    use tauri::{AppHandle, Emitter};
    use tracing::warn;

    #[derive(Debug, serde::Serialize, Clone)]
    #[serde(rename_all = "camelCase")]
    pub struct KeyboardVisibilityEvent {
        pub visible: bool,
        pub bottom_inset: Option<f64>,
    }

    struct KeyboardObserverIvars {
        app: Mutex<Option<AppHandle>>,
    }

    define_class!(
        #[unsafe(super(NSObject))]
        #[name = "ChromVoidKeyboardObserver"]
        #[ivars = KeyboardObserverIvars]
        struct KeyboardObserver;

        impl KeyboardObserver {
            #[unsafe(method(onKeyboardWillShow:))]
            fn on_keyboard_will_show(&self, notification: &NSObject) {
                self.emit_visibility(true, keyboard_bottom_inset(notification));
            }

            #[unsafe(method(onKeyboardWillHide:))]
            fn on_keyboard_will_hide(&self, _notification: &NSObject) {
                self.emit_visibility(false, Some(0.0));
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
            });
            // SAFETY: this is an alloc'd KeyboardObserver with ivars set; calling -[NSObject init] via
            // msg_send is the standard objc2 designated-initializer pattern.
            unsafe { msg_send![super(this), init] }
        }

        fn emit_visibility(&self, visible: bool, bottom_inset: Option<f64>) {
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
            let _: Result<(), _> = app.emit(
                "keyboard:visibility-changed",
                KeyboardVisibilityEvent {
                    visible,
                    bottom_inset,
                },
            );
        }
    }

    fn keyboard_bottom_inset(notification: &NSObject) -> Option<f64> {
        unsafe {
            let user_info: *const AnyObject = msg_send![notification, userInfo];
            if user_info.is_null() {
                return None;
            }

            let keyboard_frame_value: *const AnyObject =
                msg_send![user_info, objectForKey: UIKeyboardFrameEndUserInfoKey];
            if keyboard_frame_value.is_null() {
                return None;
            }

            let keyboard_frame: CGRect = msg_send![keyboard_frame_value, CGRectValue];
            let screen: *const AnyObject = msg_send![objc2::class!(UIScreen), mainScreen];
            if screen.is_null() {
                return Some(keyboard_frame.size.height.max(0.0).round());
            }

            let screen_bounds: CGRect = msg_send![screen, bounds];
            let screen_bottom = screen_bounds.origin.y + screen_bounds.size.height;
            let keyboard_top = keyboard_frame.origin.y;
            let inset = (screen_bottom - keyboard_top)
                .max(0.0)
                .min(screen_bounds.size.height)
                .round();

            Some(inset)
        }
    }

    // UIKit notification name constants (global NSString* in UIKit framework).
    extern "C" {
        static UIKeyboardWillShowNotification: *const AnyObject;
        static UIKeyboardWillHideNotification: *const AnyObject;
        static UIKeyboardFrameEndUserInfoKey: *const AnyObject;
    }

    pub fn setup(app: AppHandle) {
        if MainThreadMarker::new().is_none() {
            tracing::warn!("keyboard::setup called off main thread, skipping");
            return;
        }

        let Some(mtm) = MainThreadMarker::new() else {
            return;
        };

        let observer = KeyboardObserver::new_with(app, mtm);

        // SAFETY: defaultCenter is a +0 singleton; observer is retained for the app lifetime via
        // std::mem::forget below; UIKeyboardWill*Notification globals are 'static NSStrings provided by
        // UIKit.
        unsafe {
            // [NSNotificationCenter defaultCenter]
            let center: *const AnyObject =
                msg_send![objc2::class!(NSNotificationCenter), defaultCenter];

            // Register for UIKeyboardWillShowNotification
            let _: () = msg_send![
                center,
                addObserver: &*observer,
                selector: sel!(onKeyboardWillShow:),
                name: UIKeyboardWillShowNotification,
                object: std::ptr::null::<AnyObject>(),
            ];

            // Register for UIKeyboardWillHideNotification
            let _: () = msg_send![
                center,
                addObserver: &*observer,
                selector: sel!(onKeyboardWillHide:),
                name: UIKeyboardWillHideNotification,
                object: std::ptr::null::<AnyObject>(),
            ];
        }

        // Prevent observer from being deallocated — lives for the app lifetime.
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
