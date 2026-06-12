use std::sync::{Arc, Mutex};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum ModeTransitionOperation {
    ModeSwitch,
}

impl ModeTransitionOperation {
    fn label(self) -> &'static str {
        match self {
            Self::ModeSwitch => "mode switch",
        }
    }
}

#[derive(Default)]
pub(crate) struct ModeTransitionCoordinator {
    active: Mutex<Option<ModeTransitionOperation>>,
}

pub(crate) struct ModeTransitionLease {
    coordinator: Arc<ModeTransitionCoordinator>,
    operation: ModeTransitionOperation,
}

impl ModeTransitionCoordinator {
    pub(crate) fn new() -> Self {
        Self::default()
    }

    pub(crate) fn try_begin(
        self: &Arc<Self>,
        operation: ModeTransitionOperation,
    ) -> Result<ModeTransitionLease, String> {
        let mut active = self
            .active
            .lock()
            .map_err(|_| "Mode transition coordinator mutex poisoned".to_string())?;
        if let Some(existing) = *active {
            return Err(format!(
                "{} already in progress; cannot start {}",
                existing.label(),
                operation.label()
            ));
        }
        *active = Some(operation);
        Ok(ModeTransitionLease {
            coordinator: self.clone(),
            operation,
        })
    }
}

impl Drop for ModeTransitionLease {
    fn drop(&mut self) {
        match self.coordinator.active.lock() {
            Ok(mut active) if *active == Some(self.operation) => {
                *active = None;
            }
            Ok(_) => {}
            Err(_) => tracing::warn!("mode_transition: coordinator mutex poisoned on drop"),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_overlapping_mode_transitions() {
        let coordinator = Arc::new(ModeTransitionCoordinator::new());
        let _lease = coordinator
            .try_begin(ModeTransitionOperation::ModeSwitch)
            .expect("first lease");

        let error = match coordinator.try_begin(ModeTransitionOperation::ModeSwitch) {
            Ok(_) => panic!("second transition must be rejected"),
            Err(error) => error,
        };

        assert!(error.contains("mode switch already in progress"));
    }

    #[test]
    fn releases_transition_on_drop() {
        let coordinator = Arc::new(ModeTransitionCoordinator::new());
        {
            let _lease = coordinator
                .try_begin(ModeTransitionOperation::ModeSwitch)
                .expect("first lease");
        }

        coordinator
            .try_begin(ModeTransitionOperation::ModeSwitch)
            .expect("lease released");
    }
}
