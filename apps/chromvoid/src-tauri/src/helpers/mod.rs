mod normalize;
mod redact;
mod rpc;
mod storage;

#[cfg(desktop)]
mod desktop;

#[cfg(test)]
mod tests;

pub(crate) use normalize::*;
pub(crate) use redact::*;
pub(crate) use rpc::*;
pub(crate) use storage::*;

#[cfg(desktop)]
pub(crate) use desktop::*;

pub(crate) fn boxed_error(msg: impl Into<String>) -> Box<dyn std::error::Error> {
    msg.into().into()
}
