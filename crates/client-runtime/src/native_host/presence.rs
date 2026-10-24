//! Ordered control-plane writes outlive the listener futures that requested them.
use chromvoid_network_runtime::ios_control::{
    HostPresence, PublishHostPresenceRequest, publish_host_presence,
};
use std::sync::Mutex;
use std::time::Duration;
use tokio::runtime::Runtime;
use tokio::sync::{mpsc, oneshot};

pub(super) const TTL_MS: u64 = 5 * 60 * 1_000;
const TIMEOUT: Duration = Duration::from_secs(15);
type Reply = oneshot::Sender<Result<HostPresence, String>>;

struct Publication {
    device: String,
    request: PublishHostPresenceRequest,
    reply: Option<Reply>,
}

pub(super) struct PresencePublisher {
    queue: mpsc::UnboundedSender<Publication>,
    // The admitted target includes a ready request whose HTTP response has not arrived.
    target: Mutex<Option<(String, PublishHostPresenceRequest)>>,
}

impl PresencePublisher {
    pub(super) fn new(executor: &Runtime) -> Self {
        let (queue, mut pending) = mpsc::unbounded_channel::<Publication>();
        executor.spawn(async move {
            while let Some(publication) = pending.recv().await {
                // A canceled listener need not start a queued ready write. Once sent,
                // however, it must finish before a later offline/ready request begins.
                if publication.reply.as_ref().is_some_and(Reply::is_closed) {
                    continue;
                }
                let result = tokio::time::timeout(
                    TIMEOUT,
                    publish_host_presence(
                        &publication.request.relay_url,
                        &publication.device,
                        &publication.request,
                    ),
                )
                .await
                .map_err(|_| "Host presence timed out".to_owned())
                .and_then(|result| result);
                if let Some(reply) = publication.reply {
                    let _ = reply.send(result);
                }
            }
        });
        Self {
            queue,
            target: Mutex::new(None),
        }
    }

    /// Called under the host gate after checking the listener's authority.
    pub(super) fn ready(
        &self,
        relay: &str,
        device: &str,
        room: &str,
    ) -> Result<oneshot::Receiver<Result<HostPresence, String>>, String> {
        let request = PublishHostPresenceRequest {
            relay_url: relay.into(),
            room_id: room.into(),
            status: "ready".into(),
            ttl_ms: Some(TTL_MS),
        };
        let mut target = self
            .target
            .lock()
            .map_err(|_| "Host presence unavailable")?;
        let (reply, response) = oneshot::channel();
        self.queue
            .send(Publication {
                device: device.into(),
                request: request.clone(),
                reply: Some(reply),
            })
            .map_err(|_| "Host presence unavailable")?;
        *target = Some((device.into(), request));
        Ok(response)
    }

    /// Enqueue retirement before another host generation can enqueue its ready state.
    pub(super) fn offline(&self) -> Result<(), String> {
        let mut target = self
            .target
            .lock()
            .map_err(|_| "Host presence unavailable")?;
        if let Some((device, mut request)) = target.take() {
            request.status = "offline".into();
            request.ttl_ms = Some(1_000);
            self.queue
                .send(Publication {
                    device,
                    request,
                    reply: None,
                })
                .map_err(|_| "Host presence unavailable")?;
        }
        Ok(())
    }
}
