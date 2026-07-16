use std::io;
use std::sync::atomic::{AtomicBool, Ordering};

use chromvoid_protocol::TransportType;
use tokio::io::{AsyncReadExt, AsyncWriteExt};

use super::super::configure_usb_accessory_host_starter_for_runtime;
use super::*;

#[path = "usb_accessory_runtime_tests/fd_retry.rs"]
mod fd_retry;
#[path = "usb_accessory_runtime_tests/fd_sessions.rs"]
mod fd_sessions;
#[path = "usb_accessory_runtime_tests/host_failure.rs"]
mod host_failure;
#[path = "usb_accessory_runtime_tests/runtime_lifecycle.rs"]
mod runtime_lifecycle;
#[path = "usb_accessory_runtime_tests/support.rs"]
mod support;
