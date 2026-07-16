use crate::core_adapter::RemoteRpcPriority;
use crate::remote_data_plane::models::RemoteIoRequest;
use std::collections::VecDeque;

#[derive(Default)]
pub(super) struct RequestQueues {
    high: VecDeque<RemoteIoRequest>,
    media: VecDeque<RemoteIoRequest>,
    normal: VecDeque<RemoteIoRequest>,
    low: VecDeque<RemoteIoRequest>,
}

impl RequestQueues {
    pub(super) fn push(&mut self, request: RemoteIoRequest) {
        match request.priority {
            RemoteRpcPriority::High => self.high.push_back(request),
            RemoteRpcPriority::Media => self.media.push_back(request),
            RemoteRpcPriority::Normal => self.normal.push_back(request),
            RemoteRpcPriority::Low => self.low.push_back(request),
        }
    }

    /// Pop the next request by priority. With `skip_media` the Media queue is
    /// left untouched so a deferred media range request does not block the
    /// remaining queues from draining.
    pub(super) fn pop_next(&mut self, skip_media: bool) -> Option<RemoteIoRequest> {
        self.high
            .pop_front()
            .or_else(|| {
                if skip_media {
                    None
                } else {
                    self.media.pop_front()
                }
            })
            .or_else(|| self.normal.pop_front())
            .or_else(|| self.low.pop_front())
    }

    pub(super) fn push_front(&mut self, request: RemoteIoRequest) {
        match request.priority {
            RemoteRpcPriority::High => self.high.push_front(request),
            RemoteRpcPriority::Media => self.media.push_front(request),
            RemoteRpcPriority::Normal => self.normal.push_front(request),
            RemoteRpcPriority::Low => self.low.push_front(request),
        }
    }
}
