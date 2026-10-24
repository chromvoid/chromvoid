//! Keep host responses and events revocable until they leave the transport boundary.
use super::peer_session::{PeerLease, PeerSession};
use super::*;
use async_trait::async_trait;
use chromvoid_protocol::{RemoteTransport, TransportError, TransportType};
use std::future::{Future, poll_fn};
use std::task::Poll;

enum PublicationOwner {
    Request {
        pending: Arc<PendingRequest>,
        cancel: Arc<AtomicBool>,
    },
    Peer(Arc<PeerLease>),
}

/// Retains the original request or peer through publication, without retaining
/// LocalSession or authorizing a new request. Drop it when publication ends.
pub struct PeerPublication {
    owner: PublicationOwner,
    generation: u64,
    revoked: watch::Receiver<bool>,
}

impl AdmittedRequest {
    /// Obtain before consuming the admitted request for execution. Native UI requests
    /// cannot create peer transport capabilities.
    pub fn peer_publication(&self) -> Result<PeerPublication, SessionError> {
        if self.pending.peer_lease.is_none() {
            return Err(SessionError::RequestId);
        }
        let mut authority = self
            .pending
            .inner
            .authority
            .lock()
            .map_err(|_| SessionError::Unavailable)?;
        if !authority.accepts(self.generation) {
            return Err(SessionError::Revoked);
        }
        if self.cancel.load(Ordering::Acquire) {
            return Err(SessionError::Canceled);
        }
        let control = authority
            .pending
            .get_mut(&self.pending.id)
            .ok_or(SessionError::Revoked)?;
        let revoked = control
            .publication_revoked
            .get_or_insert_with(|| watch::channel(false).0)
            .subscribe();
        Ok(PeerPublication {
            owner: PublicationOwner::Request {
                pending: self.pending.clone(),
                cancel: self.cancel.clone(),
            },
            generation: self.generation,
            revoked,
        })
    }
}

impl PeerSession {
    /// Events share the admitted peer's generation without creating a request.
    pub(super) fn event_publication(&self) -> Result<PeerPublication, SessionError> {
        let peer = self.lease()?;
        let authority = peer
            .inner
            .authority
            .lock()
            .map_err(|_| SessionError::Unavailable)?;
        if !authority.accepts(peer.generation)
            || authority
                .peer_sessions
                .get(&peer.id)
                .is_none_or(|state| state.closed)
        {
            return Err(SessionError::Revoked);
        }
        let generation = peer.generation;
        let revoked = peer.closed.subscribe();
        drop(authority);
        Ok(PeerPublication {
            owner: PublicationOwner::Peer(peer),
            generation,
            revoked,
        })
    }
}

impl PeerPublication {
    /// Use with the shared frame/stream functions. A transport must only perform I/O
    /// when polled; it must not reenter LocalSession synchronously. Every I/O poll is
    /// serialized with revocation, without holding the authority guard while waiting.
    ///
    /// On any I/O error, close the connection: a canceled partial write and its Noise
    /// nonce cannot be retried. Bytes accepted by the transport before revocation
    /// cannot be recalled from network buffers.
    pub fn transport<'a>(
        &'a self,
        transport: &'a mut dyn RemoteTransport,
    ) -> impl RemoteTransport + 'a {
        PublicationTransport {
            publication: self,
            transport,
        }
    }

    async fn io<T>(
        &self,
        operation: impl Future<Output = Result<T, TransportError>>,
    ) -> Result<T, TransportError> {
        let mut revoked = self.revoked.clone();
        let mut notified = std::pin::pin!(revoked.changed());
        let mut operation = std::pin::pin!(operation);
        poll_fn(|cx| {
            let inner = match &self.owner {
                PublicationOwner::Request { pending, .. } => &pending.inner,
                PublicationOwner::Peer(peer) => &peer.inner,
            };
            let Ok(authority) = inner.authority.lock() else {
                return Poll::Ready(Err(TransportError::Closed));
            };
            let owner_valid = match &self.owner {
                PublicationOwner::Request { cancel, .. } => !cancel.load(Ordering::Acquire),
                PublicationOwner::Peer(peer) => authority
                    .peer_sessions
                    .get(&peer.id)
                    .is_some_and(|state| !state.closed),
            };
            if !authority.accepts(self.generation) || !owner_valid {
                return Poll::Ready(Err(TransportError::Closed));
            }
            // Register before polling I/O; cancellation or peer close also wakes a
            // transport that is indefinitely waiting for its socket.
            if notified.as_mut().poll(cx).is_ready() {
                return Poll::Ready(Err(TransportError::Closed));
            }
            operation.as_mut().poll(cx)
        })
        .await
    }
}

struct PublicationTransport<'a> {
    publication: &'a PeerPublication,
    transport: &'a mut dyn RemoteTransport,
}

#[async_trait]
impl RemoteTransport for PublicationTransport<'_> {
    async fn send(&mut self, data: &[u8]) -> Result<(), TransportError> {
        self.publication.io(self.transport.send(data)).await
    }

    async fn recv(&mut self) -> Result<Vec<u8>, TransportError> {
        self.publication.io(self.transport.recv()).await
    }

    async fn close(&mut self) -> Result<(), TransportError> {
        self.transport.close().await
    }

    fn transport_type(&self) -> TransportType {
        self.transport.transport_type()
    }
}
