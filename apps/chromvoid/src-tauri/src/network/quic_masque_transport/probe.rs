use std::net::SocketAddr;
use std::time::Duration;
use tokio::net::{lookup_host, UdpSocket};
use tokio::time::timeout;

use super::relay::ParsedRelay;

const UDP_PROBE_TIMEOUT: Duration = Duration::from_millis(350);

pub(super) async fn resolve_remote_addr(relay: &ParsedRelay) -> Result<SocketAddr, String> {
    let mut addrs = lookup_host((relay.server_name.as_str(), relay.port))
        .await
        .map_err(|e| format!("resolve {}:{}: {}", relay.server_name, relay.port, e))?;

    addrs
        .next()
        .ok_or_else(|| format!("no addresses resolved for {}", relay.server_name))
}

pub(super) async fn probe_udp(remote_addr: SocketAddr) -> Result<(), String> {
    let bind_addr: SocketAddr = if remote_addr.is_ipv4() {
        "0.0.0.0:0"
            .parse::<SocketAddr>()
            .map_err(|e| e.to_string())?
    } else {
        "[::]:0".parse::<SocketAddr>().map_err(|e| e.to_string())?
    };

    let socket = UdpSocket::bind(bind_addr)
        .await
        .map_err(|e| format!("udp bind: {}", e))?;

    timeout(UDP_PROBE_TIMEOUT, async {
        socket
            .connect(remote_addr)
            .await
            .map_err(|e| format!("udp connect: {}", e))?;
        socket
            .send(&[0x00])
            .await
            .map_err(|e| format!("udp send: {}", e))?;
        Ok::<(), String>(())
    })
    .await
    .map_err(|_| "udp probe timeout".to_string())??;

    Ok(())
}
