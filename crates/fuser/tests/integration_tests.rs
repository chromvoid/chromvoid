use fuser::{Filesystem, Session};
use std::rc::Rc;
use std::thread;
use std::time::Duration;
use tempfile::TempDir;

#[test]
fn unmount_no_send() {
    struct NoSendFS(
        // Rc to make this !Send
        #[allow(dead_code)] Rc<()>,
    );

    impl Filesystem for NoSendFS {}

    let tmpdir: TempDir = tempfile::tempdir().unwrap();
    let mut session = match Session::new(NoSendFS(Rc::new(())), tmpdir.path(), &[]) {
        Ok(session) => session,
        Err(err)
            if matches!(
                err.kind(),
                std::io::ErrorKind::NotFound | std::io::ErrorKind::PermissionDenied
            ) =>
        {
            eprintln!("SKIP unmount_no_send: FUSE runtime unavailable ({err})");
            return;
        }
        Err(err) => panic!("failed to create test FUSE session: {err}"),
    };
    let mut unmounter = session.unmount_callable();
    thread::spawn(move || {
        thread::sleep(Duration::from_secs(1));
        unmounter.unmount().unwrap();
    });
    session.run().unwrap();
}
