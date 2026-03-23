use tauri::{
    menu::MenuBuilder, menu::SubmenuBuilder, tray::MouseButton, tray::MouseButtonState,
    tray::TrayIconBuilder, tray::TrayIconEvent,
};

use crate::helpers::toggle_main_window;

pub(crate) fn build_tray_and_menu(app: &tauri::App) -> tauri::Result<()> {
    let handle = app.handle();

    let menu = MenuBuilder::new(handle)
        .items(&[
            &SubmenuBuilder::new(handle, "File").quit().build()?,
            &SubmenuBuilder::new(handle, "Edit")
                .cut()
                .copy()
                .paste()
                .select_all()
                .build()?,
        ])
        .build()?;
    let _ = app.set_menu(menu);

    let tray_menu = MenuBuilder::new(handle)
        .text("tray_toggle", "Show/Hide")
        .separator()
        .text("tray_quit", "Quit")
        .build()?;
    let mut tray_builder = TrayIconBuilder::new()
        .menu(&tray_menu)
        .tooltip("ChromVoid")
        .on_menu_event(
            |app: &tauri::AppHandle, event: tauri::menu::MenuEvent| match event.id() {
                id if id == "tray_toggle" => toggle_main_window(app),
                id if id == "tray_quit" => {
                    app.exit(0);
                }
                _ => {}
            },
        )
        .on_tray_icon_event(|tray: &tauri::tray::TrayIcon, event: TrayIconEvent| {
            if let TrayIconEvent::Click {
                button,
                button_state,
                ..
            } = event
            {
                if button == MouseButton::Left && button_state == MouseButtonState::Up {
                    toggle_main_window(tray.app_handle());
                }
            }
        });
    if let Some(icon) = app.default_window_icon().cloned() {
        tray_builder = tray_builder.icon(icon);
    }
    let _tray = tray_builder.build(handle)?;

    Ok(())
}
