//! The desktop's own USB controller and data plane against the Android Air phone's host - the
//! shared native host an Android Air phone runs - on an in-memory cable. Both ends are the Rust
//! each client ships: the desktop's pairing, record framing, IK and remote IO loop on one side,
//! `client-runtime`'s USB session on the other.
use super::support::*;
use super::*;
use crate::mobile_usb::types::HostId;
use chromvoid_client_runtime::session::native_host::{
    HostSnapshot, NativeHost, UsbApprovalKind, UsbSessionEnd,
};
use chromvoid_client_runtime::session::LocalSession;
use chromvoid_client_runtime::LocalCoreAdapter;
use chromvoid_network_runtime::usb_mobile::record::UsbRecordTransport;
use serde_json::{json, Value};
use std::time::Duration;

const WAIT: Duration = Duration::from_secs(20);

/// The phone: an unlocked vault and the host a cable reaches.
struct Phone {
    session: Arc<LocalSession>,
    host: Arc<NativeHost>,
    links: AtomicUsize,
}

impl Phone {
    async fn new(root: &std::path::Path) -> Arc<Self> {
        let core = LocalCoreAdapter::new_with_test_keystore(root.join("phone")).unwrap();
        let session = Arc::new(LocalSession::new(core).unwrap());
        let generation = session.snapshot().unwrap().generation;
        let unlocked = session
            .execute(
                1,
                generation,
                RpcRequest::new("vault:unlock", json!({"password": "synthetic usb phone"})),
            )
            .await
            .unwrap();
        assert!(unlocked.is_ok());
        let host = Arc::new(NativeHost::new(&session).unwrap());
        Arc::new(Self {
            session,
            host,
            links: AtomicUsize::new(0),
        })
    }

    /// Plugs one end of a new cable into a new session and returns the other end.
    fn plug(&self) -> BoxMobileUsbStream {
        let (desktop, phone) = duplex(1 << 17);
        let id = format!("link-{}", self.links.fetch_add(1, Ordering::SeqCst) + 1);
        self.host
            .start_usb_session(
                id,
                "Synthetic Air phone".into(),
                Box::new(move || {
                    Ok(Box::new(UsbRecordTransport::new(phone)) as Box<dyn RemoteTransport>)
                }),
            )
            .unwrap();
        Box::new(desktop)
    }

    fn link(&self) -> String {
        format!("link-{}", self.links.load(Ordering::SeqCst))
    }

    async fn status(&self, ready: impl Fn(&HostSnapshot) -> bool) -> HostSnapshot {
        tokio::time::timeout(WAIT, async {
            let mut snapshot = self.host.snapshot().unwrap();
            while !ready(&snapshot) {
                snapshot = self.host.events(snapshot.sequence).await.unwrap();
            }
            snapshot
        })
        .await
        .expect("the phone reaches the state")
    }

    async fn allow_session(&self) {
        let asked = self.status(|s| s.usb.session.is_some()).await;
        let request = asked.usb.session.unwrap();
        assert!(self
            .host
            .resolve_usb_approval(UsbApprovalKind::Session, &request.attempt_id, true)
            .unwrap());
    }

    async fn ended(&self, link: &str) -> UsbSessionEnd {
        tokio::time::timeout(WAIT, self.host.usb_session_end(link))
            .await
            .expect("the phone's session ends")
            .unwrap()
    }
}

struct AirPhoneBridge(Arc<Phone>);

#[async_trait::async_trait]
impl MobileUsbBridge for AirPhoneBridge {
    async fn scan(&self) -> Result<Vec<MobileUsbScanResult>, MobileUsbError> {
        Ok(vec![scan_result()])
    }

    async fn open_pair_stream(
        &self,
        _request: &MobileUsbPairRequest,
    ) -> Result<BoxMobileUsbStream, MobileUsbError> {
        Ok(self.0.plug())
    }

    async fn open_connect_stream(
        &self,
        _record: &MobileUsbPairedHostRecord,
    ) -> Result<BoxMobileUsbStream, MobileUsbError> {
        Ok(self.0.plug())
    }
}

/// The desktop's data plane as its session coordinator runs it: the remote IO loop, then the
/// startup questions it asks a phone before anything else.
#[derive(Default)]
struct DataPlane {
    requests: Mutex<Option<tokio::sync::mpsc::Sender<crate::remote_data_plane::RemoteIoRequest>>>,
    events: tokio::sync::Mutex<
        Option<tokio::sync::mpsc::Receiver<crate::remote_data_plane::RemoteIoEvent>>,
    >,
    task: Mutex<Option<tokio::task::JoinHandle<()>>>,
}

impl DataPlane {
    async fn rpc(&self, command: &str, data: Value) -> RpcResponse {
        let requests = self
            .requests
            .lock()
            .unwrap()
            .clone()
            .expect("a running data plane");
        let (reply_tx, reply_rx) = tokio::sync::oneshot::channel();
        requests
            .send(crate::remote_data_plane::RemoteIoRequest {
                request: RpcRequest::new(command, data),
                stream: None,
                reply_tx,
                priority: crate::core_adapter::RemoteRpcPriority::Normal,
                cancel_group: None,
            })
            .await
            .expect("request queued");
        let reply = tokio::time::timeout(WAIT, reply_rx)
            .await
            .expect("the phone answers")
            .expect("reply");
        let RpcReply::Json(response) = reply else {
            panic!("a JSON reply");
        };
        response
    }

    /// The next notice the phone pushes.
    async fn push(&self) -> String {
        let mut events = self.events.lock().await;
        let events = events.as_mut().expect("a running data plane");
        loop {
            let event = tokio::time::timeout(WAIT, events.recv())
                .await
                .expect("a push arrives")
                .expect("events open");
            if let crate::remote_data_plane::RemoteIoEvent::Frame(frame) = event {
                if frame.frame_type == FrameType::RpcRequest {
                    let request: RpcRequest = serde_json::from_slice(&frame.payload).unwrap();
                    return request.command;
                }
            }
        }
    }

    fn stop(&self) {
        if let Some(task) = self.task.lock().unwrap().take() {
            task.abort();
        }
    }
}

#[async_trait::async_trait]
impl MobileUsbSessionStarter for Arc<DataPlane> {
    async fn start_session(
        &self,
        request: MobileUsbStartSessionRequest,
    ) -> Result<MobileUsbSessionHandle, MobileUsbError> {
        let handle = crate::remote_data_plane::spawn_remote_io_task(request.config);
        *self.requests.lock().unwrap() = Some(handle.req_tx);
        *self.events.lock().await = Some(handle.evt_rx);
        *self.task.lock().unwrap() = Some(handle.task_handle);
        let capabilities = self.rpc("core:capabilities", json!({})).await;
        assert!(capabilities.is_ok(), "{capabilities:?}");
        let status = self.rpc("vault:status", json!({})).await;
        let host_unlocked = status
            .result()
            .and_then(|result| result.get("is_unlocked"))
            .and_then(Value::as_bool)
            .unwrap_or(false);
        Ok(MobileUsbSessionHandle {
            session_id: "air-phone-session".into(),
            host_unlocked,
            transport_session_generation: 1,
        })
    }

    async fn disconnect_user(&self) -> Result<(), MobileUsbError> {
        let reply = self.rpc("mobile_usb:session_disconnect", json!({})).await;
        assert!(reply.is_ok(), "{reply:?}");
        self.stop();
        Ok(())
    }

    fn disconnect_terminal(&self) -> Result<(), MobileUsbError> {
        self.stop();
        Ok(())
    }
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn the_desktop_pairs_with_an_android_air_phone_and_uses_its_vault_over_the_cable() {
    let root = tempfile::tempdir().unwrap();
    let phone = Phone::new(root.path()).await;
    let store = Arc::new(InMemoryMobileUsbPairingStore::default());
    let plane = Arc::new(DataPlane::default());
    let controller = MobileUsbController::new(
        Arc::new(AirPhoneBridge(phone.clone())),
        store.clone(),
        Arc::new(InMemoryMobileUsbSecretStore::default()),
        Arc::new(plane.clone()),
    );

    // The desktop starts pairing; the phone shows its PIN, its person allows it, and the
    // desktop's person types it.
    let status = controller.pair(pair_request()).await.expect("pair");
    let approval = status
        .pairing_approval
        .expect("the desktop asks for the PIN");
    let asked = phone
        .status(|s| s.usb.pairing.is_some())
        .await
        .usb
        .pairing
        .unwrap();
    assert_eq!(asked.attempt_id, approval.attempt_id);
    assert!(phone
        .host
        .resolve_usb_approval(UsbApprovalKind::Pairing, &asked.attempt_id, true)
        .unwrap());
    let status = controller
        .confirm_pairing(MobileUsbPairConfirmRequest {
            attempt_id: approval.attempt_id,
            approval_pin: asked.pin.clone(),
        })
        .await
        .expect("confirm pairing");
    assert_eq!(status.selected_transport, Some(TransportType::UsbMobile));
    let host_id = store.list().unwrap().single_host_id();
    let trusted = phone.host.trusted_peers().await.unwrap();
    assert_eq!(
        (trusted.len(), trusted[0].platform.as_str()),
        (1, "desktop")
    );

    // Until the phone's person allows the session the vault is out of reach.
    let refused = plane
        .rpc(
            "passmanager:entry:create",
            json!({"entry_id":"over-usb","title":"Over USB","entry_type":"login","secrets":{"password":"synthetic"}}),
        )
        .await;
    assert_eq!(
        refused.code(),
        Some("ERR_USB_MOBILE_SESSION_APPROVAL_REQUIRED")
    );
    phone.allow_session().await;
    assert_eq!(plane.push().await, "mobile_usb:host_unlock_confirmed");
    let created = plane
        .rpc(
            "passmanager:entry:create",
            json!({"entry_id":"over-usb","title":"Over USB","entry_type":"login","secrets":{"password":"synthetic"}}),
        )
        .await;
    assert!(created.is_ok(), "{created:?}");

    // The desktop's person disconnects: the phone hears a desktop leaving, not its own stop.
    controller.disconnect_user().await.expect("disconnect");
    assert_eq!(
        phone.ended(&phone.link()).await,
        UsbSessionEnd::ClientDisconnected
    );

    // Reconnecting a paired phone is IK against the key the pairing kept.
    let status = controller.connect(host_id).await.expect("connect");
    assert_eq!(status.selected_transport, Some(TransportType::UsbMobile));
    phone.allow_session().await;
    assert_eq!(plane.push().await, "mobile_usb:host_unlock_confirmed");
    let entries = plane.rpc("passmanager:root:export", json!({})).await;
    assert!(
        entries.result().unwrap().to_string().contains("over-usb"),
        "{entries:?}"
    );

    // The phone locks its vault: the desktop is told, and the session ends as a lock.
    phone.session.lock().unwrap();
    assert_eq!(plane.push().await, "mobile_usb:host_locked");
    assert_eq!(phone.ended(&phone.link()).await, UsbSessionEnd::VaultLocked);
    plane.stop();
}

trait SingleHost {
    fn single_host_id(self) -> HostId;
}

impl SingleHost for Vec<MobileUsbPairedHostRecord> {
    fn single_host_id(self) -> HostId {
        assert_eq!(self.len(), 1);
        self.into_iter().next().unwrap().host_id
    }
}
