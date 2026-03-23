use url::Url;

#[derive(Clone)]
pub(super) struct ParsedRelay {
    pub(super) scheme: String,
    pub(super) server_name: String,
    pub(super) port: u16,
}

impl ParsedRelay {
    pub(super) fn parse(relay_url: &str) -> Result<Self, String> {
        let parsed = Url::parse(relay_url).map_err(|e| format!("invalid relay url: {}", e))?;
        let server_name = parsed
            .host_str()
            .ok_or_else(|| "relay url must include host".to_string())?
            .to_string();

        let scheme = match parsed.scheme() {
            "wss" | "https" => "https",
            "ws" | "http" => "http",
            other => return Err(format!("unsupported relay url scheme: {}", other)),
        }
        .to_string();

        let port = parsed.port_or_known_default().unwrap_or(443);

        Ok(Self {
            scheme,
            server_name,
            port,
        })
    }
}

pub(super) fn build_extended_connect_headers(relay: &ParsedRelay, room_id: &str) -> String {
    let path = format!("/.well-known/masque/udp/{}/443/", room_id);
    format!(
        ":method CONNECT\n:protocol connect-udp\n:scheme {}\n:authority {}\n:path {}\ncapsule-protocol: ?1\n\n",
        relay.scheme, relay.server_name, path
    )
}
