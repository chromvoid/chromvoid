#[cfg(target_os = "ios")]
mod native {
    use std::sync::Mutex;

    use objc2::rc::Retained;
    use objc2::runtime::AnyObject;
    use objc2::{define_class, msg_send, sel, AnyThread, DefinedClass, MainThreadOnly};
    use objc2_foundation::{MainThreadMarker, NSObject, NSObjectProtocol};

    use tauri::{AppHandle, Emitter};

    #[derive(Debug, serde::Serialize, Clone)]
    pub struct KeyboardVisibilityEvent {
        pub visible: bool,
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
            fn on_keyboard_will_show(&self, _notification: &NSObject) {
                self.emit_visibility(true);
            }

            #[unsafe(method(onKeyboardWillHide:))]
            fn on_keyboard_will_hide(&self, _notification: &NSObject) {
                self.emit_visibility(false);
            }
        }

        unsafe impl NSObjectProtocol for KeyboardObserver {}
    );

    impl KeyboardObserver {
        fn new_with(app: AppHandle, _mtm: MainThreadMarker) -> Retained<Self> {
            let this = KeyboardObserver::alloc();
            let this = this.set_ivars(KeyboardObserverIvars {
                app: Mutex::new(Some(app)),
            });
            unsafe { msg_send![super(this), init] }
        }

        fn emit_visibility(&self, visible: bool) {
            let app_guard = self.ivars().app.lock().unwrap();
            let Some(app) = app_guard.as_ref() else {
                return;
            };
            let _: Result<(), _> = app.emit(
                "keyboard:visibility-changed",
                KeyboardVisibilityEvent { visible },
            );
        }
    }

    // UIKit notification name constants (global NSString* in UIKit framework).
    extern "C" {
        static UIKeyboardWillShowNotification: *const AnyObject;
        static UIKeyboardWillHideNotification: *const AnyObject;
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
