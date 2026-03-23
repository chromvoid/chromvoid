//! SSH agent wire protocol: framing, message types, parse & serialize.
//!
//! Implements the minimal subset of the SSH agent protocol (RFC draft-miller-ssh-agent):
//! - REQUEST_IDENTITIES (11) → IDENTITIES_ANSWER (12)
//! - SIGN_REQUEST (13) → SIGN_RESPONSE (14) / FAILURE (5)

// Message type constants
pub const SSH_AGENTC_REQUEST_IDENTITIES: u8 = 11;
pub const SSH_AGENT_IDENTITIES_ANSWER: u8 = 12;
pub const SSH_AGENTC_SIGN_REQUEST: u8 = 13;
pub const SSH_AGENT_SIGN_RESPONSE: u8 = 14;
pub const SSH_AGENT_FAILURE: u8 = 5;

/// Read a framed message from a byte buffer.
/// Wire format: [u32 len (big-endian)][u8 type][payload...]
/// Returns (message_type, payload) or None if buffer is incomplete.
pub fn parse_message(buf: &[u8]) -> Option<(u8, Vec<u8>, usize)> {
    if buf.len() < 4 {
        return None;
    }
    let len = u32::from_be_bytes([buf[0], buf[1], buf[2], buf[3]]) as usize;
    if len == 0 || buf.len() < 4 + len {
        return None;
    }
    let msg_type = buf[4];
    let payload = buf[5..4 + len].to_vec();
    Some((msg_type, payload, 4 + len))
}

/// Serialize a message into wire format.
pub fn build_message(msg_type: u8, payload: &[u8]) -> Vec<u8> {
    let len = (1 + payload.len()) as u32;
    let mut out = Vec::with_capacity(4 + len as usize);
    out.extend_from_slice(&len.to_be_bytes());
    out.push(msg_type);
    out.extend_from_slice(payload);
    out
}

/// Build SSH_AGENT_FAILURE response.
pub fn build_failure() -> Vec<u8> {
    build_message(SSH_AGENT_FAILURE, &[])
}

/// Build IDENTITIES_ANSWER from a list of (key_blob, comment) pairs.
pub fn build_identities_answer(identities: &[(Vec<u8>, String)]) -> Vec<u8> {
    let count = identities.len() as u32;
    let mut payload = Vec::new();
    payload.extend_from_slice(&count.to_be_bytes());
    for (key_blob, comment) in identities {
        // key blob as SSH string
        payload.extend_from_slice(&(key_blob.len() as u32).to_be_bytes());
        payload.extend_from_slice(key_blob);
        // comment as SSH string
        let comment_bytes = comment.as_bytes();
        payload.extend_from_slice(&(comment_bytes.len() as u32).to_be_bytes());
        payload.extend_from_slice(comment_bytes);
    }
    build_message(SSH_AGENT_IDENTITIES_ANSWER, &payload)
}

pub fn parse_identities_answer(payload: &[u8]) -> Option<Vec<(Vec<u8>, String)>> {
    if payload.len() < 4 {
        return None;
    }

    let mut offset = 0;
    let count = u32::from_be_bytes([
        payload[offset],
        payload[offset + 1],
        payload[offset + 2],
        payload[offset + 3],
    ]) as usize;
    offset += 4;

    let max_count = (payload.len() - 4) / 8;
    if count > max_count {
        return None;
    }

    let mut out = Vec::with_capacity(count);

    for _ in 0..count {
        if payload.len() < offset + 4 {
            return None;
        }
        let key_len = u32::from_be_bytes([
            payload[offset],
            payload[offset + 1],
            payload[offset + 2],
            payload[offset + 3],
        ]) as usize;
        offset += 4;
        if payload.len() < offset + key_len {
            return None;
        }
        let key_blob = payload[offset..offset + key_len].to_vec();
        offset += key_len;

        if payload.len() < offset + 4 {
            return None;
        }
        let comment_len = u32::from_be_bytes([
            payload[offset],
            payload[offset + 1],
            payload[offset + 2],
            payload[offset + 3],
        ]) as usize;
        offset += 4;
        if payload.len() < offset + comment_len {
            return None;
        }
        let comment = String::from_utf8(payload[offset..offset + comment_len].to_vec()).ok()?;
        offset += comment_len;

        out.push((key_blob, comment));
    }

    if offset != payload.len() {
        return None;
    }

    Some(out)
}

/// Parse SIGN_REQUEST payload → (key_blob, data_to_sign, flags).
pub fn parse_sign_request(payload: &[u8]) -> Option<(Vec<u8>, Vec<u8>, u32)> {
    let mut offset = 0;

    // key blob
    if payload.len() < offset + 4 {
        return None;
    }
    let key_len = u32::from_be_bytes([
        payload[offset],
        payload[offset + 1],
        payload[offset + 2],
        payload[offset + 3],
    ]) as usize;
    offset += 4;
    if payload.len() < offset + key_len {
        return None;
    }
    let key_blob = payload[offset..offset + key_len].to_vec();
    offset += key_len;

    // data
    if payload.len() < offset + 4 {
        return None;
    }
    let data_len = u32::from_be_bytes([
        payload[offset],
        payload[offset + 1],
        payload[offset + 2],
        payload[offset + 3],
    ]) as usize;
    offset += 4;
    if payload.len() < offset + data_len {
        return None;
    }
    let data = payload[offset..offset + data_len].to_vec();
    offset += data_len;

    // flags (optional, default 0)
    let flags = if payload.len() >= offset + 4 {
        u32::from_be_bytes([
            payload[offset],
            payload[offset + 1],
            payload[offset + 2],
            payload[offset + 3],
        ])
    } else {
        0
    };

    Some((key_blob, data, flags))
}

/// Build SIGN_RESPONSE from a signature blob.
pub fn build_sign_response(signature: &[u8]) -> Vec<u8> {
    let mut payload = Vec::new();
    payload.extend_from_slice(&(signature.len() as u32).to_be_bytes());
    payload.extend_from_slice(signature);
    build_message(SSH_AGENT_SIGN_RESPONSE, &payload)
}

/// Encode an SSH signature in the standard wire format:
/// string algorithm_name + string signature_blob
pub fn encode_ssh_signature(algorithm: &str, sig_bytes: &[u8]) -> Vec<u8> {
    let algo_bytes = algorithm.as_bytes();
    let mut out = Vec::new();
    out.extend_from_slice(&(algo_bytes.len() as u32).to_be_bytes());
    out.extend_from_slice(algo_bytes);
    out.extend_from_slice(&(sig_bytes.len() as u32).to_be_bytes());
    out.extend_from_slice(sig_bytes);
    out
}

#[cfg(test)]
mod tests {
    use super::{build_identities_answer, parse_identities_answer, SSH_AGENT_IDENTITIES_ANSWER};

    #[test]
    fn identities_answer_roundtrip() {
        let identities = vec![
            (vec![1, 2, 3, 4], "first".to_string()),
            (vec![9, 8, 7], "second".to_string()),
        ];

        let wire = build_identities_answer(&identities);
        let payload_len = u32::from_be_bytes([wire[0], wire[1], wire[2], wire[3]]) as usize;
        assert_eq!(wire[4], SSH_AGENT_IDENTITIES_ANSWER);
        assert_eq!(payload_len + 4, wire.len());

        let parsed = parse_identities_answer(&wire[5..]).expect("identities payload must parse");
        assert_eq!(parsed, identities);
    }

    #[test]
    fn identities_answer_rejects_trailing_bytes() {
        let identities = vec![(vec![0xAA], "only".to_string())];
        let mut wire = build_identities_answer(&identities);
        wire.push(0xFF);

        assert!(parse_identities_answer(&wire[5..]).is_none());
    }
}
