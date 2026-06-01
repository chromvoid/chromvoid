use std::collections::HashMap;
use std::sync::mpsc;
use std::sync::{Mutex, MutexGuard};

use tokio::sync::oneshot;

#[derive(Debug, Clone)]
pub struct AndroidSafTree {
    pub uri: String,
    pub display_name: String,
}

type AndroidSafTreeResult = Result<AndroidSafTree, String>;

pub(crate) enum AndroidSafTreeSender {
    Blocking(mpsc::Sender<AndroidSafTreeResult>),
    Async(oneshot::Sender<AndroidSafTreeResult>),
}

impl AndroidSafTreeSender {
    fn send(self, result: AndroidSafTreeResult) {
        match self {
            Self::Blocking(sender) => {
                let _ = sender.send(result);
            }
            Self::Async(sender) => {
                let _ = sender.send(result);
            }
        }
    }
}

pub(crate) struct AndroidSafPickerRuntimeState {
    pending_tree_picks: Mutex<HashMap<String, AndroidSafTreeSender>>,
}

impl AndroidSafPickerRuntimeState {
    pub(crate) fn new() -> Self {
        Self {
            pending_tree_picks: Mutex::new(HashMap::new()),
        }
    }

    fn pending(&self) -> Result<MutexGuard<'_, HashMap<String, AndroidSafTreeSender>>, String> {
        self.pending_tree_picks
            .lock()
            .map_err(|_| "SAF picker state is unavailable".to_string())
    }

    pub(crate) fn insert(
        &self,
        operation_id: &str,
        sender: mpsc::Sender<AndroidSafTreeResult>,
    ) -> Result<(), String> {
        self.insert_sender(operation_id, AndroidSafTreeSender::Blocking(sender))
    }

    pub(crate) fn insert_async(
        &self,
        operation_id: &str,
        sender: oneshot::Sender<AndroidSafTreeResult>,
    ) -> Result<(), String> {
        self.insert_sender(operation_id, AndroidSafTreeSender::Async(sender))
    }

    fn insert_sender(
        &self,
        operation_id: &str,
        sender: AndroidSafTreeSender,
    ) -> Result<(), String> {
        let mut pending = self.pending()?;
        if pending.contains_key(operation_id) {
            return Err("SAF folder picker is already running".to_string());
        }
        pending.insert(operation_id.to_string(), sender);
        Ok(())
    }

    pub(crate) fn remove(&self, operation_id: &str) -> Option<AndroidSafTreeSender> {
        self.pending_tree_picks
            .lock()
            .ok()
            .and_then(|mut pending| pending.remove(operation_id))
    }

    pub(crate) fn complete(&self, operation_id: &str, result: AndroidSafTreeResult) {
        if let Some(sender) = self.remove(operation_id) {
            sender.send(result);
        }
    }
}

impl Default for AndroidSafPickerRuntimeState {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn runtime_instances_do_not_share_pending_tree_picks() {
        let first = AndroidSafPickerRuntimeState::new();
        let second = AndroidSafPickerRuntimeState::new();
        let (tx, _rx) = mpsc::channel();

        first.insert("pick-1", tx).expect("insert");

        assert!(second.remove("pick-1").is_none());
        assert!(first.remove("pick-1").is_some());
    }

    #[test]
    fn duplicate_tree_pick_ids_are_rejected() {
        let runtime = AndroidSafPickerRuntimeState::new();
        let (first_tx, _first_rx) = mpsc::channel();
        let (second_tx, _second_rx) = mpsc::channel();

        runtime.insert("pick-1", first_tx).expect("first insert");
        let error = runtime
            .insert("pick-1", second_tx)
            .expect_err("duplicate should fail");

        assert_eq!(error, "SAF folder picker is already running");
    }

    #[tokio::test]
    async fn async_tree_pick_completion_sends_result() {
        let runtime = AndroidSafPickerRuntimeState::new();
        let (tx, rx) = oneshot::channel();

        runtime.insert_async("pick-1", tx).expect("insert");
        runtime.complete(
            "pick-1",
            Ok(AndroidSafTree {
                uri: "content://backup".to_string(),
                display_name: "Backup".to_string(),
            }),
        );

        let tree = rx.await.expect("async pick result").expect("tree");
        assert_eq!(tree.uri, "content://backup");
        assert_eq!(tree.display_name, "Backup");
        assert!(runtime.remove("pick-1").is_none());
    }
}
