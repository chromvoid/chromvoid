use std::ffi::CStr;

use super::ffi;

pub const REQUEST_NOTIFICATION: &CStr =
    unsafe { CStr::from_bytes_with_nul_unchecked(b"com.chromvoid.credential.request\0") };
pub const RESPONSE_NOTIFICATION: &CStr =
    unsafe { CStr::from_bytes_with_nul_unchecked(b"com.chromvoid.credential.response\0") };

pub fn create_cf_string(s: &CStr) -> ffi::CFStringRef {
    unsafe {
        ffi::CFStringCreateWithCString(std::ptr::null(), s.as_ptr(), ffi::K_CF_STRING_ENCODING_UTF8)
    }
}

pub fn post_darwin_notification(name: &CStr) {
    unsafe {
        let center = ffi::CFNotificationCenterGetDarwinNotifyCenter();
        let cf_name = create_cf_string(name);
        ffi::CFNotificationCenterPostNotification(
            center,
            cf_name,
            std::ptr::null(),
            std::ptr::null(),
            1, // deliverImmediately
        );
        ffi::CFRelease(cf_name);
    }
}
