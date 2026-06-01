#[cfg(desktop)]
use tauri::Manager;

#[tauri::command]
pub(crate) fn frontend_splash_ready(app: tauri::AppHandle) -> Result<(), String> {
    #[cfg(desktop)]
    if let Some(window) = app.get_webview_window("main") {
        window.show().map_err(|error| error.to_string())?;
    }

    #[cfg(not(desktop))]
    let _ = app;

    Ok(())
}
