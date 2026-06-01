//! Durable unit-of-work boundary for domain-owned catalog files.

mod backups;
mod deltas;
mod errors;
mod participant;
mod paths;
mod recovery;
#[cfg(test)]
mod tests;
mod types;
mod work;

pub(in crate::rpc::router) use errors::{DomainUowError, DomainUowResult};
pub(super) use recovery::recover_domain_unit_of_work;
#[allow(unused_imports)]
pub(super) use types::DomainCommitOutcome;
pub(super) use work::DomainUnitOfWork;
