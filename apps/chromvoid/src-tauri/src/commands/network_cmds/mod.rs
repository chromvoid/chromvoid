mod helpers;
mod ios;
mod pairing;
#[cfg(any(desktop, test))]
mod peers;
mod server_profiles;

#[cfg(test)]
mod tests;

use crate::app_state::AppState;
use crate::network;

#[cfg(desktop)]
pub(crate) use ios::{desktop_connect_ios, desktop_pair_ios};
pub(crate) use ios::{
    get_local_device_identity, handle_ios_wake, ios_host_status, publish_ios_presence,
    start_ios_host_mode, stop_ios_host_mode,
};
pub(crate) use pairing::{mobile_acceptor_start, mobile_acceptor_status, mobile_acceptor_stop};
#[cfg(desktop)]
pub(crate) use pairing::{network_pair_cancel, network_pair_confirm, network_pair_start};
#[cfg(desktop)]
pub(crate) use peers::{
    network_connection_state, network_generate_room_id, network_list_paired_peers,
    network_remove_paired_peer, network_transport_metrics,
};
#[cfg(desktop)]
pub(crate) use server_profiles::{
    network_export_server_profile, network_import_server_profile,
    network_record_profile_endpoint_failure, network_rollback_profile_endpoint,
};
pub(crate) use server_profiles::{network_get_bootstrap_profile, network_list_server_profiles};
