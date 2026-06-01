#[cfg(target_os = "ios")]
mod native {
    use std::path::PathBuf;
    use std::sync::Mutex;

    use objc2::rc::Retained;
    use objc2::runtime::AnyObject;
    use objc2::{define_class, msg_send, sel, AnyThread, DefinedClass, MainThreadOnly};
    use objc2_foundation::{MainThreadMarker, NSObject, NSObjectProtocol};

    use tauri::AppHandle;

    struct AppLifecycleObserverIvars {
        app: Mutex<Option<AppHandle>>,
        storage_root: Mutex<Option<PathBuf>>,
    }

    define_class!(
        #[unsafe(super(NSObject))]
        #[name = "ChromVoidAppLifecycleObserver"]
        #[ivars = AppLifecycleObserverIvars]
        struct AppLifecycleObserver;

        impl AppLifecycleObserver {
            #[unsafe(method(onApplicationDidBecomeActive:))]
            fn on_application_did_become_active(&self, _notification: &NSObject) {
                self.handle_foreground();
            }

            #[unsafe(method(onApplicationDidEnterBackground:))]
            fn on_application_did_enter_background(&self, _notification: &NSObject) {
                self.handle_background();
            }
        }

        // SAFETY: NSObjectProtocol has no methods; AppLifecycleObserver is an objc2 ObjC subclass of
        // NSObject so the protocol is structurally satisfied.
        unsafe impl NSObjectProtocol for AppLifecycleObserver {}
    );

    impl AppLifecycleObserver {
        fn new_with(
            app: AppHandle,
            storage_root: PathBuf,
            _mtm: MainThreadMarker,
        ) -> Retained<Self> {
            let this = AppLifecycleObserver::alloc();
            let this = this.set_ivars(AppLifecycleObserverIvars {
                app: Mutex::new(Some(app)),
                storage_root: Mutex::new(Some(storage_root)),
            });
            // SAFETY: this is an alloc'd AppLifecycleObserver with ivars set; calling -[NSObject init] via
            // msg_send is the standard objc2 designated-initializer pattern.
            unsafe { msg_send![super(this), init] }
        }

        fn handle_foreground(&self) {
            let app = match self.ivars().app.lock() {
                Ok(guard) => guard.clone(),
                Err(_) => {
                    tracing::warn!("ios_app_lifecycle: app handle mutex poisoned");
                    None
                }
            };
            let storage_root = match self.ivars().storage_root.lock() {
                Ok(guard) => guard.clone(),
                Err(_) => {
                    tracing::warn!("ios_app_lifecycle: storage root mutex poisoned");
                    None
                }
            };

            let (Some(app), Some(storage_root)) = (app, storage_root) else {
                return;
            };

            crate::network::ios_lifecycle::handle_foreground_resume(app, storage_root);
        }

        fn handle_background(&self) {
            let app = match self.ivars().app.lock() {
                Ok(guard) => guard.clone(),
                Err(_) => {
                    tracing::warn!("ios_app_lifecycle: app handle mutex poisoned");
                    None
                }
            };
            crate::network::ios_lifecycle::handle_background_suspend(app.as_ref());
        }
    }

    extern "C" {
        static UIApplicationDidBecomeActiveNotification: *const AnyObject;
        static UIApplicationDidEnterBackgroundNotification: *const AnyObject;
    }

    pub fn setup(app: AppHandle, storage_root: PathBuf) {
        if MainThreadMarker::new().is_none() {
            tracing::warn!("app_lifecycle::setup called off main thread, skipping");
            return;
        }

        let Some(mtm) = MainThreadMarker::new() else {
            return;
        };

        let observer = AppLifecycleObserver::new_with(app, storage_root, mtm);

        // SAFETY: defaultCenter is a +0 singleton; observer is retained for the app lifetime via
        // std::mem::forget below; UIApplicationDid*Notification globals are 'static NSStrings provided
        // by UIKit.
        unsafe {
            let center: *const AnyObject =
                msg_send![objc2::class!(NSNotificationCenter), defaultCenter];

            let _: () = msg_send![
                center,
                addObserver: &*observer,
                selector: sel!(onApplicationDidBecomeActive:),
                name: UIApplicationDidBecomeActiveNotification,
                object: std::ptr::null::<AnyObject>(),
            ];

            let _: () = msg_send![
                center,
                addObserver: &*observer,
                selector: sel!(onApplicationDidEnterBackground:),
                name: UIApplicationDidEnterBackgroundNotification,
                object: std::ptr::null::<AnyObject>(),
            ];
        }

        std::mem::forget(observer);

        tracing::info!("app_lifecycle: UIApplication observers attached successfully");
    }
}

#[cfg(target_os = "ios")]
pub fn setup(app: tauri::AppHandle, storage_root: std::path::PathBuf) {
    native::setup(app, storage_root);
}

#[cfg(not(target_os = "ios"))]
pub fn setup(_app: tauri::AppHandle, _storage_root: std::path::PathBuf) {
    // No-op on non-iOS platforms.
}
