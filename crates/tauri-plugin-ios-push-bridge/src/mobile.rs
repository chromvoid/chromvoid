use serde::de::DeserializeOwned;
use tauri::{
    plugin::{mobile::PluginInvokeError, PluginApi},
    AppHandle, Runtime,
};

tauri::ios_plugin_binding!(init_plugin_ios_push_bridge);

pub fn init<R: Runtime, C: DeserializeOwned>(
    _app: &AppHandle<R>,
    api: PluginApi<R, C>,
) -> Result<(), PluginInvokeError> {
    let _ = api.register_ios_plugin(init_plugin_ios_push_bridge)?;
    Ok(())
}
