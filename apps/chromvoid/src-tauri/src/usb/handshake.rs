use tokio::io::{AsyncRead, AsyncWrite};

use super::noise_session::{NoiseTransport, MAX_HANDSHAKE_MSG, NOISE_PARAMS_IK, NOISE_PARAMS_XX};
use super::transport;

pub fn encode_hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{:02x}", b)).collect()
}

pub fn decode_hex(s: &str) -> Result<Vec<u8>, String> {
    let s = s.trim();
    if s.len() % 2 != 0 {
        return Err("hex string has odd length".to_string());
    }
    let mut out = Vec::with_capacity(s.len() / 2);
    let mut i = 0;
    while i < s.len() {
        let byte =
            u8::from_str_radix(&s[i..i + 2], 16).map_err(|e| format!("invalid hex at {i}: {e}"))?;
        out.push(byte);
        i += 2;
    }
    Ok(out)
}

pub async fn handshake_xx_initiator<IO>(
    io: &mut IO,
) -> Result<(NoiseTransport, Vec<u8>, snow::Keypair), String>
where
    IO: AsyncRead + AsyncWrite + Unpin,
{
    let params: snow::params::NoiseParams = NOISE_PARAMS_XX
        .parse()
        .map_err(|e: snow::Error| format!("noise params: {e}"))?;

    let keypair = snow::Builder::new(params.clone())
        .generate_keypair()
        .map_err(|e| format!("generate keypair: {e}"))?;

    let mut initiator = snow::Builder::new(params)
        .local_private_key(&keypair.private)
        .map_err(|e| format!("local_private_key: {e}"))?
        .build_initiator()
        .map_err(|e| format!("build_initiator: {e}"))?;

    let mut buf = vec![0u8; MAX_HANDSHAKE_MSG];

    // XX msg1: -> e
    let len = initiator
        .write_message(&[], &mut buf)
        .map_err(|e| format!("xx msg1 write: {e}"))?;
    transport::write_frame(io, &buf[..len])
        .await
        .map_err(|e| format!("xx msg1 send: {e}"))?;

    // XX msg2: <- e, ee, s, es
    let msg2 = transport::read_frame(io)
        .await
        .map_err(|e| format!("xx msg2 recv: {e}"))?;
    initiator
        .read_message(&msg2, &mut buf)
        .map_err(|e| format!("xx msg2 read: {e}"))?;

    // XX msg3: -> s, se
    let len = initiator
        .write_message(&[], &mut buf)
        .map_err(|e| format!("xx msg3 write: {e}"))?;
    transport::write_frame(io, &buf[..len])
        .await
        .map_err(|e| format!("xx msg3 send: {e}"))?;

    let remote_pubkey = initiator
        .get_remote_static()
        .ok_or_else(|| "no remote static key after XX handshake".to_string())?
        .to_vec();

    let transport_state = initiator
        .into_transport_mode()
        .map_err(|e| format!("into_transport_mode: {e}"))?;

    Ok((
        NoiseTransport::new(transport_state, remote_pubkey.clone()),
        remote_pubkey,
        keypair,
    ))
}

pub async fn handshake_ik_initiator<IO>(
    io: &mut IO,
    client_privkey: &[u8],
    device_pubkey: &[u8],
) -> Result<NoiseTransport, String>
where
    IO: AsyncRead + AsyncWrite + Unpin,
{
    let params: snow::params::NoiseParams = NOISE_PARAMS_IK
        .parse()
        .map_err(|e: snow::Error| format!("noise params: {e}"))?;

    let mut initiator = snow::Builder::new(params)
        .local_private_key(client_privkey)
        .map_err(|e| format!("local_private_key: {e}"))?
        .remote_public_key(device_pubkey)
        .map_err(|e| format!("remote_public_key: {e}"))?
        .build_initiator()
        .map_err(|e| format!("build_initiator: {e}"))?;

    let mut buf = vec![0u8; MAX_HANDSHAKE_MSG];

    // IK msg1: -> e, es, s, ss
    let len = initiator
        .write_message(&[], &mut buf)
        .map_err(|e| format!("ik msg1 write: {e}"))?;
    transport::write_frame(io, &buf[..len])
        .await
        .map_err(|e| format!("ik msg1 send: {e}"))?;

    // IK msg2: <- e, ee, se
    let msg2 = transport::read_frame(io)
        .await
        .map_err(|e| format!("ik msg2 recv: {e}"))?;
    initiator
        .read_message(&msg2, &mut buf)
        .map_err(|e| format!("ik msg2 read: {e}"))?;

    let transport_state = initiator
        .into_transport_mode()
        .map_err(|e| format!("into_transport_mode: {e}"))?;

    Ok(NoiseTransport::new(transport_state, device_pubkey.to_vec()))
}
