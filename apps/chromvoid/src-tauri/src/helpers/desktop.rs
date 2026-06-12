use tauri::Manager;

use std::ffi::OsStr;

pub(crate) fn show_main_window(app: &tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.set_focus();
    }
}

pub(crate) fn toggle_main_window(app: &tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        match w.is_visible() {
            Ok(true) => {
                let _ = w.hide();
            }
            _ => {
                show_main_window(app);
            }
        }
    }
}

pub(crate) fn open_path_with_system(path: &std::path::Path) -> Result<(), String> {
    spawn_system_open(path.as_os_str(), "file")
}

pub(crate) fn open_url_with_system(url: &str) -> Result<(), String> {
    spawn_system_open(OsStr::new(url), "URL")
}

fn spawn_system_open(target: &OsStr, kind: &str) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(target)
            .spawn()
            .map_err(|e| format!("Failed to open {kind}: {e}"))?;
        return Ok(());
    }

    #[cfg(target_os = "windows")]
    {
        return shell_execute_open(target, kind);
    }

    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(target)
            .spawn()
            .map_err(|e| format!("Failed to open {kind}: {e}"))?;
        return Ok(());
    }

    #[allow(unreachable_code)]
    {
        let _ = (target, kind);
        Err("Unsupported platform".to_string())
    }
}

#[cfg(target_os = "windows")]
fn shell_execute_open(target: &OsStr, kind: &str) -> Result<(), String> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::UI::Shell::ShellExecuteW;
    use windows_sys::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;

    fn wide_null(value: &OsStr) -> Vec<u16> {
        value.encode_wide().chain(std::iter::once(0)).collect()
    }

    let operation = wide_null(OsStr::new("open"));
    let file = wide_null(target);
    let result = unsafe {
        ShellExecuteW(
            std::ptr::null_mut(),
            operation.as_ptr(),
            file.as_ptr(),
            std::ptr::null(),
            std::ptr::null(),
            SW_SHOWNORMAL,
        )
    } as isize;

    if result <= 32 {
        return Err(format!(
            "Failed to open {kind}: ShellExecuteW error {result}"
        ));
    }

    Ok(())
}

pub(crate) fn now_secs() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}
