use super::super::SleepWatcher;

pub struct StubSleepWatcher;

impl StubSleepWatcher {
    pub fn new(_handler: Box<dyn SleepWatcher + 'static>) -> Result<Self, String> {
        Ok(StubSleepWatcher)
    }
}
