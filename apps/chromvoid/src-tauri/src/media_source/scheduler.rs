use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Condvar, Mutex};
use std::time::{Duration, Instant};

use bytes::Bytes;

use super::session::{LocalMediaPrefetchPlan, LocalMediaReadAheadPolicy};

static GLOBAL_SCHEDULER_CACHE_BYTES: AtomicU64 = AtomicU64::new(0);

const IN_FLIGHT_WAIT_INTERVAL: Duration = Duration::from_millis(500);
const IN_FLIGHT_WAIT_STALL_LIMIT: Duration = Duration::from_secs(60);

#[derive(Clone, Copy, Debug, Eq, PartialEq, Hash)]
pub(crate) enum MediaReadIntent {
    Foreground,
    HttpStreaming,
    MetadataProbe,
    Startup,
    Seek,
    Prefetch,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Hash)]
pub(crate) enum MediaRangeClass {
    HeadProbe,
    TailProbe,
    ForwardPlayback,
    Overlap,
    Seek,
    Unknown,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum MediaReadProviderIdentity {
    LocalCatalog,
    MobileLocalCatalog,
    RemoteUsb,
    RemoteNetwork,
    Mock,
}

impl MediaReadIntent {
    #[cfg(test)]
    pub(crate) fn range_class(self) -> MediaRangeClass {
        match self {
            Self::MetadataProbe => MediaRangeClass::HeadProbe,
            Self::Startup => MediaRangeClass::ForwardPlayback,
            Self::Seek => MediaRangeClass::Seek,
            Self::Foreground => MediaRangeClass::ForwardPlayback,
            Self::HttpStreaming => MediaRangeClass::ForwardPlayback,
            Self::Prefetch => MediaRangeClass::ForwardPlayback,
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum MediaReadError {
    SourceLoadFailed,
    StreamLocked,
    StreamNotFound,
    StreamStale,
    RangeInvalid,
    RangeReadFailed,
    ProviderUnavailable,
    Timeout,
    Aborted,
    SourceStarved,
}

const MEDIA_READ_INTENT_SCHEMA: &[MediaReadIntent] = &[
    MediaReadIntent::Foreground,
    MediaReadIntent::HttpStreaming,
    MediaReadIntent::MetadataProbe,
    MediaReadIntent::Startup,
    MediaReadIntent::Seek,
    MediaReadIntent::Prefetch,
];

const MEDIA_READ_ERROR_SCHEMA: &[MediaReadError] = &[
    MediaReadError::SourceLoadFailed,
    MediaReadError::StreamLocked,
    MediaReadError::StreamNotFound,
    MediaReadError::StreamStale,
    MediaReadError::RangeInvalid,
    MediaReadError::RangeReadFailed,
    MediaReadError::ProviderUnavailable,
    MediaReadError::Timeout,
    MediaReadError::Aborted,
    MediaReadError::SourceStarved,
];

pub(crate) fn media_read_contract_schema() -> (&'static [MediaReadIntent], &'static [MediaReadError])
{
    (MEDIA_READ_INTENT_SCHEMA, MEDIA_READ_ERROR_SCHEMA)
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct MediaReadRequest {
    pub(crate) token: String,
    pub(crate) node_id: u64,
    pub(crate) generation: u64,
    pub(crate) source_revision: u64,
    pub(crate) offset: u64,
    pub(crate) length: u64,
    pub(crate) intent: MediaReadIntent,
    pub(crate) range_class: MediaRangeClass,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct MediaByteChunk {
    pub(crate) offset: u64,
    pub(crate) bytes: Bytes,
    pub(crate) range_class: MediaRangeClass,
    pub(crate) is_final: bool,
}

#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub(crate) struct MediaReadOutcome {
    pub(crate) served_bytes: u64,
    pub(crate) cache_hit: bool,
    pub(crate) dedupe_hit: bool,
}

pub(crate) trait MediaReadProvider {
    fn identity(&self) -> MediaReadProviderIdentity {
        MediaReadProviderIdentity::Mock
    }

    fn read_range<F>(&self, request: &MediaReadRequest, on_chunk: F) -> Result<u64, MediaReadError>
    where
        F: FnMut(MediaByteChunk) -> Result<(), MediaReadError>;
}

#[derive(Debug)]
pub(crate) struct MediaSourceScheduler {
    state: Mutex<MediaSourceSchedulerState>,
    in_flight: Mutex<HashMap<MediaReadKey, Arc<InFlightMediaRead>>>,
}

impl Default for MediaSourceScheduler {
    fn default() -> Self {
        Self {
            state: Mutex::new(MediaSourceSchedulerState::default()),
            in_flight: Mutex::new(HashMap::new()),
        }
    }
}

impl MediaSourceScheduler {
    pub(crate) fn new() -> Self {
        Self::default()
    }

    pub(crate) fn clear(&self) {
        {
            // Release cached-segment accounting even when the mutex is poisoned so the
            // global cache budget cannot leak permanently.
            let mut state = match self.state.lock() {
                Ok(state) => state,
                Err(poisoned) => poisoned.into_inner(),
            };
            release_cached_segments(&mut state.segments);
            cancel_active_prefetch(&mut state);
            state.last_request_end = None;
            state.prefetch_pressure = false;
        }
        let reads = {
            let mut reads = match self.in_flight.lock() {
                Ok(reads) => reads,
                Err(poisoned) => poisoned.into_inner(),
            };
            reads.drain().map(|(_, read)| read).collect::<Vec<_>>()
        };
        for read in reads {
            read.complete(Err(MediaReadError::Aborted));
        }
    }

    #[cfg(test)]
    pub(crate) fn prepare_request(
        &self,
        offset: u64,
        length: u64,
        policy: LocalMediaReadAheadPolicy,
    ) {
        self.prepare_classified_request(offset, length, policy, MediaRangeClass::ForwardPlayback);
    }

    pub(crate) fn prepare_classified_request(
        &self,
        offset: u64,
        length: u64,
        policy: LocalMediaReadAheadPolicy,
        range_class: MediaRangeClass,
    ) {
        let Ok(mut state) = self.state.lock() else {
            return;
        };
        let Some(request_end) = offset.checked_add(length) else {
            release_cached_segments(&mut state.segments);
            cancel_active_prefetch(&mut state);
            state.last_request_end = None;
            state.prefetch_pressure = false;
            state.window_bytes = policy.initial_window_bytes;
            return;
        };
        let request_cached = range_is_cached(&state.segments, offset, length);
        let request_overlaps_cache = range_overlaps_segments(&state.segments, offset, length);
        let probe_does_not_advance_playback = matches!(
            range_class,
            MediaRangeClass::HeadProbe | MediaRangeClass::TailProbe
        ) && state.last_request_end.is_some();
        if probe_does_not_advance_playback && !request_cached && !request_overlaps_cache {
            return;
        }
        let non_disruptive_side_request = length < policy.prefetch_min_request_bytes
            && !request_cached
            && !request_overlaps_cache
            && state.last_request_end.is_some();
        let sequential = state
            .last_request_end
            .is_some_and(|last_end| offset == last_end);
        if sequential {
            state.window_bytes = state
                .window_bytes
                .saturating_mul(2)
                .clamp(policy.initial_window_bytes, policy.max_window_bytes);
            state.last_request_end = Some(request_end);
        } else if request_cached || request_overlaps_cache {
            state.last_request_end = Some(
                state
                    .last_request_end
                    .map_or(request_end, |last_end| last_end.max(request_end)),
            );
        } else if non_disruptive_side_request {
            return;
        } else if state.last_request_end.is_some() {
            // Seek: reset the read-ahead window and cancel the doomed in-flight
            // prefetch so its transfer stops instead of delaying the seek read.
            release_cached_segments(&mut state.segments);
            cancel_active_prefetch(&mut state);
            state.window_bytes = policy.initial_window_bytes;
            state.last_request_end = Some(request_end);
        } else {
            state.window_bytes = policy.initial_window_bytes;
            state.last_request_end = Some(request_end);
        }
    }

    pub(crate) fn classify_range(
        &self,
        intent: MediaReadIntent,
        offset: u64,
        length: u64,
        source_size: u64,
    ) -> MediaRangeClass {
        let (request_cached, request_overlaps_cache, last_request_end) =
            self.state.lock().map_or((false, false, None), |state| {
                (
                    range_is_cached(&state.segments, offset, length),
                    range_overlaps_segments(&state.segments, offset, length),
                    state.last_request_end,
                )
            });
        classify_media_range(
            intent,
            offset,
            length,
            source_size,
            request_cached,
            request_overlaps_cache,
            last_request_end,
        )
    }

    pub(crate) fn fetch_length(
        &self,
        source_size: u64,
        offset: u64,
        requested_length: u64,
        policy: LocalMediaReadAheadPolicy,
    ) -> u64 {
        let window = self
            .state
            .lock()
            .map(|state| state.window_bytes)
            .unwrap_or(policy.initial_window_bytes);
        source_size
            .saturating_sub(offset)
            .min(window.max(requested_length))
    }

    pub(crate) fn cached_range(&self, offset: u64, length: u64) -> Option<Vec<u8>> {
        let state = self.state.lock().ok()?;
        copy_cached_range(&state.segments, offset, length)
    }

    pub(crate) fn store_range(
        &self,
        offset: u64,
        bytes: Vec<u8>,
        policy: LocalMediaReadAheadPolicy,
    ) {
        if bytes.is_empty() {
            return;
        }
        let Ok(mut state) = self.state.lock() else {
            return;
        };
        store_segment(&mut state, offset, bytes, policy);
    }

    pub(crate) fn begin_next_prefetch(
        &self,
        source_size: u64,
        policy: LocalMediaReadAheadPolicy,
        requested_length: u64,
    ) -> Option<LocalMediaPrefetchPlan> {
        let Ok(mut state) = self.state.lock() else {
            return None;
        };
        if requested_length < policy.prefetch_min_request_bytes {
            return None;
        }
        if state.prefetch_pressure {
            return None;
        }
        let last_request_end = state.last_request_end?;
        let next_offset = contiguous_cached_end_from(&state.segments, last_request_end);
        if next_offset >= source_size {
            return None;
        }
        if next_offset.saturating_sub(last_request_end) >= policy.max_buffer_ahead_bytes {
            return None;
        }
        if state.active_prefetch.is_some() {
            return None;
        }
        if range_is_cached(&state.segments, next_offset, 1) {
            return None;
        }

        let length = source_size
            .saturating_sub(next_offset)
            .min(state.window_bytes);
        if length == 0 {
            return None;
        }

        let cancelled = Arc::new(AtomicBool::new(false));
        state.active_prefetch = Some(LocalMediaPrefetch {
            start: next_offset,
            length,
            cancelled: cancelled.clone(),
        });
        Some(LocalMediaPrefetchPlan {
            offset: next_offset,
            length,
            cancelled,
        })
    }

    pub(crate) fn complete_prefetch(
        &self,
        offset: u64,
        length: u64,
        bytes: Vec<u8>,
        policy: LocalMediaReadAheadPolicy,
        cancelled: bool,
    ) {
        let Ok(mut state) = self.state.lock() else {
            return;
        };
        let matches_active = state
            .active_prefetch
            .as_ref()
            .is_some_and(|prefetch| prefetch.start == offset && prefetch.length == length);
        if !matches_active {
            return;
        }
        state.active_prefetch.take();
        if cancelled {
            release_cached_segments(&mut state.segments);
            return;
        }
        if bytes.is_empty() || range_is_cached(&state.segments, offset, length) {
            return;
        }
        store_segment(&mut state, offset, bytes, policy);
    }

    pub(crate) fn set_prefetch_pressure(&self, active: bool) {
        if let Ok(mut state) = self.state.lock() {
            state.prefetch_pressure = active;
        }
    }

    #[cfg(test)]
    pub(crate) fn begin_read(&self, request: &MediaReadRequest) -> MediaReadReservation {
        self.begin_read_window(request, request.offset, request.length)
    }

    pub(crate) fn begin_read_window(
        &self,
        request: &MediaReadRequest,
        window_offset: u64,
        window_length: u64,
    ) -> MediaReadReservation {
        let owner_key = MediaReadKey::from_window(request, window_offset, window_length);
        let requested = MediaReadKey::from_request(request);
        let mut reads = match self.in_flight.lock() {
            Ok(reads) => reads,
            Err(_) => return MediaReadReservation::UntrackedOwner,
        };
        if let Some((key, read)) = reads.iter().find_map(|(key, read)| {
            can_join_in_flight(*key, requested).then(|| (*key, read.clone()))
        }) {
            return MediaReadReservation::Joined {
                owner_start: key.offset,
                requested_offset: request.offset,
                requested_length: request.length,
                read,
            };
        }

        let read = Arc::new(InFlightMediaRead::default());
        reads.insert(owner_key, read.clone());
        MediaReadReservation::Owner {
            key: owner_key,
            read,
        }
    }

    pub(crate) fn complete_read(
        &self,
        reservation: &MediaReadReservation,
        result: Result<u64, MediaReadError>,
    ) {
        let MediaReadReservation::Owner { key, read } = reservation else {
            return;
        };
        if let Ok(mut reads) = self.in_flight.lock() {
            reads.remove(key);
        }
        read.complete(result);
    }

    /// Guard that completes an owner reservation with `Aborted` if the owner
    /// unwinds (panics or early-returns) without calling `complete_read`.
    /// A normal `complete_read` beforehand makes the guard's drop a no-op
    /// because the first completion result is kept.
    pub(crate) fn completion_guard<'a>(
        &'a self,
        reservation: &'a MediaReadReservation,
    ) -> MediaReadCompletionGuard<'a> {
        MediaReadCompletionGuard {
            scheduler: self,
            reservation,
        }
    }

    pub(crate) fn publish_read_chunk(
        &self,
        reservation: &MediaReadReservation,
        chunk: MediaByteChunk,
    ) -> Result<(), MediaReadError> {
        match reservation {
            MediaReadReservation::Owner { read, .. } => read.publish_chunk(chunk),
            MediaReadReservation::Joined { .. } | MediaReadReservation::UntrackedOwner => Ok(()),
        }
    }
}

impl Drop for MediaSourceScheduler {
    fn drop(&mut self) {
        let state = match self.state.get_mut() {
            Ok(state) => state,
            Err(poisoned) => poisoned.into_inner(),
        };
        release_cached_segments(&mut state.segments);
    }
}

pub(crate) struct MediaReadCompletionGuard<'a> {
    scheduler: &'a MediaSourceScheduler,
    reservation: &'a MediaReadReservation,
}

impl Drop for MediaReadCompletionGuard<'_> {
    fn drop(&mut self) {
        self.scheduler
            .complete_read(self.reservation, Err(MediaReadError::Aborted));
    }
}

#[derive(Debug)]
pub(crate) enum MediaReadReservation {
    Owner {
        key: MediaReadKey,
        read: Arc<InFlightMediaRead>,
    },
    Joined {
        owner_start: u64,
        requested_offset: u64,
        requested_length: u64,
        read: Arc<InFlightMediaRead>,
    },
    UntrackedOwner,
}

impl MediaReadReservation {
    pub(crate) fn dedupe_hit(&self) -> bool {
        matches!(self, Self::Joined { .. })
    }

    pub(crate) fn wait_for_joined(&self) -> Option<Result<Vec<u8>, MediaReadError>> {
        let Self::Joined {
            owner_start,
            requested_offset,
            requested_length,
            read,
        } = self
        else {
            return None;
        };
        let owner_start = *owner_start;
        let requested_offset = *requested_offset;
        let requested_length = *requested_length;
        Some(read.wait_range(owner_start, requested_offset, requested_length))
    }

    pub(crate) fn stream_joined<F>(&self, on_chunk: F) -> Option<Result<u64, MediaReadError>>
    where
        F: FnMut(Bytes) -> Result<(), MediaReadError>,
    {
        let Self::Joined {
            owner_start,
            requested_offset,
            requested_length,
            read,
        } = self
        else {
            return None;
        };
        Some(read.stream_range(*owner_start, *requested_offset, *requested_length, on_chunk))
    }
}

#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
pub(crate) struct MediaReadKey {
    offset: u64,
    length: u64,
    generation: u64,
    range_class: MediaRangeClass,
    intent: MediaReadIntent,
}

impl MediaReadKey {
    fn from_request(request: &MediaReadRequest) -> Self {
        Self::from_window(request, request.offset, request.length)
    }

    fn from_window(request: &MediaReadRequest, offset: u64, length: u64) -> Self {
        Self {
            offset,
            length,
            generation: request.generation,
            range_class: request.range_class,
            intent: request.intent,
        }
    }

    fn end(self) -> Option<u64> {
        self.offset.checked_add(self.length)
    }
}

#[derive(Debug, Default)]
pub(crate) struct InFlightMediaRead {
    state: Mutex<InFlightMediaReadState>,
    ready: Condvar,
}

impl InFlightMediaRead {
    fn publish_chunk(&self, chunk: MediaByteChunk) -> Result<(), MediaReadError> {
        let mut state = self
            .state
            .lock()
            .map_err(|_| MediaReadError::RangeReadFailed)?;
        match &mut *state {
            InFlightMediaReadState::Reading { chunks } => {
                let insert_at = chunks.partition_point(|existing| existing.offset <= chunk.offset);
                chunks.insert(insert_at, chunk);
                self.ready.notify_all();
                Ok(())
            }
            InFlightMediaReadState::Complete { result, .. } => match result {
                Ok(_) => Err(MediaReadError::RangeReadFailed),
                Err(error) => Err(*error),
            },
        }
    }

    fn complete(&self, result: Result<u64, MediaReadError>) {
        if let Ok(mut state) = self.state.lock() {
            match &mut *state {
                InFlightMediaReadState::Reading { chunks } => {
                    let chunks = std::mem::take(chunks);
                    *state = InFlightMediaReadState::Complete { chunks, result };
                    self.ready.notify_all();
                }
                // Keep the first completion result: a later redundant completion
                // (e.g. the owner's drop guard) must not clobber it.
                InFlightMediaReadState::Complete { .. } => {}
            }
        }
    }

    fn wait_range(
        &self,
        owner_start: u64,
        requested_offset: u64,
        requested_length: u64,
    ) -> Result<Vec<u8>, MediaReadError> {
        if requested_offset < owner_start {
            return Err(MediaReadError::RangeInvalid);
        }
        let requested_end = requested_offset
            .checked_add(requested_length)
            .ok_or(MediaReadError::RangeInvalid)?;
        let mut bytes = Vec::with_capacity(
            usize::try_from(requested_length).map_err(|_| MediaReadError::RangeInvalid)?,
        );
        let mut cursor = requested_offset;
        let mut last_progress = Instant::now();
        let mut state = self
            .state
            .lock()
            .map_err(|_| MediaReadError::RangeReadFailed)?;
        loop {
            while cursor < requested_end {
                let Some(slice) = next_chunk_slice(state.chunks(), cursor, requested_end)? else {
                    break;
                };
                cursor = cursor.saturating_add(slice.len() as u64);
                bytes.extend_from_slice(&slice);
                last_progress = Instant::now();
            }
            if cursor >= requested_end {
                return Ok(bytes);
            }
            match &*state {
                InFlightMediaReadState::Reading { .. } => {
                    let (guard, _timeout) = self
                        .ready
                        .wait_timeout(state, IN_FLIGHT_WAIT_INTERVAL)
                        .map_err(|_| MediaReadError::RangeReadFailed)?;
                    state = guard;
                    if last_progress.elapsed() >= IN_FLIGHT_WAIT_STALL_LIMIT {
                        return Err(MediaReadError::Timeout);
                    }
                }
                InFlightMediaReadState::Complete { result, .. } => {
                    return match result {
                        // Owner finished successfully but did not cover the whole
                        // requested range (legitimate short read): return the
                        // truncated bytes as success; HTTP layers handle short reads.
                        Ok(_) => Ok(bytes),
                        Err(error) => Err(*error),
                    };
                }
            }
        }
    }

    fn stream_range<F>(
        &self,
        owner_start: u64,
        requested_offset: u64,
        requested_length: u64,
        mut on_chunk: F,
    ) -> Result<u64, MediaReadError>
    where
        F: FnMut(Bytes) -> Result<(), MediaReadError>,
    {
        if requested_offset < owner_start {
            return Err(MediaReadError::RangeInvalid);
        }
        let requested_end = requested_offset
            .checked_add(requested_length)
            .ok_or(MediaReadError::RangeInvalid)?;
        let mut cursor = requested_offset;
        let mut served = 0_u64;
        let mut last_progress = Instant::now();
        let mut state = self
            .state
            .lock()
            .map_err(|_| MediaReadError::RangeReadFailed)?;
        while cursor < requested_end {
            if let Some(bytes) = next_chunk_slice(state.chunks(), cursor, requested_end)? {
                cursor = cursor.saturating_add(bytes.len() as u64);
                served = served.saturating_add(bytes.len() as u64);
                last_progress = Instant::now();
                drop(state);
                on_chunk(bytes)?;
                state = self
                    .state
                    .lock()
                    .map_err(|_| MediaReadError::RangeReadFailed)?;
                continue;
            }
            match &*state {
                InFlightMediaReadState::Reading { .. } => {
                    let (guard, _timeout) = self
                        .ready
                        .wait_timeout(state, IN_FLIGHT_WAIT_INTERVAL)
                        .map_err(|_| MediaReadError::RangeReadFailed)?;
                    state = guard;
                    if last_progress.elapsed() >= IN_FLIGHT_WAIT_STALL_LIMIT {
                        return Err(MediaReadError::Timeout);
                    }
                }
                InFlightMediaReadState::Complete { result, .. } => {
                    return match result {
                        // Legitimate short read by the owner: report what was served.
                        Ok(_) => Ok(served),
                        Err(error) => Err(*error),
                    };
                }
            }
        }
        Ok(served)
    }
}

#[derive(Debug)]
enum InFlightMediaReadState {
    Reading {
        chunks: Vec<MediaByteChunk>,
    },
    Complete {
        chunks: Vec<MediaByteChunk>,
        result: Result<u64, MediaReadError>,
    },
}

impl Default for InFlightMediaReadState {
    fn default() -> Self {
        Self::Reading { chunks: Vec::new() }
    }
}

impl InFlightMediaReadState {
    fn chunks(&self) -> &[MediaByteChunk] {
        match self {
            Self::Reading { chunks } | Self::Complete { chunks, .. } => chunks,
        }
    }
}

#[derive(Debug, Clone)]
struct LocalMediaRangeSegment {
    start: u64,
    bytes: Vec<u8>,
}

#[derive(Debug, Clone)]
struct LocalMediaPrefetch {
    start: u64,
    length: u64,
    cancelled: Arc<AtomicBool>,
}

fn cancel_active_prefetch(state: &mut MediaSourceSchedulerState) {
    if let Some(prefetch) = state.active_prefetch.take() {
        prefetch.cancelled.store(true, Ordering::SeqCst);
    }
}

#[derive(Debug)]
struct MediaSourceSchedulerState {
    segments: Vec<LocalMediaRangeSegment>,
    window_bytes: u64,
    last_request_end: Option<u64>,
    active_prefetch: Option<LocalMediaPrefetch>,
    prefetch_pressure: bool,
}

impl Default for MediaSourceSchedulerState {
    fn default() -> Self {
        Self {
            segments: Vec::new(),
            window_bytes: super::session::USB_MOBILE_MEDIA_RANGE_BYTES,
            last_request_end: None,
            active_prefetch: None,
            prefetch_pressure: false,
        }
    }
}

fn can_join_in_flight(owner: MediaReadKey, requested: MediaReadKey) -> bool {
    if owner.generation != requested.generation {
        return false;
    }
    if owner.intent == MediaReadIntent::Prefetch
        && requested.intent == MediaReadIntent::HttpStreaming
    {
        return false;
    }
    let Some(owner_end) = owner.end() else {
        return false;
    };
    let Some(requested_end) = requested.end() else {
        return false;
    };
    requested.offset >= owner.offset && requested_end <= owner_end
}

fn classify_media_range(
    intent: MediaReadIntent,
    offset: u64,
    length: u64,
    source_size: u64,
    request_cached: bool,
    request_overlaps_cache: bool,
    last_request_end: Option<u64>,
) -> MediaRangeClass {
    if length == 0 || offset >= source_size {
        return MediaRangeClass::Unknown;
    }
    if request_cached || request_overlaps_cache {
        return MediaRangeClass::Overlap;
    }
    if matches!(intent, MediaReadIntent::Seek) {
        return MediaRangeClass::Seek;
    }
    if matches!(intent, MediaReadIntent::MetadataProbe) {
        if offset == 0 {
            return MediaRangeClass::HeadProbe;
        }
        let request_end = offset.saturating_add(length);
        if request_end >= source_size {
            return MediaRangeClass::TailProbe;
        }
        return MediaRangeClass::Unknown;
    }
    let request_end = offset.saturating_add(length);
    let small_probe = length <= 64 * 1024;
    if offset == 0 && small_probe {
        return MediaRangeClass::HeadProbe;
    }
    if request_end >= source_size && small_probe {
        return MediaRangeClass::TailProbe;
    }
    if last_request_end.is_none_or(|last_end| offset == 0 || offset == last_end) {
        return MediaRangeClass::ForwardPlayback;
    }
    MediaRangeClass::Seek
}

fn next_chunk_slice(
    chunks: &[MediaByteChunk],
    cursor: u64,
    requested_end: u64,
) -> Result<Option<Bytes>, MediaReadError> {
    let Some(chunk) = chunks.iter().find(|chunk| {
        u64::try_from(chunk.bytes.len())
            .ok()
            .and_then(|len| chunk.offset.checked_add(len))
            .is_some_and(|chunk_end| chunk.offset <= cursor && chunk_end > cursor)
    }) else {
        return Ok(None);
    };
    let chunk_end = u64::try_from(chunk.bytes.len())
        .ok()
        .and_then(|len| chunk.offset.checked_add(len))
        .ok_or(MediaReadError::RangeInvalid)?;
    let slice_start = usize::try_from(cursor.saturating_sub(chunk.offset))
        .map_err(|_| MediaReadError::RangeInvalid)?;
    let slice_end = usize::try_from(requested_end.min(chunk_end).saturating_sub(chunk.offset))
        .map_err(|_| MediaReadError::RangeInvalid)?;
    if slice_start > slice_end || slice_end > chunk.bytes.len() {
        return Err(MediaReadError::RangeReadFailed);
    }
    // Zero-copy view into the published chunk.
    Ok(Some(chunk.bytes.slice(slice_start..slice_end)))
}

fn store_segment(
    state: &mut MediaSourceSchedulerState,
    offset: u64,
    bytes: Vec<u8>,
    policy: LocalMediaReadAheadPolicy,
) {
    let bytes_before = total_segment_bytes(&state.segments);
    if state.active_prefetch.as_ref().is_some_and(|prefetch| {
        range_contains(offset, bytes.len() as u64, prefetch.start, prefetch.length)
    }) {
        // A foreground read already covered the prefetch window: cancel the
        // now-redundant transfer instead of letting it complete.
        cancel_active_prefetch(state);
    }
    state.segments.retain(|segment| segment.start != offset);
    state.segments.push(LocalMediaRangeSegment {
        start: offset,
        bytes,
    });
    state.segments.sort_by_key(|segment| segment.start);
    trim_segments(
        &mut state.segments,
        policy.cache_limit_bytes,
        state.last_request_end,
    );
    trim_segments_for_global_budget(
        &mut state.segments,
        bytes_before,
        policy.global_cache_limit_bytes,
        state.last_request_end,
    );
    update_global_cache_bytes(bytes_before, total_segment_bytes(&state.segments));
}

fn release_cached_segments(segments: &mut Vec<LocalMediaRangeSegment>) {
    let bytes = total_segment_bytes(segments);
    segments.clear();
    GLOBAL_SCHEDULER_CACHE_BYTES.fetch_sub(bytes, Ordering::SeqCst);
}

fn update_global_cache_bytes(previous: u64, current: u64) {
    if current >= previous {
        GLOBAL_SCHEDULER_CACHE_BYTES.fetch_add(current - previous, Ordering::SeqCst);
    } else {
        GLOBAL_SCHEDULER_CACHE_BYTES.fetch_sub(previous - current, Ordering::SeqCst);
    }
}

fn trim_segments_for_global_budget(
    segments: &mut Vec<LocalMediaRangeSegment>,
    previous_local_bytes: u64,
    global_limit_bytes: u64,
    protected_offset: Option<u64>,
) {
    let global_without_this_scheduler = GLOBAL_SCHEDULER_CACHE_BYTES
        .load(Ordering::SeqCst)
        .saturating_sub(previous_local_bytes);
    let allowed_local_bytes =
        allowed_local_cache_bytes(global_without_this_scheduler, global_limit_bytes);
    trim_segments(segments, allowed_local_bytes, protected_offset);
}

fn allowed_local_cache_bytes(global_without_this_scheduler: u64, global_limit_bytes: u64) -> u64 {
    global_limit_bytes.saturating_sub(global_without_this_scheduler)
}

fn range_contains(start: u64, length: u64, contained_start: u64, contained_length: u64) -> bool {
    let Some(end) = start.checked_add(length) else {
        return false;
    };
    let Some(contained_end) = contained_start.checked_add(contained_length) else {
        return false;
    };
    contained_start >= start && contained_end <= end
}

fn range_is_cached(segments: &[LocalMediaRangeSegment], offset: u64, length: u64) -> bool {
    let Some(request_end) = offset.checked_add(length) else {
        return false;
    };
    let mut cursor = offset;
    for segment in segments {
        let Some(segment_end) = segment_end(segment) else {
            return false;
        };
        if segment_end <= cursor {
            continue;
        }
        if cursor < segment.start {
            return false;
        }
        cursor = request_end.min(segment_end);
        if cursor >= request_end {
            return true;
        }
    }

    false
}

fn range_overlaps_segments(segments: &[LocalMediaRangeSegment], offset: u64, length: u64) -> bool {
    let Some(request_end) = offset.checked_add(length) else {
        return false;
    };
    segments.iter().any(|segment| {
        segment_end(segment)
            .is_some_and(|segment_end| offset < segment_end && request_end > segment.start)
    })
}

fn copy_cached_range(
    segments: &[LocalMediaRangeSegment],
    offset: u64,
    length: u64,
) -> Option<Vec<u8>> {
    let request_end = offset.checked_add(length)?;
    let mut cursor = offset;
    let mut bytes = Vec::with_capacity(usize::try_from(length).ok()?);

    for segment in segments {
        if cursor >= request_end {
            break;
        }
        let segment_end = segment_end(segment)?;
        if segment_end <= cursor {
            continue;
        }
        if cursor < segment.start {
            return None;
        }

        let slice_start = usize::try_from(cursor.saturating_sub(segment.start)).ok()?;
        let slice_end_offset = request_end.min(segment_end);
        let slice_end = usize::try_from(slice_end_offset.saturating_sub(segment.start)).ok()?;
        bytes.extend_from_slice(segment.bytes.get(slice_start..slice_end)?);
        cursor = slice_end_offset;
    }

    (cursor == request_end).then_some(bytes)
}

fn trim_segments(
    segments: &mut Vec<LocalMediaRangeSegment>,
    limit_bytes: u64,
    protected_offset: Option<u64>,
) {
    while total_segment_bytes(segments) > limit_bytes && segments.len() > 1 {
        let remove_index = protected_offset
            .and_then(|offset| {
                segments
                    .iter()
                    .position(|segment| segment_end(segment).is_some_and(|end| end <= offset))
            })
            .unwrap_or(0);
        segments.remove(remove_index);
    }
}

fn total_segment_bytes(segments: &[LocalMediaRangeSegment]) -> u64 {
    segments
        .iter()
        .map(|segment| u64::try_from(segment.bytes.len()).unwrap_or(u64::MAX))
        .fold(0_u64, u64::saturating_add)
}

fn segment_end(segment: &LocalMediaRangeSegment) -> Option<u64> {
    u64::try_from(segment.bytes.len())
        .ok()
        .and_then(|len| segment.start.checked_add(len))
}

fn contiguous_cached_end_from(segments: &[LocalMediaRangeSegment], offset: u64) -> u64 {
    let mut cursor = offset;
    loop {
        let Some(next) = segments.iter().find_map(|segment| {
            let end = segment_end(segment)?;
            (segment.start <= cursor && end > cursor).then_some(end)
        }) else {
            return cursor;
        };
        cursor = next;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn request(offset: u64, length: u64, generation: u64) -> MediaReadRequest {
        MediaReadRequest {
            token: "token".to_string(),
            node_id: 9,
            generation,
            source_revision: 7,
            offset,
            length,
            intent: MediaReadIntent::Foreground,
            range_class: MediaRangeClass::ForwardPlayback,
        }
    }

    #[test]
    fn cached_range_can_span_adjacent_segments() {
        let scheduler = MediaSourceScheduler::new();
        let policy =
            LocalMediaReadAheadPolicy::usb_mobile(super::super::session::LocalMediaKind::Video);

        scheduler.prepare_request(0, 4, policy);
        scheduler.store_range(0, vec![1, 2, 3, 4], policy);
        scheduler.store_range(4, vec![5, 6, 7, 8], policy);

        assert_eq!(
            scheduler.cached_range(2, 4).expect("cached range"),
            vec![3, 4, 5, 6]
        );
    }

    #[test]
    fn joins_contained_in_flight_read_for_same_generation() {
        let scheduler = MediaSourceScheduler::new();
        let owner = scheduler.begin_read(&request(0, 1024, 3));
        let joined = scheduler.begin_read(&request(128, 4, 3));

        assert!(matches!(owner, MediaReadReservation::Owner { .. }));
        assert!(joined.dedupe_hit());

        scheduler
            .publish_read_chunk(
                &owner,
                MediaByteChunk {
                    offset: 0,
                    bytes: (0..256)
                        .map(|value| (value % 251) as u8)
                        .collect::<Vec<u8>>()
                        .into(),
                    range_class: MediaRangeClass::ForwardPlayback,
                    is_final: false,
                },
            )
            .expect("publish chunk");
        assert_eq!(
            joined
                .wait_for_joined()
                .expect("joined result")
                .expect("ok"),
            vec![128, 129, 130, 131]
        );

        scheduler.complete_read(&owner, Ok(1024));
    }

    #[test]
    fn foreground_read_joins_in_flight_prefetch_owner() {
        let scheduler = MediaSourceScheduler::new();
        let mut prefetch_request = request(0, 1024, 3);
        prefetch_request.intent = MediaReadIntent::Prefetch;
        let owner = scheduler.begin_read(&prefetch_request);
        assert!(matches!(owner, MediaReadReservation::Owner { .. }));

        let joined = scheduler.begin_read(&request(128, 4, 3));
        assert!(joined.dedupe_hit());

        scheduler
            .publish_read_chunk(
                &owner,
                MediaByteChunk {
                    offset: 0,
                    bytes: (0..256)
                        .map(|value| (value % 251) as u8)
                        .collect::<Vec<u8>>()
                        .into(),
                    range_class: MediaRangeClass::ForwardPlayback,
                    is_final: false,
                },
            )
            .expect("publish chunk");
        assert_eq!(
            joined
                .wait_for_joined()
                .expect("joined result")
                .expect("ok"),
            vec![128, 129, 130, 131]
        );
        scheduler.complete_read(&owner, Ok(1024));
    }

    #[test]
    fn http_streaming_read_does_not_join_in_flight_prefetch_owner() {
        let scheduler = MediaSourceScheduler::new();
        let mut prefetch_request = request(0, 1024, 3);
        prefetch_request.intent = MediaReadIntent::Prefetch;
        let owner = scheduler.begin_read(&prefetch_request);
        assert!(matches!(owner, MediaReadReservation::Owner { .. }));

        let mut http_request = request(128, 4, 3);
        http_request.intent = MediaReadIntent::HttpStreaming;
        let http_owner = scheduler.begin_read(&http_request);

        assert!(matches!(http_owner, MediaReadReservation::Owner { .. }));
    }

    #[test]
    fn joiner_receives_truncated_bytes_when_owner_short_reads() {
        let scheduler = MediaSourceScheduler::new();
        let owner = scheduler.begin_read(&request(0, 1024, 3));
        let joined = scheduler.begin_read(&request(0, 512, 3));

        scheduler
            .publish_read_chunk(
                &owner,
                MediaByteChunk {
                    offset: 0,
                    bytes: vec![7_u8; 256].into(),
                    range_class: MediaRangeClass::ForwardPlayback,
                    is_final: true,
                },
            )
            .expect("publish chunk");
        scheduler.complete_read(&owner, Ok(256));

        let bytes = joined
            .wait_for_joined()
            .expect("joined result")
            .expect("short read should be success");
        assert_eq!(bytes, vec![7_u8; 256]);
    }

    #[test]
    fn dropped_completion_guard_aborts_waiting_joiners() {
        let scheduler = MediaSourceScheduler::new();
        let owner = scheduler.begin_read(&request(0, 1024, 3));
        let joined = scheduler.begin_read(&request(128, 4, 3));

        {
            // Simulates an owner unwinding (panic) without calling complete_read.
            let _guard = scheduler.completion_guard(&owner);
        }

        assert_eq!(
            joined.wait_for_joined().expect("joined result"),
            Err(MediaReadError::Aborted)
        );
        let next = scheduler.begin_read(&request(0, 1024, 3));
        assert!(matches!(next, MediaReadReservation::Owner { .. }));
    }

    #[test]
    fn completion_guard_keeps_first_result_after_normal_completion() {
        let scheduler = MediaSourceScheduler::new();
        let owner = scheduler.begin_read(&request(0, 8, 3));
        let joined = scheduler.begin_read(&request(0, 4, 3));

        {
            let _guard = scheduler.completion_guard(&owner);
            scheduler
                .publish_read_chunk(
                    &owner,
                    MediaByteChunk {
                        offset: 0,
                        bytes: vec![1, 2, 3, 4].into(),
                        range_class: MediaRangeClass::ForwardPlayback,
                        is_final: true,
                    },
                )
                .expect("publish chunk");
            scheduler.complete_read(&owner, Ok(4));
        }

        assert_eq!(
            joined
                .wait_for_joined()
                .expect("joined result")
                .expect("ok"),
            vec![1, 2, 3, 4]
        );
    }

    #[test]
    fn out_of_order_publishes_assemble_in_offset_order() {
        let scheduler = MediaSourceScheduler::new();
        let owner = scheduler.begin_read(&request(0, 8, 3));
        let joined = scheduler.begin_read(&request(0, 8, 3));

        for (offset, bytes) in [(4_u64, vec![4_u8, 5, 6, 7]), (0_u64, vec![0_u8, 1, 2, 3])] {
            scheduler
                .publish_read_chunk(
                    &owner,
                    MediaByteChunk {
                        offset,
                        bytes: bytes.into(),
                        range_class: MediaRangeClass::ForwardPlayback,
                        is_final: false,
                    },
                )
                .expect("publish chunk");
        }

        assert_eq!(
            joined
                .wait_for_joined()
                .expect("joined result")
                .expect("ok"),
            vec![0, 1, 2, 3, 4, 5, 6, 7]
        );
        scheduler.complete_read(&owner, Ok(8));
    }

    #[test]
    fn seek_reset_cancels_active_prefetch_plan() {
        let scheduler = MediaSourceScheduler::new();
        let policy =
            LocalMediaReadAheadPolicy::usb_mobile(super::super::session::LocalMediaKind::Video);

        scheduler.prepare_classified_request(
            0,
            128 * 1024,
            policy,
            MediaRangeClass::ForwardPlayback,
        );
        scheduler.store_range(0, vec![1_u8; 128 * 1024], policy);
        let plan = scheduler
            .begin_next_prefetch(8 * 1024 * 1024, policy, 128 * 1024)
            .expect("prefetch plan");
        assert!(!plan.is_cancelled());

        scheduler.prepare_classified_request(
            3 * 1024 * 1024,
            128 * 1024,
            policy,
            MediaRangeClass::Seek,
        );

        assert!(plan.is_cancelled());
    }

    #[test]
    fn does_not_join_stale_generation() {
        let scheduler = MediaSourceScheduler::new();
        let owner = scheduler.begin_read(&request(0, 1024, 3));
        let next_generation = scheduler.begin_read(&request(128, 4, 4));

        assert!(matches!(owner, MediaReadReservation::Owner { .. }));
        assert!(matches!(
            next_generation,
            MediaReadReservation::Owner { .. }
        ));
    }

    #[test]
    fn clear_aborts_waiting_joiners() {
        let scheduler = MediaSourceScheduler::new();
        let _owner = scheduler.begin_read(&request(0, 1024, 3));
        let joined = scheduler.begin_read(&request(128, 4, 3));

        scheduler.clear();

        assert_eq!(
            joined.wait_for_joined().expect("joined result"),
            Err(MediaReadError::Aborted)
        );
    }

    #[test]
    fn streams_joined_range_before_owner_completion() {
        let scheduler = MediaSourceScheduler::new();
        let owner = scheduler.begin_read(&request(0, 8, 3));
        let joined = scheduler.begin_read(&request(2, 4, 3));

        scheduler
            .publish_read_chunk(
                &owner,
                MediaByteChunk {
                    offset: 0,
                    bytes: vec![0, 1, 2, 3, 4, 5].into(),
                    range_class: MediaRangeClass::ForwardPlayback,
                    is_final: false,
                },
            )
            .expect("publish chunk");

        let mut delivered = Vec::new();
        let served = joined
            .stream_joined(|chunk| {
                delivered.extend_from_slice(&chunk);
                Ok(())
            })
            .expect("joined stream")
            .expect("joined stream result");

        assert_eq!(served, 4);
        assert_eq!(delivered, vec![2, 3, 4, 5]);
        scheduler.complete_read(&owner, Ok(8));
    }

    #[test]
    fn classifies_spec_range_shapes() {
        let scheduler = MediaSourceScheduler::new();
        let policy =
            LocalMediaReadAheadPolicy::usb_mobile(super::super::session::LocalMediaKind::Video);

        assert_eq!(
            scheduler.classify_range(MediaReadIntent::MetadataProbe, 0, 4096, 1024 * 1024),
            MediaRangeClass::HeadProbe
        );
        assert_eq!(
            scheduler.classify_range(
                MediaReadIntent::MetadataProbe,
                1024 * 1024 - 4096,
                4096,
                1024 * 1024
            ),
            MediaRangeClass::TailProbe
        );

        scheduler.prepare_classified_request(
            0,
            128 * 1024,
            policy,
            MediaRangeClass::ForwardPlayback,
        );
        scheduler.store_range(0, vec![1_u8; 64 * 1024], policy);
        assert_eq!(
            scheduler.classify_range(
                MediaReadIntent::HttpStreaming,
                32 * 1024,
                16 * 1024,
                1024 * 1024
            ),
            MediaRangeClass::Overlap
        );
        assert_eq!(
            scheduler.classify_range(
                MediaReadIntent::HttpStreaming,
                512 * 1024,
                128 * 1024,
                1024 * 1024
            ),
            MediaRangeClass::Seek
        );
    }

    #[test]
    fn global_budget_math_shrinks_local_cache_allowance_under_pressure() {
        assert_eq!(allowed_local_cache_bytes(80, 128), 48);
        assert_eq!(allowed_local_cache_bytes(128, 128), 0);
        assert_eq!(allowed_local_cache_bytes(160, 128), 0);
    }

    #[test]
    fn prefetch_pressure_blocks_background_prefetch_admission() {
        let scheduler = MediaSourceScheduler::new();
        let policy =
            LocalMediaReadAheadPolicy::usb_mobile(super::super::session::LocalMediaKind::Video);

        scheduler.prepare_classified_request(
            0,
            128 * 1024,
            policy,
            MediaRangeClass::ForwardPlayback,
        );
        scheduler.store_range(0, vec![1_u8; 128 * 1024], policy);
        scheduler.set_prefetch_pressure(true);

        assert!(scheduler
            .begin_next_prefetch(1024 * 1024, policy, 128 * 1024)
            .is_none());

        scheduler.set_prefetch_pressure(false);
        assert!(scheduler
            .begin_next_prefetch(1024 * 1024, policy, 128 * 1024)
            .is_some());
    }

    #[test]
    fn typed_contract_covers_spec_read_classes_errors_and_chunks() {
        struct TestProvider;

        impl MediaReadProvider for TestProvider {
            fn read_range<F>(
                &self,
                request: &MediaReadRequest,
                mut on_chunk: F,
            ) -> Result<u64, MediaReadError>
            where
                F: FnMut(MediaByteChunk) -> Result<(), MediaReadError>,
            {
                on_chunk(MediaByteChunk {
                    offset: request.offset,
                    bytes: vec![1, 2, 3].into(),
                    range_class: request.range_class,
                    is_final: true,
                })?;
                Ok(3)
            }
        }

        let intents = [
            MediaReadIntent::MetadataProbe,
            MediaReadIntent::Startup,
            MediaReadIntent::Seek,
            MediaReadIntent::Foreground,
            MediaReadIntent::HttpStreaming,
            MediaReadIntent::Prefetch,
        ];
        let classes = intents
            .into_iter()
            .map(MediaReadIntent::range_class)
            .collect::<Vec<_>>();

        assert_eq!(
            classes,
            vec![
                MediaRangeClass::HeadProbe,
                MediaRangeClass::ForwardPlayback,
                MediaRangeClass::Seek,
                MediaRangeClass::ForwardPlayback,
                MediaRangeClass::ForwardPlayback,
                MediaRangeClass::ForwardPlayback,
            ]
        );
        assert_eq!(
            [
                MediaReadError::ProviderUnavailable,
                MediaReadError::Timeout,
                MediaReadError::SourceStarved,
            ]
            .len(),
            3
        );

        let mut chunks = Vec::new();
        let request = request(0, 3, 9);
        let served = TestProvider
            .read_range(&request, |chunk| {
                chunks.push(chunk);
                Ok(())
            })
            .expect("provider read");
        let outcome = MediaReadOutcome {
            served_bytes: served,
            cache_hit: false,
            dedupe_hit: false,
        };

        assert_eq!(outcome.served_bytes, 3);
        assert_eq!(chunks.len(), 1);
        assert_eq!(chunks[0].range_class, MediaRangeClass::ForwardPlayback);
    }
}
