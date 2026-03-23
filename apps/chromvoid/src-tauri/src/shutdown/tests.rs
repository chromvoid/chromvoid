use super::*;
use std::sync::atomic::AtomicBool;
use std::time::Duration;

use crate::commands::volume_ops::volume_join_timeout;

#[test]
fn exit_request_intercepts_only_once() {
    let guard = AtomicBool::new(false);
    assert!(exit_request_should_intercept(&guard));
    assert!(!exit_request_should_intercept(&guard));
}

#[test]
fn volume_join_timeout_applies_budget_cap() {
    let timeout = volume_join_timeout(Duration::from_secs(12), Some(Duration::from_secs(5)));
    assert_eq!(timeout, Duration::from_secs(5));
}

#[test]
fn volume_join_timeout_still_clamps_without_budget() {
    let timeout = volume_join_timeout(Duration::from_secs(40), None);
    assert_eq!(timeout, Duration::from_secs(15));
}
