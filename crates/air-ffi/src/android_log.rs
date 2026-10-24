//! Rust's diagnostics in logcat on Android, beside the platform's own lines, under
//! `ChromVoid/Rust`. Only ChromVoid's crates speak at info; everything else only warns. The
//! events carry no secret: no password, PIN, key or vault content is ever an event's field.
use std::ffi::{CString, c_char, c_int};
use std::fmt::Write as _;

use tracing::field::{Field, Visit};
use tracing::{Event, Level, Metadata, Subscriber, span};

#[link(name = "log")]
unsafe extern "C" {
    fn __android_log_write(priority: c_int, tag: *const c_char, text: *const c_char) -> c_int;
}

const INFO: c_int = 4;
const WARN: c_int = 5;
const ERROR: c_int = 6;

struct Logcat;

struct Line(String);

impl Visit for Line {
    fn record_debug(&mut self, field: &Field, value: &dyn std::fmt::Debug) {
        if field.name() == "message" {
            let _ = write!(self.0, "{value:?} ");
        } else {
            let _ = write!(self.0, "{}={value:?} ", field.name());
        }
    }

    fn record_str(&mut self, field: &Field, value: &str) {
        if field.name() == "message" {
            let _ = write!(self.0, "{value} ");
        } else {
            let _ = write!(self.0, "{}={value} ", field.name());
        }
    }
}

impl Subscriber for Logcat {
    fn enabled(&self, metadata: &Metadata<'_>) -> bool {
        *metadata.level() <= Level::WARN
            || (*metadata.level() <= Level::INFO && metadata.target().starts_with("chromvoid"))
    }

    fn new_span(&self, _: &span::Attributes<'_>) -> span::Id {
        span::Id::from_u64(1)
    }

    fn record(&self, _: &span::Id, _: &span::Record<'_>) {}

    fn record_follows_from(&self, _: &span::Id, _: &span::Id) {}

    fn event(&self, event: &Event<'_>) {
        let metadata = event.metadata();
        let mut line = Line(format!("{} ", metadata.target()));
        event.record(&mut line);
        let priority = match *metadata.level() {
            Level::ERROR => ERROR,
            Level::WARN => WARN,
            _ => INFO,
        };
        let (Ok(tag), Ok(text)) = (
            CString::new("ChromVoid/Rust"),
            CString::new(line.0.replace('\0', " ")),
        ) else {
            return;
        };
        // SAFETY: both strings are NUL-terminated and live across the call.
        unsafe {
            __android_log_write(priority, tag.as_ptr(), text.as_ptr());
        }
    }

    fn enter(&self, _: &span::Id) {}

    fn exit(&self, _: &span::Id) {}
}

/// Installed once, when the application hands its context over; a second call changes nothing.
pub(crate) fn install() {
    let _ = tracing::subscriber::set_global_default(Logcat);
}
