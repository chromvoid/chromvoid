/// Perform Noise IK handshake over a `RemoteTransport`.
/// Returns the transport (for the io_task) and the Noise session.
pub(crate) async fn handshake_ik_over_transport(
    mut transport: Box<dyn chromvoid_protocol::RemoteTransport>,
    client_privkey: &[u8],
    peer_pubkey: &[u8],
) -> Result<
    (
        Box<dyn chromvoid_protocol::RemoteTransport>,
        chromvoid_protocol::NoiseTransport,
    ),
    String,
> {
    let params: snow::params::NoiseParams = chromvoid_protocol::NOISE_PARAMS_IK
        .parse()
        .map_err(|e: snow::Error| format!("noise params: {e}"))?;

    let mut initiator = snow::Builder::new(params)
        .local_private_key(client_privkey)
        .map_err(|e| format!("local_private_key: {e}"))?
        .remote_public_key(peer_pubkey)
        .map_err(|e| format!("remote_public_key: {e}"))?
        .build_initiator()
        .map_err(|e| format!("build_initiator: {e}"))?;

    let mut buf = vec![0u8; chromvoid_protocol::MAX_HANDSHAKE_MSG];

    // IK msg1: -> e, es, s, ss
    let len = initiator
        .write_message(&[], &mut buf)
        .map_err(|e| format!("ik msg1 write: {e}"))?;
    transport
        .send(&buf[..len])
        .await
        .map_err(|e| format!("ik msg1 send: {e}"))?;

    // IK msg2: <- e, ee, se
    let msg2 = transport
        .recv()
        .await
        .map_err(|e| format!("ik msg2 recv: {e}"))?;
    initiator
        .read_message(&msg2, &mut buf)
        .map_err(|e| format!("ik msg2 read: {e}"))?;

    let transport_state = initiator
        .into_transport_mode()
        .map_err(|e| format!("into_transport_mode: {e}"))?;

    let noise = chromvoid_protocol::NoiseTransport::new(transport_state, peer_pubkey.to_vec());
    Ok((transport, noise))
}
