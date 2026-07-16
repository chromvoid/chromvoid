use tokio::time::Instant;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum StreamLifecycleDirection {
    Send,
    Recv,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum StreamLifecycleTerminalState {
    Finished,
    Cancelled,
    ReadFailed,
}

#[derive(Clone, Debug)]
pub(crate) struct StreamLifecycleSnapshot {
    pub(crate) command: String,
    pub(crate) chunks: u64,
    pub(crate) bytes: u64,
    pub(crate) duration_ms: u128,
}

#[derive(Clone, Debug)]
pub(crate) struct StreamLifecycleTracker {
    command: String,
    direction: StreamLifecycleDirection,
    peer_label: Option<String>,
    chunks: u64,
    bytes: u64,
    started_at: Instant,
    terminal_state: Option<StreamLifecycleTerminalState>,
}

impl StreamLifecycleTracker {
    pub(crate) fn start(
        command: impl Into<String>,
        direction: StreamLifecycleDirection,
        peer_label: Option<String>,
    ) -> Self {
        Self {
            command: command.into(),
            direction,
            peer_label,
            chunks: 0,
            bytes: 0,
            started_at: Instant::now(),
            terminal_state: None,
        }
    }

    pub(crate) fn command(&self) -> &str {
        &self.command
    }

    pub(crate) fn chunks(&self) -> u64 {
        self.chunks
    }

    pub(crate) fn record_chunk(&mut self, bytes: usize) -> StreamLifecycleSnapshot {
        self.chunks = self.chunks.saturating_add(1);
        self.bytes = self.bytes.saturating_add(bytes as u64);
        self.snapshot()
    }

    pub(crate) fn finish(&mut self) -> StreamLifecycleSnapshot {
        self.terminal(StreamLifecycleTerminalState::Finished)
    }

    pub(crate) fn cancel(&mut self) -> StreamLifecycleSnapshot {
        self.terminal(StreamLifecycleTerminalState::Cancelled)
    }

    pub(crate) fn read_failed(&mut self) -> StreamLifecycleSnapshot {
        self.terminal(StreamLifecycleTerminalState::ReadFailed)
    }

    pub(crate) fn snapshot(&self) -> StreamLifecycleSnapshot {
        let _ = self.direction;
        let _ = self.peer_label.as_deref();
        StreamLifecycleSnapshot {
            command: self.command.clone(),
            chunks: self.chunks,
            bytes: self.bytes,
            duration_ms: self.started_at.elapsed().as_millis(),
        }
    }

    fn terminal(&mut self, state: StreamLifecycleTerminalState) -> StreamLifecycleSnapshot {
        if self.terminal_state.is_none() {
            self.terminal_state = Some(state);
        }
        self.snapshot()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stream_lifecycle_records_chunks_and_terminal_state_once() {
        let mut lifecycle = StreamLifecycleTracker::start(
            "catalog:download",
            StreamLifecycleDirection::Recv,
            Some("peer".to_string()),
        );

        let first = lifecycle.record_chunk(3);
        assert_eq!(first.chunks, 1);
        assert_eq!(first.bytes, 3);
        assert_eq!(first.command, "catalog:download");

        let finished = lifecycle.finish();
        assert_eq!(finished.chunks, 1);
        assert_eq!(finished.bytes, 3);

        let after_cancel = lifecycle.cancel();
        assert_eq!(after_cancel.chunks, 1);
        assert_eq!(after_cancel.bytes, 3);
    }
}
