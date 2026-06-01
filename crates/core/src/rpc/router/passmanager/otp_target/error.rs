use std::fmt;

#[derive(Debug, Clone)]
pub(in crate::rpc::router) struct OtpTargetError {
    message: String,
}

impl OtpTargetError {
    pub(super) fn new(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
        }
    }
}

impl fmt::Display for OtpTargetError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.message)
    }
}
