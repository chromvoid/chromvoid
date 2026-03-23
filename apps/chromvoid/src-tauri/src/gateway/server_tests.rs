use super::*;

#[test]
fn gateway_bind_v4_is_loopback() {
    let addr: std::net::SocketAddr = GATEWAY_BIND_V4.parse().unwrap();
    assert!(
        addr.ip().is_loopback(),
        "Gateway MUST bind to loopback only"
    );
    assert_eq!(addr.port(), 8003);
}

#[test]
fn gateway_bind_v4_is_ipv4() {
    let addr: std::net::SocketAddr = GATEWAY_BIND_V4.parse().unwrap();
    assert!(addr.is_ipv4(), "Gateway should bind to IPv4 loopback");
}

#[test]
fn gateway_bind_v6_is_loopback() {
    let addr: std::net::SocketAddr = GATEWAY_BIND_V6.parse().unwrap();
    assert!(
        addr.ip().is_loopback(),
        "Gateway MUST bind to loopback only"
    );
    assert_eq!(addr.port(), 8003);
}

#[test]
fn gateway_bind_v6_is_ipv6() {
    let addr: std::net::SocketAddr = GATEWAY_BIND_V6.parse().unwrap();
    assert!(addr.is_ipv6(), "Gateway should bind to IPv6 loopback");
}
