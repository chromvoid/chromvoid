//! Bounded fragmentation for logical agent messages carried by Noise frames.
//!
//! WebSocket preserves frame order. A fragmented logical message therefore
//! uses consecutive SPEC-002 frames with the same type and message id. Every
//! non-final fragment sets `FLAG_HAS_CONTINUATION`; the final fragment clears
//! it. Non-final payloads are always full-sized, which makes the encoding
//! canonical and bounds the fragment count through the logical byte cap.

use std::fmt;

use crate::frame::{
    frame_continuation, Frame, FrameType, FLAG_HAS_CONTINUATION, MAX_FRAME_PAYLOAD_SIZE,
};

/// Maximum wall-clock time allowed to finish one fragmented logical message.
pub const AGENT_FRAGMENT_REASSEMBLY_TIMEOUT_SECS: u64 = 30;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AgentWireError {
    LogicalFrameHasFlags,
    MessageTooLarge,
    InvalidContinuationSize,
    FragmentSequenceMismatch,
}

impl fmt::Display for AgentWireError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(match self {
            Self::LogicalFrameHasFlags => "logical agent frame must not set transport flags",
            Self::MessageTooLarge => "logical agent message exceeds its byte limit",
            Self::InvalidContinuationSize => "agent continuation frame has a non-canonical size",
            Self::FragmentSequenceMismatch => "agent continuation sequence is out of order",
        })
    }
}

impl std::error::Error for AgentWireError {}

/// Produces one physical frame at a time so large responses are not copied
/// into a second full-message buffer before encryption.
pub struct AgentFrameFragments<'a> {
    frame: &'a Frame,
    offset: usize,
    done: bool,
}

pub fn agent_frame_fragments(
    frame: &Frame,
    max_message_bytes: usize,
) -> Result<AgentFrameFragments<'_>, AgentWireError> {
    if frame.flags != 0 {
        return Err(AgentWireError::LogicalFrameHasFlags);
    }
    if frame.payload.len() > max_message_bytes {
        return Err(AgentWireError::MessageTooLarge);
    }
    Ok(AgentFrameFragments {
        frame,
        offset: 0,
        done: false,
    })
}

impl Iterator for AgentFrameFragments<'_> {
    type Item = Frame;

    fn next(&mut self) -> Option<Self::Item> {
        if self.done {
            return None;
        }

        let end = self
            .offset
            .saturating_add(MAX_FRAME_PAYLOAD_SIZE)
            .min(self.frame.payload.len());
        self.done = end == self.frame.payload.len();
        let payload = self.frame.payload[self.offset..end].to_vec();
        self.offset = end;

        Some(frame_continuation(
            self.frame.frame_type,
            self.frame.message_id,
            payload,
            !self.done,
        ))
    }
}

struct PartialAgentFrame {
    frame_type: FrameType,
    message_id: u64,
    payload: Vec<u8>,
}

/// Reassembles exactly one ordered logical message at a time.
///
/// The caller owns the wall-clock deadline and must close the session when
/// `push` returns an error. Buffer growth is incremental and never exceeds
/// `max_message_bytes`.
pub struct AgentFrameReassembler {
    max_message_bytes: usize,
    partial: Option<PartialAgentFrame>,
}

impl AgentFrameReassembler {
    pub fn new(max_message_bytes: usize) -> Self {
        Self {
            max_message_bytes,
            partial: None,
        }
    }

    pub fn is_reassembling(&self) -> bool {
        self.partial.is_some()
    }

    pub fn push(&mut self, frame: Frame) -> Result<Option<Frame>, AgentWireError> {
        if frame.flags & !FLAG_HAS_CONTINUATION != 0 {
            return Err(AgentWireError::LogicalFrameHasFlags);
        }

        let has_more = frame.has_continuation();
        match self.partial.as_mut() {
            None if !has_more => {
                if frame.payload.len() > self.max_message_bytes {
                    return Err(AgentWireError::MessageTooLarge);
                }
                Ok(Some(frame))
            }
            None => {
                Self::validate_non_final(self.max_message_bytes, &frame.payload, 0)?;
                self.partial = Some(PartialAgentFrame {
                    frame_type: frame.frame_type,
                    message_id: frame.message_id,
                    payload: frame.payload,
                });
                Ok(None)
            }
            Some(partial) => {
                if partial.frame_type != frame.frame_type || partial.message_id != frame.message_id
                {
                    return Err(AgentWireError::FragmentSequenceMismatch);
                }

                let current_len = partial.payload.len();
                if has_more {
                    Self::validate_non_final(self.max_message_bytes, &frame.payload, current_len)?;
                } else if frame.payload.is_empty() {
                    return Err(AgentWireError::InvalidContinuationSize);
                }

                let total_len = current_len
                    .checked_add(frame.payload.len())
                    .ok_or(AgentWireError::MessageTooLarge)?;
                if total_len > self.max_message_bytes {
                    return Err(AgentWireError::MessageTooLarge);
                }
                partial.payload.extend_from_slice(&frame.payload);

                if has_more {
                    return Ok(None);
                }

                let completed = self
                    .partial
                    .take()
                    .expect("partial agent frame exists while completing");
                Ok(Some(Frame {
                    frame_type: completed.frame_type,
                    message_id: completed.message_id,
                    flags: 0,
                    payload: completed.payload,
                }))
            }
        }
    }

    fn validate_non_final(
        max_message_bytes: usize,
        payload: &[u8],
        current_len: usize,
    ) -> Result<(), AgentWireError> {
        if payload.len() != MAX_FRAME_PAYLOAD_SIZE {
            return Err(AgentWireError::InvalidContinuationSize);
        }
        let total_len = current_len
            .checked_add(payload.len())
            .ok_or(AgentWireError::MessageTooLarge)?;
        if total_len >= max_message_bytes {
            return Err(AgentWireError::MessageTooLarge);
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agent::{AGENT_MAX_REQUEST_BYTES, AGENT_MAX_RESPONSE_BYTES};

    fn logical_frame(payload: Vec<u8>) -> Frame {
        Frame {
            frame_type: FrameType::RpcRequest,
            message_id: 42,
            flags: 0,
            payload,
        }
    }

    #[test]
    fn max_request_roundtrips_across_noise_sized_frames() {
        let original = logical_frame(vec![7; AGENT_MAX_REQUEST_BYTES]);
        let fragments = agent_frame_fragments(&original, AGENT_MAX_REQUEST_BYTES)
            .expect("fragment request")
            .collect::<Vec<_>>();
        assert!(fragments.len() > 1);
        assert!(
            fragments[..fragments.len() - 1]
                .iter()
                .all(|frame| frame.payload.len() == MAX_FRAME_PAYLOAD_SIZE
                    && frame.has_continuation())
        );
        assert!(!fragments.last().expect("final fragment").has_continuation());

        let mut reassembler = AgentFrameReassembler::new(AGENT_MAX_REQUEST_BYTES);
        let mut completed = None;
        for fragment in fragments {
            completed = reassembler.push(fragment).expect("reassemble request");
        }
        let completed = completed.expect("complete request");
        assert_eq!(completed.frame_type, original.frame_type);
        assert_eq!(completed.message_id, original.message_id);
        assert_eq!(completed.flags, 0);
        assert_eq!(completed.payload, original.payload);
    }

    #[test]
    fn single_frame_encoding_stays_unchanged() {
        let original = logical_frame(b"small".to_vec());
        let fragments = agent_frame_fragments(&original, AGENT_MAX_REQUEST_BYTES)
            .expect("fragment request")
            .collect::<Vec<_>>();
        assert_eq!(fragments.len(), 1);
        assert_eq!(fragments[0].frame_type, original.frame_type);
        assert_eq!(fragments[0].message_id, original.message_id);
        assert_eq!(fragments[0].flags, 0);
        assert_eq!(fragments[0].payload, original.payload);
    }

    #[test]
    fn response_larger_than_one_noise_frame_roundtrips() {
        let original = Frame {
            frame_type: FrameType::RpcResponse,
            message_id: 43,
            flags: 0,
            payload: vec![9; MAX_FRAME_PAYLOAD_SIZE * 2 + 17],
        };
        let mut reassembler = AgentFrameReassembler::new(AGENT_MAX_RESPONSE_BYTES);
        let mut completed = None;
        for fragment in
            agent_frame_fragments(&original, AGENT_MAX_RESPONSE_BYTES).expect("fragment response")
        {
            completed = reassembler.push(fragment).expect("reassemble response");
        }
        assert_eq!(
            completed.expect("complete response").payload,
            original.payload
        );
    }

    #[test]
    fn rejects_out_of_order_or_non_canonical_fragments() {
        let mut reassembler = AgentFrameReassembler::new(AGENT_MAX_REQUEST_BYTES);
        let short_continuation = frame_continuation(FrameType::RpcRequest, 1, vec![1], true);
        assert_eq!(
            reassembler.push(short_continuation).unwrap_err(),
            AgentWireError::InvalidContinuationSize
        );

        let first = frame_continuation(
            FrameType::RpcRequest,
            1,
            vec![1; MAX_FRAME_PAYLOAD_SIZE],
            true,
        );
        assert!(reassembler.push(first).expect("first fragment").is_none());
        let different_message = frame_continuation(FrameType::RpcRequest, 2, vec![2], false);
        assert_eq!(
            reassembler.push(different_message).unwrap_err(),
            AgentWireError::FragmentSequenceMismatch
        );
    }

    #[test]
    fn rejects_messages_over_the_configured_limit_before_completion() {
        let limit = MAX_FRAME_PAYLOAD_SIZE + 1;
        let mut reassembler = AgentFrameReassembler::new(limit);
        let first = frame_continuation(
            FrameType::RpcResponse,
            9,
            vec![1; MAX_FRAME_PAYLOAD_SIZE],
            true,
        );
        assert!(reassembler.push(first).expect("first fragment").is_none());
        let final_fragment = frame_continuation(FrameType::RpcResponse, 9, vec![2, 3], false);
        assert_eq!(
            reassembler.push(final_fragment).unwrap_err(),
            AgentWireError::MessageTooLarge
        );
    }

    #[test]
    fn encoder_rejects_oversized_or_prefragmented_logical_frames() {
        let oversized = logical_frame(vec![0; AGENT_MAX_REQUEST_BYTES + 1]);
        assert!(matches!(
            agent_frame_fragments(&oversized, AGENT_MAX_REQUEST_BYTES),
            Err(AgentWireError::MessageTooLarge)
        ));

        let mut prefragmented = logical_frame(vec![0]);
        prefragmented.flags = FLAG_HAS_CONTINUATION;
        assert!(matches!(
            agent_frame_fragments(&prefragmented, AGENT_MAX_REQUEST_BYTES),
            Err(AgentWireError::LogicalFrameHasFlags)
        ));
    }
}
