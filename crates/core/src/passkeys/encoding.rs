use base64::{engine::general_purpose, Engine as _};

pub fn encode_b64url(bytes: &[u8]) -> String {
    general_purpose::URL_SAFE_NO_PAD.encode(bytes)
}

pub fn decode_b64url(value: &str) -> Result<Vec<u8>, base64::DecodeError> {
    general_purpose::URL_SAFE_NO_PAD.decode(value.as_bytes())
}

pub(super) fn cbor_bytes(bytes: &[u8], out: &mut Vec<u8>) {
    cbor_len(2, bytes.len() as u64, out);
    out.extend_from_slice(bytes);
}

fn cbor_len(major: u8, len: u64, out: &mut Vec<u8>) {
    let head = major << 5;
    if len < 24 {
        out.push(head | len as u8);
    } else if len <= u8::MAX as u64 {
        out.extend_from_slice(&[head | 24, len as u8]);
    } else if len <= u16::MAX as u64 {
        out.push(head | 25);
        out.extend_from_slice(&(len as u16).to_be_bytes());
    } else if len <= u32::MAX as u64 {
        out.push(head | 26);
        out.extend_from_slice(&(len as u32).to_be_bytes());
    } else {
        out.push(head | 27);
        out.extend_from_slice(&len.to_be_bytes());
    }
}
