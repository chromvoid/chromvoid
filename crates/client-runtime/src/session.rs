//! Revocable admission and safe observations around the shared local adapter.
//! Core transactions finish on the dispatcher; lifecycle callbacks only revoke admission.
use std::collections::{BTreeMap, VecDeque};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Condvar, Mutex, MutexGuard};

use crate::rpc_data::OwnedRpcResponse;
use chromvoid_core::rpc::types::RpcRequest;
use serde::{Deserialize, Serialize};
use tokio::sync::watch;

use crate::LocalCoreAdapter;
use crate::dispatch::policy::{CoreRpcPriority, command_policy};
use crate::dispatch::worker::CoreRpcDispatcher;

#[path = "auto_lock.rs"]
mod auto_lock;
use auto_lock::AutoLock;

#[path = "credential_import.rs"]
pub mod credential_import;
use credential_import::{ImportReviewWork, ImportState};
#[path = "credential_export.rs"]
pub mod credential_export;
use credential_export::{ExportState, ExportWork};
#[path = "storage_backup.rs"]
pub mod storage_backup;
use storage_backup::{BackupResource, BackupWork};
#[path = "storage_restore.rs"]
pub mod storage_restore;
use storage_restore::{RestoreResource, RestoreWork};
#[path = "storage_erase.rs"]
pub mod storage_erase;
use storage_erase::{EraseState, EraseWork};
#[path = "file_reader.rs"]
pub mod file_reader;
use file_reader::{FileReadState, FileReadWork};
#[path = "file_writer.rs"]
pub mod file_writer;
use file_writer::FileWriteWork;
#[path = "upload_resource.rs"]
mod upload_resource;
use upload_resource::UploadResource;
#[path = "document_save.rs"]
pub mod document_save;
use document_save::{DocumentSaveState, DocumentSaveWork};
#[path = "peer_session.rs"]
pub mod peer_session;
use peer_session::{PeerAuthority, PeerLease};
#[path = "native_host/mod.rs"]
pub mod native_host;
#[path = "peer_host.rs"]
pub mod peer_host;
#[path = "peer_publication.rs"]
pub mod peer_publication;
#[path = "peer_stream.rs"]
pub mod peer_stream;
#[cfg(test)]
#[path = "peer_wire_fixture.rs"]
mod peer_wire_fixture;
use peer_stream::{PeerStreamState, PeerStreamWork};
#[path = "peer_upload.rs"]
pub mod peer_upload;
use peer_upload::{PeerUploadState, PeerUploadWork};
#[path = "media_inspection.rs"]
mod media_inspection;
use media_inspection::{MediaInspectionState, MediaInspectionWork};

#[path = "derivative_ensure.rs"]
mod derivative_ensure;
use derivative_ensure::{DerivativeRuntime, DerivativeState, DerivativeWork};

enum ResourceWork {
    Derivative(DerivativeWork),
    Import(ImportReviewWork),
    Export(ExportWork),
    Backup(BackupWork),
    Restore(RestoreWork),
    Erase(EraseWork),
    FileRead(FileReadWork),
    FileWrite(FileWriteWork),
    DocumentSave(DocumentSaveWork),
    PeerStream(PeerStreamWork),
    PeerUpload(PeerUploadWork),
    MediaInspection(MediaInspectionWork),
    PeerUploadAbort(std::sync::Weak<PeerLease>),
}
impl ResourceWork {
    fn execute(
        &mut self,
        adapter: &mut LocalCoreAdapter,
        request: &RpcRequest,
        on_storage_reset: &mut dyn FnMut(),
    ) -> OwnedRpcResponse {
        match self {
            Self::Derivative(work) => work.execute(adapter),
            Self::Import(work) => work.execute(adapter),
            Self::Export(work) => work.execute(adapter),
            Self::Backup(work) => work.execute(adapter),
            Self::Restore(work) => work.execute(adapter),
            Self::Erase(work) => work.execute(adapter, on_storage_reset),
            Self::FileRead(work) => work.execute(adapter),
            Self::FileWrite(work) => work.execute(adapter),
            Self::DocumentSave(work) => work.execute(adapter),
            Self::PeerStream(work) => work.execute(adapter, request),
            Self::PeerUpload(work) => work.execute(adapter, request),
            Self::MediaInspection(work) => work.execute(adapter, request),
            Self::PeerUploadAbort(peer) => peer_upload::execute_abort(peer, adapter, request),
        }
    }
    fn publish(&mut self) -> Result<(), SessionError> {
        match self {
            Self::Derivative(work) => work.publish(),
            Self::Import(work) => work.publish(),
            Self::Export(work) => work.publish(),
            Self::Backup(work) => work.publish(),
            Self::Restore(work) => work.publish(),
            Self::Erase(work) => work.publish(),
            Self::FileRead(work) => work.publish(),
            Self::FileWrite(work) => work.publish(),
            Self::DocumentSave(_) => Ok(()),
            Self::PeerStream(work) => work.publish(),
            Self::PeerUpload(work) => work.publish(),
            Self::MediaInspection(work) => work.publish(),
            Self::PeerUploadAbort(_) => Ok(()),
        }
    }
}

const MAX_PENDING: usize = 128;
const EVENT_CAPACITY: usize = 64;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SessionPhase {
    Locked,
    Unlocked,
    Deactivating,
    Inactive,
    Closed,
    Failed,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SessionSnapshot {
    pub generation: u64,
    pub sequence: u64,
    pub phase: SessionPhase,
    pub cleanup_pending: bool,
    pub master_configured: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SessionEventKind {
    Lifecycle,
    DomainInvalidated,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SessionEvent {
    pub snapshot: SessionSnapshot,
    pub kind: SessionEventKind,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SessionEventBatch {
    pub events: Vec<SessionEvent>,
    pub gap: bool,
    pub snapshot: SessionSnapshot,
}

#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum SessionError {
    #[error("Session authority was revoked")]
    Revoked,
    #[error("Request was canceled")]
    Canceled,
    #[error("Request identifiers must increase and cannot be reused")]
    RequestId,
    #[error("Too many pending requests")]
    Busy,
    #[error("Runtime is unavailable")]
    Unavailable,
    #[error("Storage adoption must finish before this action")]
    AdoptionRequired,
}

#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
enum RequestKey {
    Native(u64),
    /// A provider path in the application's own process - Autofill, Credential Manager - with
    /// identifiers of its own, so it never races the application's sequence.
    Provider(u64),
    Peer {
        scope: u64,
        request: u64,
    },
}

struct RequestControl {
    cancel: Arc<AtomicBool>,
    publication_revoked: Option<watch::Sender<bool>>,
    activation: bool,
    generation: u64,
    stream: Option<Arc<Mutex<PeerStreamState>>>,
    upload: Option<Arc<Mutex<PeerUploadState>>>,
    media: Option<Arc<Mutex<MediaInspectionState>>>,
    derivative: Option<Arc<Mutex<DerivativeState>>>,
}

impl RequestControl {
    fn revoke(&self) {
        self.cancel.store(true, Ordering::Release);
        if let Some(revoked) = &self.publication_revoked {
            revoked.send_replace(true);
        }
        if let Some(state) = &self.derivative {
            *state
                .lock()
                .unwrap_or_else(std::sync::PoisonError::into_inner) = DerivativeState::default();
        }
        if let Some(media) = &self.media {
            *media
                .lock()
                .unwrap_or_else(std::sync::PoisonError::into_inner) =
                MediaInspectionState::default();
        }
        if let Some(upload) = &self.upload {
            upload
                .lock()
                .unwrap_or_else(std::sync::PoisonError::into_inner)
                .revoke();
        }
        if let Some(stream) = &self.stream {
            *stream
                .lock()
                .unwrap_or_else(std::sync::PoisonError::into_inner) = PeerStreamState::default();
        }
    }
}

struct Authority {
    snapshot: SessionSnapshot,
    auto_lock: AutoLock,
    idle_changed: Arc<Condvar>,
    foreground: bool,
    last_request: u64,
    last_provider_request: u64,
    pending: BTreeMap<RequestKey, RequestControl>,
    next_peer_session: u64,
    peer_sessions: BTreeMap<u64, PeerAuthority>,
    events: VecDeque<SessionEvent>,
    imports: Vec<std::sync::Weak<Mutex<ImportState>>>,
    exports: Vec<std::sync::Weak<Mutex<ExportState>>>,
    backups: Vec<std::sync::Weak<BackupResource>>,
    restores: Vec<std::sync::Weak<RestoreResource>>,
    erase: std::sync::Weak<Mutex<EraseState>>,
    file_readers: Vec<std::sync::Weak<Mutex<FileReadState>>>,
    file_writers: Vec<std::sync::Weak<UploadResource>>,
    document_save: std::sync::Weak<Mutex<DocumentSaveState>>,
}

struct Inner {
    storage_mutation_guard: chromvoid_core::rpc::StorageMutationGuard,
    host_gate: Arc<Mutex<()>>,
    host_storage: native_host::HostStorage,
    native_hosts: Mutex<Vec<std::sync::Weak<native_host::HostInner>>>,
    derivatives: DerivativeRuntime,
    adapter: Mutex<LocalCoreAdapter>,
    authority: Mutex<Authority>,
    idle_changed: Arc<Condvar>,
    changed: watch::Sender<u64>,
    lifetime: Arc<()>,
}

/// Tracks ownership through deferred cleanup without exposing the adapter.
pub struct SessionLease(std::sync::Weak<()>);
impl SessionLease {
    pub fn is_alive(&self) -> bool {
        self.0.strong_count() != 0
    }
}

/// One process-local owner; clients cannot obtain its privileged adapter.
pub struct LocalSession {
    inner: Arc<Inner>,
    dispatcher: CoreRpcDispatcher,
}

impl Authority {
    fn accepts(&self, generation: u64) -> bool {
        self.snapshot.generation == generation
            && !self.auto_lock.expired()
            && self.foreground
            && matches!(
                self.snapshot.phase,
                SessionPhase::Locked | SessionPhase::Unlocked
            )
    }

    fn emit(&mut self, kind: SessionEventKind, changed: &watch::Sender<u64>) {
        match self.snapshot.sequence.checked_add(1) {
            Some(sequence) => self.snapshot.sequence = sequence,
            None => {
                self.snapshot.phase = SessionPhase::Failed;
                self.foreground = false;
            }
        }
        if matches!(
            self.snapshot.phase,
            SessionPhase::Closed | SessionPhase::Failed
        ) {
            // Cleanup failure can follow revocation after the idle monitor has gone back
            // to an untimed wait. Every terminal transition must release that monitor.
            self.idle_changed.notify_all();
        }
        if self.events.len() == EVENT_CAPACITY {
            self.events.pop_front();
        }
        self.events.push_back(SessionEvent {
            snapshot: self.snapshot.clone(),
            kind,
        });
        changed.send_replace(self.snapshot.sequence);
    }

    fn revoke(&mut self) {
        self.auto_lock.clear_activity();
        if let Some(resource) = self.erase.upgrade() {
            resource
                .lock()
                .unwrap_or_else(std::sync::PoisonError::into_inner)
                .revoke();
        }
        for resource in self
            .restores
            .iter()
            .filter_map(|resource| resource.upgrade())
        {
            resource.revoke();
        }
        for resource in self
            .backups
            .iter()
            .filter_map(|resource| resource.upgrade())
        {
            resource.revoke();
        }
        if let Some(resource) = self.document_save.upgrade() {
            resource
                .lock()
                .unwrap_or_else(std::sync::PoisonError::into_inner)
                .bytes = None;
        }
        for resource in self
            .file_writers
            .iter()
            .filter_map(|resource| resource.upgrade())
        {
            resource.revoke();
        }
        for resource in self
            .file_readers
            .iter()
            .filter_map(|resource| resource.upgrade())
        {
            *resource
                .lock()
                .unwrap_or_else(std::sync::PoisonError::into_inner) = FileReadState::Closed;
        }
        for resource in self
            .imports
            .iter()
            .filter_map(|resource| resource.upgrade())
        {
            *resource
                .lock()
                .unwrap_or_else(std::sync::PoisonError::into_inner) = ImportState::Closed;
        }
        for resource in self
            .exports
            .iter()
            .filter_map(|resource| resource.upgrade())
        {
            *resource
                .lock()
                .unwrap_or_else(std::sync::PoisonError::into_inner) = ExportState::Closed;
        }
        for request in self.pending.values() {
            request.revoke();
        }
        for peer in self.peer_sessions.values_mut() {
            peer.catalog_events.clear();
        }
        self.snapshot.phase = match self.snapshot.generation.checked_add(1) {
            Some(generation) => {
                self.snapshot.generation = generation;
                SessionPhase::Deactivating
            }
            None => SessionPhase::Failed,
        };
    }
}

impl LocalSession {
    pub fn ensure_storage_mutation_allowed(&self) -> Result<(), SessionError> {
        self.inner
            .storage_mutation_guard
            .check()
            .map_err(|_| SessionError::AdoptionRequired)
    }

    pub fn new(mut adapter: LocalCoreAdapter) -> Result<Self, SessionError> {
        // Even a caller that supplied an unlocked adapter cannot retain its authority.
        adapter.handle(&RpcRequest::new("vault:lock", serde_json::json!({})));
        if adapter.is_unlocked() {
            return Err(SessionError::Unavailable);
        }
        let master_configured = adapter
            .master_is_configured()
            .map_err(|_| SessionError::Unavailable)?;
        let (changed, _) = watch::channel(0);
        let idle_changed = Arc::new(Condvar::new());
        Ok(Self {
            inner: Arc::new(Inner {
                storage_mutation_guard: adapter.storage_mutation_guard(),
                host_gate: Arc::new(Mutex::new(())),
                host_storage: native_host::HostStorage::new(
                    adapter.storage_root.clone(),
                    adapter.keystore.clone(),
                ),
                native_hosts: Mutex::new(Vec::new()),
                derivatives: DerivativeRuntime::default(),
                adapter: Mutex::new(adapter),
                authority: Mutex::new(Authority {
                    auto_lock: AutoLock::default(),
                    idle_changed: idle_changed.clone(),
                    snapshot: SessionSnapshot {
                        generation: 1,
                        sequence: 0,
                        phase: SessionPhase::Locked,
                        cleanup_pending: false,
                        master_configured,
                    },
                    foreground: true,
                    last_request: 0,
                    last_provider_request: 0,
                    pending: BTreeMap::new(),
                    next_peer_session: 0,
                    peer_sessions: BTreeMap::new(),
                    events: VecDeque::new(),
                    imports: Vec::new(),
                    exports: Vec::new(),
                    backups: Vec::new(),
                    restores: Vec::new(),
                    erase: std::sync::Weak::new(),
                    file_readers: Vec::new(),
                    file_writers: Vec::new(),
                    document_save: std::sync::Weak::new(),
                }),
                idle_changed,
                changed,
                lifetime: Arc::new(()),
            }),
            dispatcher: CoreRpcDispatcher::try_new().map_err(|_| SessionError::Unavailable)?,
        })
    }

    pub fn snapshot(&self) -> Result<SessionSnapshot, SessionError> {
        Ok(self
            .inner
            .authority
            .lock()
            .map_err(|_| SessionError::Unavailable)?
            .snapshot
            .clone())
    }

    pub fn lease(&self) -> SessionLease {
        SessionLease(Arc::downgrade(&self.inner.lifetime))
    }

    /// Synchronous and bounded: does not acquire the Core adapter mutex.
    pub fn deactivate(&self) -> Result<SessionSnapshot, SessionError> {
        self.revoke(false, false, None)
    }

    /// Activating permits later explicit unlock only after queued lock cleanup completes.
    pub fn activate(&self) -> Result<SessionSnapshot, SessionError> {
        let mut authority = self
            .inner
            .authority
            .lock()
            .map_err(|_| SessionError::Unavailable)?;
        if matches!(
            authority.snapshot.phase,
            SessionPhase::Closed | SessionPhase::Failed
        ) {
            return Err(SessionError::Unavailable);
        }
        authority.foreground = true;
        if authority.snapshot.phase == SessionPhase::Inactive {
            authority.snapshot.phase = SessionPhase::Locked;
            authority.emit(SessionEventKind::Lifecycle, &self.inner.changed);
        }
        Ok(authority.snapshot.clone())
    }

    pub fn lock(&self) -> Result<SessionSnapshot, SessionError> {
        self.revoke(true, false, None)
    }

    pub fn close(&self) -> Result<SessionSnapshot, SessionError> {
        let result = self.revoke(false, true, None);
        // Also wake a monitor when a failed/poisoned authority cannot perform normal cleanup.
        self.inner.idle_changed.notify_all();
        result
    }

    fn revoke(
        &self,
        remain_active: bool,
        close: bool,
        expected_generation: Option<u64>,
    ) -> Result<SessionSnapshot, SessionError> {
        revoke_session(
            &self.inner,
            &self.dispatcher,
            remain_active,
            close,
            expected_generation,
        )
    }

    pub fn cancel(&self, request_id: u64) -> Result<(), SessionError> {
        self.cancel_request(RequestKey::Native(request_id))
    }

    fn cancel_request(&self, key: RequestKey) -> Result<(), SessionError> {
        cancel_request(&self.inner, &self.dispatcher, key)
    }

    pub fn admit(
        &self,
        request_id: u64,
        generation: u64,
        request: RpcRequest,
    ) -> Result<AdmittedRequest, SessionError> {
        let request = OwnedRequest(request);
        let mut authority = self
            .inner
            .authority
            .lock()
            .map_err(|_| SessionError::Unavailable)?;
        self.admit_locked(&mut authority, request_id, generation, request)
    }

    fn admit_locked(
        &self,
        authority: &mut Authority,
        request_id: u64,
        generation: u64,
        request: OwnedRequest,
    ) -> Result<AdmittedRequest, SessionError> {
        self.admit_with_peer_locked(authority, request_id, generation, request, None)
    }

    /// Admits a request from a provider path running in the application's own process. Its
    /// identifiers are its own and rise independently of the application's, while generation,
    /// lock and cancellation fence it exactly as they fence the application. The caller
    /// narrows it to provider commands before it gets here.
    pub fn admit_provider(
        &self,
        request_id: u64,
        generation: u64,
        request: RpcRequest,
    ) -> Result<AdmittedRequest, SessionError> {
        let mut authority = self
            .inner
            .authority
            .lock()
            .map_err(|_| SessionError::Unavailable)?;
        self.admit_scoped_locked(
            &mut authority,
            request_id,
            generation,
            OwnedRequest(request),
            None,
            true,
        )
    }

    fn admit_with_peer_locked(
        &self,
        authority: &mut Authority,
        request_id: u64,
        generation: u64,
        request: OwnedRequest,
        peer_lease: Option<Arc<PeerLease>>,
    ) -> Result<AdmittedRequest, SessionError> {
        self.admit_scoped_locked(
            authority, request_id, generation, request, peer_lease, false,
        )
    }

    fn admit_scoped_locked(
        &self,
        authority: &mut Authority,
        request_id: u64,
        generation: u64,
        request: OwnedRequest,
        peer_lease: Option<Arc<PeerLease>>,
        provider: bool,
    ) -> Result<AdmittedRequest, SessionError> {
        if request.0.command == "vault:lock" || !authority.accepts(generation) {
            return Err(SessionError::Revoked);
        }
        let (key, last_request) = if let Some(peer) = &peer_lease {
            let state = authority
                .peer_sessions
                .get_mut(&peer.id)
                .ok_or(SessionError::Revoked)?;
            if state.closed || peer.generation != generation {
                return Err(SessionError::Revoked);
            }
            (
                RequestKey::Peer {
                    scope: peer.id,
                    request: request_id,
                },
                &mut state.last_request,
            )
        } else if provider {
            (
                RequestKey::Provider(request_id),
                &mut authority.last_provider_request,
            )
        } else {
            (RequestKey::Native(request_id), &mut authority.last_request)
        };
        if request_id <= *last_request {
            return Err(SessionError::RequestId);
        }
        if authority.pending.len() >= MAX_PENDING {
            return Err(SessionError::Busy);
        }
        *last_request = request_id;
        let cancel = Arc::new(AtomicBool::new(false));
        authority.pending.insert(
            key,
            RequestControl {
                cancel: cancel.clone(),
                publication_revoked: None,
                activation: request.0.command == "vault:unlock",
                generation,
                stream: None,
                upload: None,
                media: None,
                derivative: None,
            },
        );
        Ok(AdmittedRequest {
            generation,
            request,
            cancel,
            pending: Arc::new(PendingRequest {
                inner: self.inner.clone(),
                id: key,
                peer_lease,
            }),
            resource_work: None,
            import_lease: None,
        })
    }

    pub async fn execute(
        &self,
        request_id: u64,
        generation: u64,
        request: RpcRequest,
    ) -> Result<OwnedRpcResponse, SessionError> {
        self.execute_admitted(self.admit(request_id, generation, request)?)
            .await
    }

    /// Admission is synchronous; foreign executors may poll these futures in any order.
    /// The future owns execution state, but does not retain the application's session
    /// owner. Dropping LocalSession still revokes outstanding peer work.
    pub fn execute_admitted(
        &self,
        admitted: AdmittedRequest,
    ) -> impl std::future::Future<Output = Result<OwnedRpcResponse, SessionError>> + Send + use<>
    {
        let inner = self.inner.clone();
        let dispatcher = self.dispatcher.clone();
        async move {
            if admitted.request.0.command == "catalog:media:inspect"
                && admitted.resource_work.is_none()
            {
                media_inspection::execute(inner, dispatcher, admitted).await
            } else if admitted.request.0.command == "catalog:derivative:ensure"
                && admitted.resource_work.is_none()
            {
                derivative_ensure::execute(inner, dispatcher, admitted).await
            } else {
                Self::execute_admitted_phase(inner, dispatcher, admitted).await
            }
        }
    }

    fn execute_admitted_phase(
        inner: Arc<Inner>,
        dispatcher: CoreRpcDispatcher,
        admitted: AdmittedRequest,
    ) -> impl std::future::Future<Output = Result<OwnedRpcResponse, SessionError>> + Send {
        async move {
            if !Arc::ptr_eq(&inner, &admitted.pending.inner) {
                return Err(SessionError::RequestId);
            }
            let AdmittedRequest {
                generation,
                request,
                cancel,
                pending,
                mut resource_work,
                import_lease,
            } = admitted;
            let key = pending.id;
            let worker_pending = pending.clone();
            let mut cancellation = CancelOnDrop {
                inner: &inner,
                dispatcher: &dispatcher,
                id: key,
                completed: false,
            };
            let policy = command_policy(&request.0.command);
            let start = dispatcher.begin_command(policy);
            let worker_inner = inner.clone();
            let result = dispatcher
                .run_adapter_phase(
                    policy.priority,
                    request.0.command.clone(),
                    "local_session",
                    start.cancellation_generation,
                    move || {
                        let inner = worker_inner;
                        let _pending = worker_pending;
                        let _import_lease = import_lease;
                        // Admission is checked again on the worker. This is the start boundary;
                        // queued work revoked while waiting never reaches the router.
                        {
                            let authority = inner
                                .authority
                                .lock()
                                .map_err(|_| SessionError::Unavailable)?;
                            if !authority.accepts(generation) {
                                return Err(SessionError::Revoked);
                            }
                            if cancel.load(Ordering::Acquire) {
                                return Err(SessionError::Canceled);
                            }
                            if request.0.command == "vault:unlock"
                                && authority.snapshot.phase == SessionPhase::Unlocked
                            {
                                return Err(SessionError::Busy);
                            }
                        }
                        let mut hosts_stopped = true;
                        let mut reset_generation = None;
                        let mut on_storage_reset = || {
                            // Only the admission/retirement transition holds this gate. Apple
                            // lifecycle callbacks never wait for Core KDF or deletion I/O.
                            let _gate = inner
                                .host_gate
                                .lock()
                                .unwrap_or_else(std::sync::PoisonError::into_inner);
                            {
                                let mut authority = inner
                                    .authority
                                    .lock()
                                    .unwrap_or_else(std::sync::PoisonError::into_inner);
                                if authority.accepts(generation) {
                                    authority.revoke();
                                    authority.snapshot.cleanup_pending = true;
                                    reset_generation = Some(authority.snapshot.generation);
                                    authority.emit(SessionEventKind::Lifecycle, &inner.changed);
                                }
                                // Core erasure now owns upload chunks and transaction files.
                                // A retained old writer must not abort against locked/new Core.
                                authority.file_writers.clear();
                            }
                            hosts_stopped = native_host::retire_for_erase_locked(&inner).is_ok();
                        };
                        let mut adapter = inner
                            .adapter
                            .lock()
                            .map_err(|_| SessionError::Unavailable)?;
                        let was_unlocked = adapter.is_unlocked();
                        let peer_subscription = _pending.peer_lease.as_ref().and_then(|_| {
                            match request.0.command.as_str() {
                                "catalog:subscribe" => Some(true),
                                "catalog:unsubscribe" => Some(false),
                                _ => None,
                            }
                        });
                        let (response, storage_reset_started) = if peer_subscription.is_some() {
                            // LocalSession owns Core observation. Successful peer commands
                            // only change delivery; Core still supplies its validation errors.
                            let response = if was_unlocked
                                && request.0.v == chromvoid_core::rpc::types::PROTOCOL_VERSION
                            {
                                chromvoid_core::rpc::types::RpcResponse::success(
                                    serde_json::Value::Null,
                                )
                            } else {
                                adapter.handle(&request.0)
                            };
                            (OwnedRpcResponse(response), false)
                        } else {
                            match &mut resource_work {
                                Some(work) => {
                                    let response = work.execute(
                                        &mut adapter,
                                        &request.0,
                                        &mut on_storage_reset,
                                    );
                                    let started =
                                        matches!(work, ResourceWork::Erase(erase) if erase.started);
                                    (response, started)
                                }
                                None => {
                                    let outcome = adapter.handle_cancellable(
                                        &request.0,
                                        &|| cancel.load(Ordering::Acquire),
                                        &mut on_storage_reset,
                                    );
                                    (
                                        OwnedRpcResponse(outcome.response),
                                        outcome.storage_reset_started,
                                    )
                                }
                            }
                        };
                        if storage_reset_started {
                            // Revocation closes public state immediately; the serial worker
                            // must also release files retained by foreign resource handles.
                            storage_backup::cleanup_resources(&inner);
                            storage_restore::cleanup_resources(&inner);
                            let metadata_removed = {
                                let _gate = inner
                                    .host_gate
                                    .lock()
                                    .unwrap_or_else(std::sync::PoisonError::into_inner);
                                native_host::erase_storage_locked(&adapter.storage_root).is_ok()
                            };
                            if let Some(ResourceWork::Erase(work)) = &mut resource_work {
                                work.finish_storage_reset(hosts_stopped && metadata_removed);
                            }
                        }
                        let peer_save = if let Some(peer) = &_pending.peer_lease {
                            // Track resources before save/error/revocation can suppress the reply.
                            peer.track_import(&request.0, &response.0);
                            adapter.save().map_err(|_| SessionError::Unavailable)
                        } else {
                            Ok(())
                        };
                        let unlocked = adapter.is_unlocked();
                        if unlocked && !was_unlocked {
                            // LocalSession owns domain event observation, independently of UI clients.
                            // Core emits catalog changes only while its explicit subscription is active.
                            let subscribed = adapter.handle(&RpcRequest::new(
                                "catalog:subscribe",
                                serde_json::json!({}),
                            ));
                            if !subscribed.is_ok() {
                                adapter
                                    .handle(&RpcRequest::new("vault:lock", serde_json::json!({})));
                                return Err(SessionError::Unavailable);
                            }
                        }
                        let master_configuration = adapter.master_is_configured();
                        let events = adapter.take_events();
                        drop(adapter);
                        let mut authority = inner
                            .authority
                            .lock()
                            .map_err(|_| SessionError::Unavailable)?;
                        if let Some(reset_generation) = reset_generation {
                            if authority.snapshot.generation == reset_generation {
                                authority.snapshot.cleanup_pending = false;
                                authority.snapshot.phase = match master_configuration {
                                    Ok(configured) => {
                                        authority.snapshot.master_configured = configured;
                                        if authority.snapshot.phase == SessionPhase::Failed {
                                            SessionPhase::Failed
                                        } else if authority.foreground {
                                            SessionPhase::Locked
                                        } else {
                                            SessionPhase::Inactive
                                        }
                                    }
                                    Err(_) => SessionPhase::Failed,
                                };
                                authority.emit(SessionEventKind::Lifecycle, &inner.changed);
                            }
                            return Err(SessionError::Revoked);
                        }
                        if !authority.accepts(generation) {
                            return Err(SessionError::Revoked);
                        }
                        let master_configured =
                            master_configuration.map_err(|_| SessionError::Unavailable)?;
                        // Core's destructive boundary revokes old authority even if cleanup
                        // fails with administrative files still present in locked storage.
                        if (authority.snapshot.phase == SessionPhase::Unlocked && !unlocked)
                            || storage_reset_started
                            || (authority.snapshot.master_configured && !master_configured)
                        {
                            authority.revoke();
                            if authority.snapshot.phase != SessionPhase::Failed {
                                authority.snapshot.phase = SessionPhase::Locked;
                            }
                            authority.snapshot.master_configured = master_configured;
                            authority.emit(SessionEventKind::Lifecycle, &inner.changed);
                            return Err(SessionError::Revoked);
                        }
                        let phase = if unlocked {
                            SessionPhase::Unlocked
                        } else {
                            SessionPhase::Locked
                        };
                        if authority.snapshot.phase != phase
                            || authority.snapshot.master_configured != master_configured
                        {
                            if phase == SessionPhase::Unlocked
                                && authority.snapshot.phase != SessionPhase::Unlocked
                            {
                                authority.auto_lock.record_activity();
                                inner.idle_changed.notify_all();
                            }
                            authority.snapshot.phase = phase;
                            authority.snapshot.master_configured = master_configured;
                            authority.emit(SessionEventKind::Lifecycle, &inner.changed);
                        } else if !events.is_empty() {
                            for peer in authority.peer_sessions.values_mut() {
                                if peer.catalog_subscribed && !peer.closed {
                                    if peer.catalog_events.len() + events.len() > EVENT_CAPACITY {
                                        // Never leave a slow peer with a silently incomplete
                                        // catalog. Revocation closes it through the serve loop.
                                        peer.closed = true;
                                        peer.catalog_events.clear();
                                    } else {
                                        peer.catalog_events.extend(events.iter().cloned());
                                    }
                                }
                            }
                            authority.emit(SessionEventKind::DomainInvalidated, &inner.changed);
                        }
                        if let Some(subscribed) = peer_subscription.filter(|_| response.0.is_ok()) {
                            let peer = _pending.peer_lease.as_ref().expect("peer subscription");
                            let state = authority
                                .peer_sessions
                                .get_mut(&peer.id)
                                .filter(|state| !state.closed)
                                .ok_or(SessionError::Revoked)?;
                            let starting = subscribed && !state.catalog_subscribed;
                            state.catalog_subscribed = subscribed;
                            if starting {
                                // A peer may have fetched its manifest before subscribing.
                                // Refresh it to include changes made in that gap.
                                state.catalog_events.push_back(serde_json::json!({
                                    "command": "catalog:event",
                                    "data": {"type": "invalidate"},
                                }));
                                authority.emit(SessionEventKind::DomainInvalidated, &inner.changed);
                            } else if !subscribed {
                                state.catalog_events.clear();
                            }
                        }
                        if cancel.load(Ordering::Acquire) {
                            return Err(SessionError::Canceled);
                        }
                        if let Some(work) = &mut resource_work {
                            work.publish()?;
                        }
                        peer_save?;
                        Ok(response)
                    },
                )
                .await
                .map_err(|_| SessionError::Unavailable)?
                .value;
            let authority = inner
                .authority
                .lock()
                .map_err(|_| SessionError::Unavailable)?;
            if !authority.accepts(generation) {
                return Err(SessionError::Revoked);
            }
            if authority
                .pending
                .get(&key)
                .is_some_and(|request| request.cancel.load(Ordering::Acquire))
            {
                return Err(SessionError::Canceled);
            }
            cancellation.completed = true;
            result
        }
    }

    /// Dropping this future unsubscribes. Watch holds only a safe sequence value;
    /// the bounded event ring reports loss explicitly to trigger authoritative refetch.
    pub async fn events(&self, after_sequence: u64) -> Result<SessionEventBatch, SessionError> {
        let mut changed = self.inner.changed.subscribe();
        loop {
            {
                let authority = self
                    .inner
                    .authority
                    .lock()
                    .map_err(|_| SessionError::Unavailable)?;
                if authority.snapshot.sequence != after_sequence
                    || authority.snapshot.phase == SessionPhase::Failed
                    || (authority.snapshot.phase == SessionPhase::Closed
                        && !authority.snapshot.cleanup_pending)
                {
                    let gap = after_sequence > authority.snapshot.sequence
                        || authority.events.front().is_some_and(|event| {
                            after_sequence.saturating_add(1) < event.snapshot.sequence
                        });
                    return Ok(SessionEventBatch {
                        events: authority
                            .events
                            .iter()
                            .filter(|event| event.snapshot.sequence > after_sequence)
                            .cloned()
                            .collect(),
                        gap,
                        snapshot: authority.snapshot.clone(),
                    });
                }
            }
            changed
                .changed()
                .await
                .map_err(|_| SessionError::Unavailable)?;
        }
    }
}

struct OwnedRequest(RpcRequest);
impl Drop for OwnedRequest {
    fn drop(&mut self) {
        crate::rpc_data::clear_rpc_strings(&mut self.0.data);
    }
}

/// A single admitted operation. Dropping it before execution releases its queue slot.
pub struct AdmittedRequest {
    generation: u64,
    request: OwnedRequest,
    cancel: Arc<AtomicBool>,
    pending: Arc<PendingRequest>,
    resource_work: Option<ResourceWork>,
    import_lease: Option<Arc<Mutex<ImportState>>>,
}

struct PendingRequest {
    inner: Arc<Inner>,
    id: RequestKey,
    peer_lease: Option<Arc<PeerLease>>,
}
impl Drop for PendingRequest {
    fn drop(&mut self) {
        if let Ok(mut authority) = self.inner.authority.lock() {
            authority.pending.remove(&self.id);
        }
    }
}

struct CancelOnDrop<'a> {
    inner: &'a Arc<Inner>,
    dispatcher: &'a CoreRpcDispatcher,
    id: RequestKey,
    completed: bool,
}
impl Drop for CancelOnDrop<'_> {
    fn drop(&mut self) {
        if !self.completed {
            let _ = cancel_request(self.inner, self.dispatcher, self.id);
        }
    }
}

fn revoke_session(
    inner: &Arc<Inner>,
    dispatcher: &CoreRpcDispatcher,
    remain_active: bool,
    close: bool,
    expected_generation: Option<u64>,
) -> Result<SessionSnapshot, SessionError> {
    let authority = inner
        .authority
        .lock()
        .map_err(|_| SessionError::Unavailable)?;
    if expected_generation.is_some_and(|generation| generation != authority.snapshot.generation) {
        return Ok(authority.snapshot.clone());
    }
    revoke_locked(inner, dispatcher, remain_active, close, authority)
}

fn revoke_locked(
    inner: &Arc<Inner>,
    dispatcher: &CoreRpcDispatcher,
    remain_active: bool,
    close: bool,
    mut authority: MutexGuard<'_, Authority>,
) -> Result<SessionSnapshot, SessionError> {
    if authority.snapshot.phase == SessionPhase::Closed {
        return Ok(authority.snapshot.clone());
    }
    if authority.snapshot.phase == SessionPhase::Failed {
        return Err(SessionError::Unavailable);
    }
    if !close
        && matches!(
            authority.snapshot.phase,
            SessionPhase::Deactivating | SessionPhase::Inactive
        )
    {
        if !remain_active && authority.foreground {
            authority.foreground = false;
            authority.emit(SessionEventKind::Lifecycle, &inner.changed);
        }
        return Ok(authority.snapshot.clone());
    }
    authority.foreground = remain_active && authority.foreground;
    authority.revoke();
    inner.idle_changed.notify_all();
    authority.snapshot.cleanup_pending = true;
    if close {
        authority.snapshot.phase = SessionPhase::Closed;
    }
    authority.emit(SessionEventKind::Lifecycle, &inner.changed);
    let generation = authority.snapshot.generation;
    let snapshot = authority.snapshot.clone();
    let worker_inner = inner.clone();
    let worker_dispatcher = dispatcher.clone();
    let cancellation = dispatcher.cancel_low_priority();
    let queued = dispatcher.schedule_adapter_phase(
        CoreRpcPriority::PrivacyCritical,
        "vault:lock",
        "session_cleanup",
        cancellation,
        move || {
            let inner = worker_inner;
            let dispatcher = worker_dispatcher;
            let bootstrap = inner.adapter.lock().ok().and_then(|mut adapter| {
                storage_backup::cleanup_resources(&inner);
                storage_restore::cleanup_resources(&inner);
                let uploads_cleaned = upload_resource::cleanup_resources(&inner, &mut adapter);
                let response =
                    adapter.handle(&RpcRequest::new("vault:lock", serde_json::json!({})));
                adapter.take_events(); // Raw domain event payloads do not cross this boundary.
                if !uploads_cleaned || !response.is_ok() || adapter.is_unlocked() {
                    return None;
                }
                // A transaction may finish after revocation suppresses its old-generation reply.
                adapter.master_is_configured().ok()
            });
            if let Ok(mut authority) = inner.authority.lock() {
                if authority.snapshot.generation == generation {
                    authority.snapshot.cleanup_pending = false;
                    if let Some(master_configured) = bootstrap {
                        authority.snapshot.master_configured = master_configured;
                    }
                    if authority.snapshot.phase != SessionPhase::Closed {
                        authority.snapshot.phase = if bootstrap.is_none() {
                            SessionPhase::Failed
                        } else if authority.foreground {
                            SessionPhase::Locked
                        } else {
                            SessionPhase::Inactive
                        };
                    }
                    authority.emit(SessionEventKind::Lifecycle, &inner.changed);
                }
            }
            if close {
                let _ = dispatcher.request_shutdown();
            }
        },
    );
    if queued.is_err() {
        authority.snapshot.phase = SessionPhase::Failed;
        authority.emit(SessionEventKind::Lifecycle, &inner.changed);
        return Err(SessionError::Unavailable);
    }
    Ok(snapshot)
}

fn cancel_request(
    inner: &Arc<Inner>,
    dispatcher: &CoreRpcDispatcher,
    key: RequestKey,
) -> Result<(), SessionError> {
    let activation = {
        let authority = inner
            .authority
            .lock()
            .map_err(|_| SessionError::Unavailable)?;
        upload_resource::cancel_resource_request(&authority, key);
        if let RequestKey::Native(request_id) = key {
            credential_import::cancel_resource_request(&authority, request_id)?;
            credential_export::cancel_resource_request(&authority, request_id)?;
            storage_backup::cancel_resource_request(&authority, request_id);
            storage_restore::cancel_resource_request(&authority, request_id);
            storage_erase::cancel_resource_request(&authority, request_id);
            file_reader::cancel_resource_request(&authority, request_id)?;
            if let Some(resource) = authority.document_save.upgrade() {
                let mut state = resource.lock().map_err(|_| SessionError::Unavailable)?;
                if state.request_id == request_id {
                    state.bytes = None;
                }
            }
        }
        authority.pending.get(&key).and_then(|request| {
            request.revoke();
            request.activation.then_some(request.generation)
        })
    };
    upload_resource::schedule_closed_resources(inner)?;
    storage_backup::schedule_closed_resources(inner)?;
    storage_restore::schedule_closed_resources(inner)?;
    if let Some(generation) = activation {
        revoke_session(inner, dispatcher, true, false, Some(generation))?;
    }
    Ok(())
}

impl Drop for LocalSession {
    fn drop(&mut self) {
        let _ = self.close();
    }
}

#[cfg(test)]
#[path = "session_tests.rs"]
mod tests;
