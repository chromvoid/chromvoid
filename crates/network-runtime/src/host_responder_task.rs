use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;

/// Tracks the current host responder across replacement, cancellation and late completion.
/// The platform spawns the task and transfers its cancellation handle here. Callers store
/// once per generation and explicitly cancel when stopping the host; dropping this owner
/// does not abort a task.
pub struct HostResponderTaskRuntime {
    generation: AtomicU64,
    task: Mutex<Option<tokio::task::AbortHandle>>,
}

impl HostResponderTaskRuntime {
    pub fn new() -> Self {
        Self {
            generation: AtomicU64::new(0),
            task: Mutex::new(None),
        }
    }

    pub fn begin(&self, poison_error: &'static str) -> Result<u64, String> {
        let mut task = self.lock_task(poison_error)?;
        let generation = self.generation.fetch_add(1, Ordering::AcqRel) + 1;
        if let Some(handle) = task.take() {
            handle.abort();
        }
        Ok(generation)
    }

    pub fn store(
        &self,
        generation: u64,
        handle: tokio::task::AbortHandle,
        poison_error: &'static str,
    ) -> Result<(), String> {
        let mut task = match self.lock_task(poison_error) {
            Ok(task) => task,
            Err(error) => {
                handle.abort();
                return Err(error);
            }
        };

        if self.is_generation_current(generation) {
            *task = Some(handle);
        } else {
            handle.abort();
        }
        Ok(())
    }

    pub fn cancel(&self, poison_error: &'static str) -> Result<(), String> {
        let mut task = self.lock_task(poison_error)?;
        self.generation.fetch_add(1, Ordering::AcqRel);
        if let Some(handle) = task.take() {
            handle.abort();
        }
        Ok(())
    }

    pub fn is_generation_current(&self, generation: u64) -> bool {
        self.generation.load(Ordering::Acquire) == generation
    }

    pub fn clear_if_current(
        &self,
        generation: u64,
        poison_error: &'static str,
    ) -> Result<(), String> {
        let mut task = self.lock_task(poison_error)?;
        if self.is_generation_current(generation) {
            *task = None;
        }
        Ok(())
    }

    fn lock_task(
        &self,
        poison_error: &'static str,
    ) -> Result<std::sync::MutexGuard<'_, Option<tokio::task::AbortHandle>>, String> {
        self.task.lock().map_err(|_| poison_error.to_string())
    }
}

impl Default for HostResponderTaskRuntime {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests;
