pub(crate) mod catalog;
pub(crate) mod external_url;
#[cfg(desktop)]
pub(crate) mod host_path;
pub(crate) mod mobile_usb_host_approval_cmds;
pub(crate) mod passmanager;
pub(crate) mod startup;
pub(crate) mod vault;

#[cfg(desktop)]
pub(crate) mod env_runtime_cmds;
#[cfg(desktop)]
pub(crate) mod gateway_cmds;
#[cfg(desktop)]
pub(crate) mod mobile_usb_cmds;
#[cfg(desktop)]
pub(crate) mod mode_cmds;
pub(crate) mod network_cmds;
#[cfg(desktop)]
pub(crate) mod ssh_agent_cmds;
#[cfg(desktop)]
pub(crate) mod sync_cmds;
#[cfg(desktop)]
pub(crate) mod volume_ops;

pub(crate) fn ensure_main_window_caller(
    window_label: &str,
    command_name: &str,
) -> Result<(), String> {
    if window_label == "main" {
        return Ok(());
    }

    Err(format!("{command_name} is restricted to the main window"))
}
