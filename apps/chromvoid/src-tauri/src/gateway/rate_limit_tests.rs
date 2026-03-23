use super::*;
use std::time::Duration;

#[test]
fn rate_limiter_allows_within_limit() {
    let mut rl = RateLimiter::new(5, 60_000);
    for _ in 0..5 {
        assert!(rl.check());
    }
    assert!(!rl.check());
}

#[test]
fn rate_limiter_resets_after_window() {
    let mut rl = RateLimiter::new(2, 1);
    assert!(rl.check());
    assert!(rl.check());
    assert!(!rl.check());
    std::thread::sleep(Duration::from_millis(5));
    assert!(rl.check());
}

#[test]
fn connection_tracker_enforces_limit() {
    let mut ct = ConnectionTracker::new();
    let ip: IpAddr = "127.0.0.1".parse().unwrap();
    for _ in 0..MAX_CONNECTIONS_PER_IP {
        assert!(ct.try_acquire(ip));
    }
    assert!(!ct.try_acquire(ip));
    ct.release(ip);
    assert!(ct.try_acquire(ip));
}

#[test]
fn connection_tracker_independent_ips() {
    let mut ct = ConnectionTracker::new();
    let ip1: IpAddr = "127.0.0.1".parse().unwrap();
    let ip2: IpAddr = "::1".parse().unwrap();
    for _ in 0..MAX_CONNECTIONS_PER_IP {
        assert!(ct.try_acquire(ip1));
    }
    assert!(!ct.try_acquire(ip1));
    assert!(ct.try_acquire(ip2));
}

#[test]
fn connection_tracker_release_below_zero() {
    let mut ct = ConnectionTracker::new();
    let ip: IpAddr = "127.0.0.1".parse().unwrap();
    ct.release(ip);
}

#[test]
fn security_constants_reasonable() {
    assert!(MAX_CONNECTIONS_PER_IP <= 10, "Too many connections per IP");
}
