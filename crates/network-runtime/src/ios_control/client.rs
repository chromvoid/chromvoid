use super::*;

pub fn http_base_from_relay_url(relay_url: &str) -> Result<String, String> {
    let mut url = url::Url::parse(relay_url).map_err(|e| format!("invalid relay_url: {e}"))?;
    match url.scheme() {
        "wss" => url
            .set_scheme("https")
            .map_err(|_| "failed to convert relay scheme to https".to_string())?,
        "ws" => url
            .set_scheme("http")
            .map_err(|_| "failed to convert relay scheme to http".to_string())?,
        "http" | "https" => {}
        other => return Err(format!("unsupported relay scheme: {other}")),
    }
    url.set_path("");
    url.set_query(None);
    url.set_fragment(None);
    Ok(url.to_string().trim_end_matches('/').to_string())
}

pub async fn create_pairing_session(
    relay_url: &str,
    req: &CreatePairingSessionRequest,
) -> Result<CreatePairingSessionResponse, String> {
    let base = http_base_from_relay_url(relay_url)?;
    let client = reqwest::Client::new();
    client
        .post(format!("{base}/v1/ios/pairing-sessions"))
        .json(req)
        .send()
        .await
        .map_err(|e| format!("create pairing session request failed: {e}"))?
        .error_for_status()
        .map_err(|e| format!("create pairing session failed: {e}"))?
        .json::<CreatePairingSessionResponse>()
        .await
        .map_err(|e| format!("decode create pairing session failed: {e}"))
}

pub async fn fetch_pairing_session(
    relay_url: &str,
    session_id: &str,
) -> Result<PairingSessionSnapshot, String> {
    let base = http_base_from_relay_url(relay_url)?;
    let client = reqwest::Client::new();
    client
        .get(format!("{base}/v1/ios/pairing-sessions/{session_id}"))
        .send()
        .await
        .map_err(|e| format!("fetch pairing session request failed: {e}"))?
        .error_for_status()
        .map_err(|e| format!("fetch pairing session failed: {e}"))?
        .json::<PairingSessionSnapshot>()
        .await
        .map_err(|e| format!("decode pairing session failed: {e}"))
}

pub async fn publish_host_presence(
    relay_url: &str,
    peer_id: &str,
    req: &PublishHostPresenceRequest,
) -> Result<HostPresence, String> {
    let base = http_base_from_relay_url(relay_url)?;
    let client = reqwest::Client::new();
    client
        .post(format!("{base}/v1/ios/hosts/{peer_id}/presence"))
        .json(req)
        .send()
        .await
        .map_err(|e| format!("publish host presence request failed: {e}"))?
        .error_for_status()
        .map_err(|e| format!("publish host presence failed: {e}"))?
        .json::<HostPresence>()
        .await
        .map_err(|e| format!("decode host presence failed: {e}"))
}

pub async fn fetch_host_presence(relay_url: &str, peer_id: &str) -> Result<HostPresence, String> {
    let base = http_base_from_relay_url(relay_url)?;
    let client = reqwest::Client::new();
    client
        .get(format!("{base}/v1/ios/hosts/{peer_id}/presence"))
        .send()
        .await
        .map_err(|e| format!("fetch host presence request failed: {e}"))?
        .error_for_status()
        .map_err(|e| format!("fetch host presence failed: {e}"))?
        .json::<HostPresence>()
        .await
        .map_err(|e| format!("decode host presence failed: {e}"))
}

pub async fn send_wake(relay_url: &str, peer_id: &str) -> Result<WakeHostResponse, String> {
    let base = http_base_from_relay_url(relay_url)?;
    let client = reqwest::Client::new();
    client
        .post(format!("{base}/v1/ios/hosts/{peer_id}/wake"))
        .send()
        .await
        .map_err(|e| format!("wake host request failed: {e}"))?
        .error_for_status()
        .map_err(|e| format!("wake host failed: {e}"))?
        .json::<WakeHostResponse>()
        .await
        .map_err(|e| format!("decode wake host failed: {e}"))
}

pub async fn register_push_registration(
    relay_url: &str,
    peer_id: &str,
    req: &RegisterPushRegistrationRequest,
) -> Result<PushRegistration, String> {
    let base = http_base_from_relay_url(relay_url)?;
    let client = reqwest::Client::new();
    client
        .post(format!("{base}/v1/ios/hosts/{peer_id}/push-registration"))
        .json(req)
        .send()
        .await
        .map_err(|e| format!("register push registration failed: {e}"))?
        .error_for_status()
        .map_err(|e| format!("register push registration failed: {e}"))?
        .json::<PushRegistration>()
        .await
        .map_err(|e| format!("decode push registration failed: {e}"))
}

pub async fn fetch_wake_request(
    relay_url: &str,
    peer_id: &str,
) -> Result<Option<WakeRequest>, String> {
    let base = http_base_from_relay_url(relay_url)?;
    let client = reqwest::Client::new();
    let response = client
        .get(format!("{base}/v1/ios/hosts/{peer_id}/wake"))
        .send()
        .await
        .map_err(|e| format!("fetch wake request failed: {e}"))?;

    if response.status() == reqwest::StatusCode::NOT_FOUND {
        return Ok(None);
    }

    response
        .error_for_status()
        .map_err(|e| format!("fetch wake request failed: {e}"))?
        .json::<WakeRequest>()
        .await
        .map(Some)
        .map_err(|e| format!("decode wake request failed: {e}"))
}
