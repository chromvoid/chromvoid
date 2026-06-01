fn normalize_external_url(value: &str) -> Result<String, String> {
    let parsed = url::Url::parse(value.trim()).map_err(|e| format!("Invalid URL: {e}"))?;
    match parsed.scheme() {
        "http" | "https" => Ok(parsed.to_string()),
        scheme => Err(format!("Unsupported URL scheme: {scheme}")),
    }
}

#[tauri::command]
pub(crate) fn open_url_external(url: String) -> Result<(), String> {
    let url = normalize_external_url(&url)?;
    #[cfg(target_os = "android")]
    {
        return crate::mobile::open_url_with_system(&url);
    }

    #[cfg(desktop)]
    {
        return crate::helpers::open_url_with_system(&url);
    }

    #[cfg(not(any(target_os = "android", desktop)))]
    {
        let _ = url;
        Err("Opening URLs externally is not supported on this platform".to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::normalize_external_url;

    #[test]
    fn accepts_http_and_https_urls() {
        assert_eq!(
            normalize_external_url("https://www.google.com/maps/search/?api=1&query=55,37")
                .unwrap(),
            "https://www.google.com/maps/search/?api=1&query=55,37"
        );
        assert_eq!(
            normalize_external_url("http://example.com").unwrap(),
            "http://example.com/"
        );
    }

    #[test]
    fn rejects_non_web_schemes() {
        assert!(normalize_external_url("javascript:alert(1)").is_err());
        assert!(normalize_external_url("file:///tmp/a").is_err());
    }
}
