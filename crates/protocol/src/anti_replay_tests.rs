use super::*;

#[test]
fn first_message_accepted() {
    let mut ar = AntiReplay::new();
    assert!(ar.check(1).is_ok());
}

#[test]
fn monotonic_enforcement() {
    let mut ar = AntiReplay::new();
    assert!(ar.check(5).is_ok());
    assert!(ar.check(10).is_ok());
    assert_eq!(ar.check(7).unwrap_err(), "replay");
    assert_eq!(ar.check(10).unwrap_err(), "replay");
}

#[test]
fn duplicate_detection() {
    let mut ar = AntiReplay::new();
    assert!(ar.check(1).is_ok());
    assert!(ar.check(2).is_ok());
    assert_eq!(ar.check(1).unwrap_err(), "replay");
}

#[test]
fn allows_stream_continuation() {
    let mut ar = AntiReplay::new();
    assert!(ar.check(10).is_ok());
    assert!(ar.check(20).is_ok());

    ar.set_active_stream(20);

    assert!(ar.check(20).is_ok());
    assert!(ar.check(20).is_ok());
    assert!(ar.check(20).is_ok());

    assert!(ar.check(15).is_err());
}

#[test]
fn rejects_after_stream_cleared() {
    let mut ar = AntiReplay::new();
    assert!(ar.check(10).is_ok());
    assert!(ar.check(20).is_ok());

    ar.set_active_stream(20);
    assert!(ar.check(20).is_ok());

    ar.clear_active_stream();

    assert!(ar.check(20).is_err());
    assert!(ar.check(30).is_ok());
}
