use std::ffi::CStr;

use super::ffi;

pub const REQUEST_NOTIFICATION: &CStr =
    // SAFETY: literal byte string ends with an explicit \0 byte, satisfying CStr's null-terminator invariant.
    unsafe { CStr::from_bytes_with_nul_unchecked(b"com.chromvoid.credential.request\0") };
pub const RESPONSE_NOTIFICATION: &CStr =
    // SAFETY: literal byte string ends with an explicit \0 byte, satisfying CStr's null-terminator invariant.
    unsafe { CStr::from_bytes_with_nul_unchecked(b"com.chromvoid.credential.response\0") };

pub fn create_cf_string(s: &CStr) -> ffi::CFStringRef {
    // SAFETY: s is a valid &CStr; the returned CFStringRef is owned by the caller and released by the caller.
    unsafe {
        ffi::CFStringCreateWithCString(std::ptr::null(), s.as_ptr(), ffi::K_CF_STRING_ENCODING_UTF8)
    }
}

pub fn post_darwin_notification(name: &CStr) {
    // SAFETY: name outlives the call; cf_name is created and released within this block, balancing CF retain count.
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
