use std::ffi::c_void;
use std::os::raw::c_char;

pub type CFStringRef = *const c_void;
pub type CFDictionaryRef = *const c_void;
pub type CFNotificationCenterRef = *mut c_void;
pub type CFAllocatorRef = *const c_void;

pub const K_CF_STRING_ENCODING_UTF8: u32 = 0x08000100;
pub const K_CF_NOTIFICATION_DELIVER_IMMEDIATELY: isize = 4;

unsafe extern "C" {
    pub fn CFNotificationCenterGetDarwinNotifyCenter() -> CFNotificationCenterRef;

    pub fn CFNotificationCenterAddObserver(
        center: CFNotificationCenterRef,
        observer: *const c_void,
        callback: Option<
            unsafe extern "C" fn(
                center: CFNotificationCenterRef,
                observer: *mut c_void,
                name: CFStringRef,
                object: *const c_void,
                user_info: CFDictionaryRef,
            ),
        >,
        name: CFStringRef,
        object: *const c_void,
        suspension_behavior: isize,
    );

    pub fn CFNotificationCenterPostNotification(
        center: CFNotificationCenterRef,
        name: CFStringRef,
        object: *const c_void,
        user_info: CFDictionaryRef,
        deliver_immediately: u8,
    );

    pub fn CFStringCreateWithCString(
        alloc: CFAllocatorRef,
        c_str: *const c_char,
        encoding: u32,
    ) -> CFStringRef;

    pub fn CFRelease(cf: *const c_void);

    pub fn CFRunLoopRun();
}
