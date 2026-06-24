mod adapter;
mod io_sender;
#[cfg(test)]
mod tests;

pub(crate) use adapter::parse_capability_features;
pub use adapter::RemoteCoreAdapter;
