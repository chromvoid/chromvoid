use std::collections::HashMap;
use std::sync::Mutex;

use crate::media_source::LocalMediaSourceManager;

const ANDROID_AUDIO_SESSION_REGISTRY_POISONED: &str =
    "Android audio session registry mutex poisoned";

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct AndroidAudioSessionTrack {
    pub(crate) track_id: u64,
    pub(crate) source_revision: u64,
    pub(crate) token: String,
    pub(crate) generation: u64,
}

#[derive(Debug, Default)]
pub(crate) struct AndroidAudioSessionRegistry {
    sessions: Mutex<HashMap<String, Vec<AndroidAudioSessionTrack>>>,
}

impl AndroidAudioSessionRegistry {
    pub(crate) fn new() -> Self {
        Self::default()
    }

    pub(crate) fn register_session(
        &self,
        native_session_id: String,
        tracks: Vec<AndroidAudioSessionTrack>,
        media_sources: &LocalMediaSourceManager,
    ) -> Result<(), String> {
        pin_tracks(&tracks, media_sources);
        let previous = match self.sessions.lock() {
            Ok(mut sessions) => sessions.insert(native_session_id, tracks),
            Err(_) => {
                release_tracks(Some(tracks), media_sources);
                return Err(ANDROID_AUDIO_SESSION_REGISTRY_POISONED.to_string());
            }
        };
        release_tracks(previous, media_sources);
        Ok(())
    }

    pub(crate) fn contains_session(&self, native_session_id: &str) -> Result<bool, String> {
        self.sessions
            .lock()
            .map(|sessions| sessions.contains_key(native_session_id))
            .map_err(|_| ANDROID_AUDIO_SESSION_REGISTRY_POISONED.to_string())
    }

    pub(crate) fn release_session(
        &self,
        native_session_id: &str,
        media_sources: &LocalMediaSourceManager,
    ) -> Result<bool, String> {
        let removed = self
            .sessions
            .lock()
            .map(|mut sessions| sessions.remove(native_session_id))
            .map_err(|_| ANDROID_AUDIO_SESSION_REGISTRY_POISONED.to_string())?;
        let had_session = removed.is_some();
        release_tracks(removed, media_sources);
        Ok(had_session)
    }

    pub(crate) fn stop_all(&self, media_sources: &LocalMediaSourceManager) -> Result<(), String> {
        let native_session_ids: Vec<String> = self
            .sessions
            .lock()
            .map(|sessions| sessions.keys().cloned().collect())
            .map_err(|_| ANDROID_AUDIO_SESSION_REGISTRY_POISONED.to_string())?;

        for native_session_id in native_session_ids {
            let command = serde_json::json!({
                "command": "stop",
                "nativeSessionId": native_session_id,
            })
            .to_string();
            let _ = crate::mobile::android::send_audio_playback_command(&command);
            self.release_session(&native_session_id, media_sources)?;
        }
        Ok(())
    }

    pub(crate) fn release_all(
        &self,
        media_sources: &LocalMediaSourceManager,
    ) -> Result<usize, String> {
        let sessions = self
            .sessions
            .lock()
            .map(|mut sessions| std::mem::take(&mut *sessions))
            .map_err(|_| ANDROID_AUDIO_SESSION_REGISTRY_POISONED.to_string())?;
        let count = sessions.len();
        for tracks in sessions.into_values() {
            release_tracks(Some(tracks), media_sources);
        }
        Ok(count)
    }

    #[cfg(test)]
    pub(crate) fn count(&self) -> usize {
        self.sessions
            .lock()
            .map(|sessions| sessions.len())
            .unwrap_or_default()
    }
}

fn release_tracks(
    tracks: Option<Vec<AndroidAudioSessionTrack>>,
    media_sources: &LocalMediaSourceManager,
) {
    if let Some(tracks) = tracks {
        for track in tracks {
            media_sources.release(&track.token);
        }
    }
}

fn pin_tracks(tracks: &[AndroidAudioSessionTrack], media_sources: &LocalMediaSourceManager) {
    for track in tracks {
        media_sources.pin(&track.token, track.generation);
    }
}

#[cfg(test)]
mod tests {
    use crate::media_source::{LocalMediaKind, LocalMediaSourceManager};

    use super::*;

    #[test]
    fn android_audio_registry_release_session_is_idempotent() {
        let registry = AndroidAudioSessionRegistry::new();
        let media_sources = LocalMediaSourceManager::new();
        let source = media_sources
            .register(41, LocalMediaKind::Audio, "audio/mpeg".to_string(), 100, 7)
            .expect("register media source");

        registry
            .register_session(
                "native-1".to_string(),
                vec![AndroidAudioSessionTrack {
                    track_id: 41,
                    source_revision: 7,
                    token: source.token.clone(),
                    generation: source.generation,
                }],
                &media_sources,
            )
            .expect("register session");

        assert!(registry
            .contains_session("native-1")
            .expect("contains session"));
        assert!(registry
            .release_session("native-1", &media_sources)
            .expect("release session"));
        assert!(!registry
            .release_session("native-1", &media_sources)
            .expect("release missing session"));
        assert!(!media_sources.is_current(&source.token, source.generation));
        assert_eq!(registry.count(), 0);
    }

    #[test]
    fn android_audio_registry_replacing_session_releases_old_tokens() {
        let registry = AndroidAudioSessionRegistry::new();
        let media_sources = LocalMediaSourceManager::new();
        let old_source = media_sources
            .register(41, LocalMediaKind::Audio, "audio/mpeg".to_string(), 100, 7)
            .expect("register old media source");
        let new_source = media_sources
            .register(42, LocalMediaKind::Audio, "audio/mpeg".to_string(), 200, 8)
            .expect("register new media source");

        registry
            .register_session(
                "native-1".to_string(),
                vec![AndroidAudioSessionTrack {
                    track_id: 41,
                    source_revision: 7,
                    token: old_source.token.clone(),
                    generation: old_source.generation,
                }],
                &media_sources,
            )
            .expect("register old session");
        registry
            .register_session(
                "native-1".to_string(),
                vec![AndroidAudioSessionTrack {
                    track_id: 42,
                    source_revision: 8,
                    token: new_source.token.clone(),
                    generation: new_source.generation,
                }],
                &media_sources,
            )
            .expect("register replacement session");

        assert!(!media_sources.is_current(&old_source.token, old_source.generation));
        assert!(media_sources.is_current(&new_source.token, new_source.generation));
        assert_eq!(registry.count(), 1);
    }

    #[test]
    fn android_audio_registry_stop_all_is_idempotent() {
        let registry = AndroidAudioSessionRegistry::new();
        let media_sources = LocalMediaSourceManager::new();
        let source = media_sources
            .register(41, LocalMediaKind::Audio, "audio/mpeg".to_string(), 100, 7)
            .expect("register media source");

        registry
            .register_session(
                "native-1".to_string(),
                vec![AndroidAudioSessionTrack {
                    track_id: 41,
                    source_revision: 7,
                    token: source.token.clone(),
                    generation: source.generation,
                }],
                &media_sources,
            )
            .expect("register session");

        registry
            .stop_all(&media_sources)
            .expect("stop all sessions");
        registry
            .stop_all(&media_sources)
            .expect("stop all sessions again");

        assert!(!media_sources.is_current(&source.token, source.generation));
        assert_eq!(registry.count(), 0);
    }

    #[test]
    fn android_audio_registry_release_all_releases_without_native_dispatch() {
        let registry = AndroidAudioSessionRegistry::new();
        let media_sources = LocalMediaSourceManager::new();
        let source = media_sources
            .register(41, LocalMediaKind::Audio, "audio/mpeg".to_string(), 100, 7)
            .expect("register media source");

        registry
            .register_session(
                "native-1".to_string(),
                vec![AndroidAudioSessionTrack {
                    track_id: 41,
                    source_revision: 7,
                    token: source.token.clone(),
                    generation: source.generation,
                }],
                &media_sources,
            )
            .expect("register session");

        assert_eq!(
            registry.release_all(&media_sources).expect("release all"),
            1
        );
        assert_eq!(registry.count(), 0);
        assert!(!media_sources.is_current(&source.token, source.generation));
        assert_eq!(
            registry
                .release_all(&media_sources)
                .expect("release all again"),
            0
        );
    }

    #[test]
    fn android_audio_registry_pins_session_tokens_until_release() {
        let registry = AndroidAudioSessionRegistry::new();
        let media_sources = LocalMediaSourceManager::new();
        let source = media_sources
            .register(41, LocalMediaKind::Audio, "audio/mpeg".to_string(), 100, 7)
            .expect("register media source");

        registry
            .register_session(
                "native-1".to_string(),
                vec![AndroidAudioSessionTrack {
                    track_id: 41,
                    source_revision: 7,
                    token: source.token.clone(),
                    generation: source.generation,
                }],
                &media_sources,
            )
            .expect("register session");
        media_sources.expire_for_tests(&source.token);

        assert!(media_sources.get(&source.token).is_some());
        assert!(registry
            .release_session("native-1", &media_sources)
            .expect("release session"));
        assert!(media_sources.get(&source.token).is_none());
    }

    #[test]
    fn android_audio_registry_poison_returns_controlled_errors() {
        let registry = AndroidAudioSessionRegistry::new();
        let media_sources = LocalMediaSourceManager::new();
        let source = media_sources
            .register(41, LocalMediaKind::Audio, "audio/mpeg".to_string(), 100, 7)
            .expect("register media source");

        let _ = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            let _guard = registry.sessions.lock().expect("session registry lock");
            panic!("poison android audio session registry");
        }));

        let error = registry
            .register_session(
                "native-1".to_string(),
                vec![AndroidAudioSessionTrack {
                    track_id: 41,
                    source_revision: 7,
                    token: source.token.clone(),
                    generation: source.generation,
                }],
                &media_sources,
            )
            .expect_err("poisoned register must fail");

        assert_eq!(error, ANDROID_AUDIO_SESSION_REGISTRY_POISONED);
        assert!(media_sources.get(&source.token).is_none());
        assert_eq!(
            registry
                .contains_session("native-1")
                .expect_err("poisoned contains must fail"),
            ANDROID_AUDIO_SESSION_REGISTRY_POISONED
        );
        assert_eq!(
            registry
                .release_session("native-1", &media_sources)
                .expect_err("poisoned release must fail"),
            ANDROID_AUDIO_SESSION_REGISTRY_POISONED
        );
        assert_eq!(
            registry
                .release_all(&media_sources)
                .expect_err("poisoned release all must fail"),
            ANDROID_AUDIO_SESSION_REGISTRY_POISONED
        );
        assert_eq!(
            registry
                .stop_all(&media_sources)
                .expect_err("poisoned stop all must fail"),
            ANDROID_AUDIO_SESSION_REGISTRY_POISONED
        );
    }
}
