use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;

pub(crate) struct HostResponderTaskRuntime {
    generation: AtomicU64,
    task: Mutex<Option<tauri::async_runtime::JoinHandle<()>>>,
}

impl HostResponderTaskRuntime {
    pub(crate) fn new() -> Self {
        Self {
            generation: AtomicU64::new(0),
            task: Mutex::new(None),
        }
    }

    pub(crate) fn begin(&self, poison_error: &'static str) -> Result<u64, String> {
        let mut task = self.lock_task(poison_error)?;
        let generation = self.generation.fetch_add(1, Ordering::AcqRel) + 1;
        if let Some(handle) = task.take() {
            handle.abort();
        }
        Ok(generation)
    }

    pub(crate) fn store(
        &self,
        generation: u64,
        handle: tauri::async_runtime::JoinHandle<()>,
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

    pub(crate) fn cancel(&self, poison_error: &'static str) -> Result<(), String> {
        let mut task = self.lock_task(poison_error)?;
        self.generation.fetch_add(1, Ordering::AcqRel);
        if let Some(handle) = task.take() {
            handle.abort();
        }
        Ok(())
    }

    pub(crate) fn is_generation_current(&self, generation: u64) -> bool {
        self.generation.load(Ordering::Acquire) == generation
    }

    pub(crate) fn clear_if_current(
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

    #[cfg(test)]
    pub(crate) fn has_task_for_test(&self, poison_error: &'static str) -> Result<bool, String> {
        self.lock_task(poison_error).map(|task| task.is_some())
    }

    #[cfg(test)]
    pub(crate) fn poison_for_test(&self) {
        let _guard = self.task.lock().expect("host responder task lock");
        panic!("poison host responder task runtime");
    }

    fn lock_task(
        &self,
        poison_error: &'static str,
    ) -> Result<std::sync::MutexGuard<'_, Option<tauri::async_runtime::JoinHandle<()>>>, String>
    {
        self.task.lock().map_err(|_| poison_error.to_string())
    }
}

impl Default for HostResponderTaskRuntime {
    fn default() -> Self {
        Self::new()
    }
}
