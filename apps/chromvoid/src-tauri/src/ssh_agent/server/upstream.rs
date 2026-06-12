use std::path::PathBuf;

use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::UnixStream;
use tokio::time::{timeout, Duration};

use super::models::{MAX_MESSAGE_SIZE, UPSTREAM_IO_TIMEOUT_SECS};
use crate::ssh_agent::protocol::{
    build_message, parse_identities_answer, SSH_AGENTC_REQUEST_IDENTITIES, SSH_AGENTC_SIGN_REQUEST,
    SSH_AGENT_IDENTITIES_ANSWER,
};

pub(super) async fn proxy_sign_request(upstream_path: &PathBuf, payload: &[u8]) -> Option<Vec<u8>> {
    let request = build_message(SSH_AGENTC_SIGN_REQUEST, payload);
    let (_msg_type, _payload, raw) = send_upstream_message(upstream_path, &request).await?;
    Some(raw)
}

pub(super) async fn fetch_upstream_identities(
    upstream_path: &PathBuf,
) -> Option<Vec<(Vec<u8>, String)>> {
    let request = build_message(SSH_AGENTC_REQUEST_IDENTITIES, &[]);
    let (msg_type, payload, _raw) = send_upstream_message(upstream_path, &request).await?;
    if msg_type != SSH_AGENT_IDENTITIES_ANSWER {
        return None;
    }
    parse_identities_answer(&payload)
}

async fn send_upstream_message(
    upstream_path: &PathBuf,
    request: &[u8],
) -> Option<(u8, Vec<u8>, Vec<u8>)> {
    let mut upstream = timeout(
        Duration::from_secs(UPSTREAM_IO_TIMEOUT_SECS),
        UnixStream::connect(upstream_path),
    )
    .await
    .ok()?
    .ok()?;

    timeout(
        Duration::from_secs(UPSTREAM_IO_TIMEOUT_SECS),
        upstream.write_all(request),
    )
    .await
    .ok()?
    .ok()?;

    let mut len_buf = [0u8; 4];
    timeout(
        Duration::from_secs(UPSTREAM_IO_TIMEOUT_SECS),
        upstream.read_exact(&mut len_buf),
    )
    .await
    .ok()?
    .ok()?;

    let len = u32::from_be_bytes(len_buf) as usize;
    if len == 0 || len > MAX_MESSAGE_SIZE {
        return None;
    }

    let mut body = vec![0u8; len];
    timeout(
        Duration::from_secs(UPSTREAM_IO_TIMEOUT_SECS),
        upstream.read_exact(&mut body),
    )
    .await
    .ok()?
    .ok()?;

    if body.is_empty() {
        return None;
    }

    let msg_type = body[0];
    let payload = body[1..].to_vec();

    let mut raw = Vec::with_capacity(4 + body.len());
    raw.extend_from_slice(&len_buf);
    raw.extend_from_slice(&body);

    Some((msg_type, payload, raw))
}

pub(super) fn is_same_socket_endpoint(lhs: &PathBuf, rhs: &PathBuf) -> bool {
    if lhs == rhs {
        return true;
    }

    let lhs_canon = std::fs::canonicalize(lhs);
    let rhs_canon = std::fs::canonicalize(rhs);
    if let (Ok(a), Ok(b)) = (lhs_canon, rhs_canon) {
        if a == b {
            return true;
        }
    }

    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;

        if let (Ok(a), Ok(b)) = (std::fs::metadata(lhs), std::fs::metadata(rhs)) {
            return a.dev() == b.dev() && a.ino() == b.ino();
        }
    }

    false
}

#[cfg(test)]
mod tests {
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::Arc;

    use tokio::net::UnixListener;

    use super::*;

    #[tokio::test]
    async fn proxy_sign_request_sends_once_when_upstream_closes_without_frame() {
        let tempdir = tempfile::tempdir().expect("tempdir");
        let socket_path = tempdir.path().join("upstream.sock");
        let listener = UnixListener::bind(&socket_path).expect("bind upstream");
        let accepted = Arc::new(AtomicUsize::new(0));
        let server_accepted = accepted.clone();

        let server = tokio::spawn(async move {
            loop {
                let Ok(Ok((mut stream, _))) =
                    timeout(Duration::from_millis(200), listener.accept()).await
                else {
                    break;
                };
                server_accepted.fetch_add(1, Ordering::SeqCst);
                let mut header = [0u8; 4];
                if stream.read_exact(&mut header).await.is_err() {
                    continue;
                }
                let len = u32::from_be_bytes(header) as usize;
                let mut body = vec![0u8; len];
                let _ = stream.read_exact(&mut body).await;
            }
        });

        assert!(proxy_sign_request(&socket_path, b"payload").await.is_none());
        server.await.expect("server join");
        assert_eq!(accepted.load(Ordering::SeqCst), 1);
    }
}
