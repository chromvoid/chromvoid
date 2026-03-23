use tauri::{
    plugin::{Builder, TauriPlugin},
    Runtime,
};

#[cfg(target_os = "ios")]
mod mobile;

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("ios-push-bridge")
        .setup(|app, api| {
            #[cfg(target_os = "ios")]
            mobile::init(app, api)?;
            Ok(())
        })
        .build()
}
