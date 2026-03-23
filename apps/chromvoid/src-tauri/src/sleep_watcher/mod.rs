mod platform;

pub trait SleepWatcher: Send + Sync {
    fn on_sleep(&self);
    fn on_wake(&self);
}

pub use platform::PlatformSleepWatcher;
