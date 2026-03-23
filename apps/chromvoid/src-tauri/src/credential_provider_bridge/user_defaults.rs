use objc2::AnyThread;
use serde_json::Value;
use tracing::error;

pub const APP_GROUP_ID: &str = "group.com.chromvoid.app.shared";
pub const REQUEST_KEY: &str = "credential_provider.request";
pub const RESPONSE_KEY: &str = "credential_provider.response";

pub fn read_app_group_json(key: &str) -> Option<Value> {
    use objc2_foundation::{NSString, NSUserDefaults};

    unsafe {
        let suite = NSString::from_str(APP_GROUP_ID);
        let defaults = NSUserDefaults::alloc();
        let defaults = NSUserDefaults::initWithSuiteName(defaults, Some(&suite))?;
        defaults.synchronize();

        let ns_key = NSString::from_str(key);
        let value = defaults.stringForKey(&ns_key)?;
        serde_json::from_str(&value.to_string()).ok()
    }
}

pub fn write_app_group_json(key: &str, value: &Value) {
    use objc2_foundation::{NSString, NSUserDefaults};

    unsafe {
        let suite = NSString::from_str(APP_GROUP_ID);
        let defaults = NSUserDefaults::alloc();
        let Some(defaults) = NSUserDefaults::initWithSuiteName(defaults, Some(&suite)) else {
            error!("credential_provider_bridge: failed to open app group defaults");
            return;
        };

        let ns_key = NSString::from_str(key);

        if let Ok(json_str) = serde_json::to_string(value) {
            let ns_value = NSString::from_str(&json_str);
            defaults.setObject_forKey(Some(&ns_value), &ns_key);
            defaults.synchronize();
        }
    }
}

pub fn clear_app_group_key(key: &str) {
    use objc2_foundation::{NSString, NSUserDefaults};

    unsafe {
        let suite = NSString::from_str(APP_GROUP_ID);
        let defaults = NSUserDefaults::alloc();
        let Some(defaults) = NSUserDefaults::initWithSuiteName(defaults, Some(&suite)) else {
            return;
        };

        let ns_key = NSString::from_str(key);
        defaults.removeObjectForKey(&ns_key);
        defaults.synchronize();
    }
}
