/// Send an error frame before disconnecting. Best-effort: ignores send failures.
macro_rules! try_send_session_error {
    ($transport:expr, $write:expr, $sid:expr, $code:expr, $msg:expr) => {{
        *$sid = ($sid).wrapping_add(1).max(1);
        let ef_plain = super::encoded_error_frame(*$sid, $code, $msg);
        let mut ef_out = vec![0u8; ef_plain.len() + 32];
        if let Ok(l) = $transport.write_message(&ef_plain, &mut ef_out) {
            ef_out.truncate(l);
            let _ = $write.send(Message::Binary(ef_out.into())).await;
        }
    }};
}

macro_rules! try_send_request_error {
    ($transport:expr, $write:expr, $message_id:expr, $code:expr, $msg:expr) => {{
        let ef_plain = super::encoded_error_frame($message_id, $code, $msg);
        let mut ef_out = vec![0u8; ef_plain.len() + 32];
        if let Ok(l) = $transport.write_message(&ef_plain, &mut ef_out) {
            ef_out.truncate(l);
            let _ = $write.send(Message::Binary(ef_out.into())).await;
        }
    }};
}

/// Encrypt a frame and send it over WebSocket. Returns `Err(())` on failure.
macro_rules! send_encrypted_frame {
    ($transport:expr, $write:expr, $frame:expr) => {{
        let plain = $frame.encode();
        let mut out = vec![0u8; plain.len() + 32];
        match $transport.write_message(&plain, &mut out) {
            Ok(l) => {
                out.truncate(l);
                if $write.send(Message::Binary(out.into())).await.is_err() {
                    Err(())
                } else {
                    Ok(())
                }
            }
            Err(_) => Err(()),
        }
    }};
}

/// Receive and decrypt a frame from WebSocket. Returns the plaintext `Frame`
/// or an error string on failure.
macro_rules! recv_encrypted_frame {
    ($transport:expr, $read:expr, $timeout:expr, $max_size:expr) => {{
        let result: Result<Frame, &'static str> =
            match tokio::time::timeout($timeout, $read.next()).await {
                Ok(Some(Ok(Message::Binary(ciphertext)))) => {
                    if ciphertext.len() > $max_size {
                        Err("message too large")
                    } else {
                        let mut plain = vec![0u8; ciphertext.len()];
                        match $transport.read_message(ciphertext.as_ref(), &mut plain) {
                            Ok(l) => {
                                plain.truncate(l);
                                Frame::decode(&plain)
                            }
                            Err(_) => Err("decrypt failed"),
                        }
                    }
                }
                Ok(Some(Ok(_))) => Err("unexpected message type"),
                Ok(Some(Err(_))) => Err("ws error"),
                Ok(None) => Err("connection closed"),
                Err(_) => Err("timeout"),
            };
        result
    }};
}
