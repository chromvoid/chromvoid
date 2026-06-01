//! Credential provider matching and entry collection logic (ADR-020).

mod candidates;
mod collection;
mod context;
mod diagnostics;
mod domain;
mod matching;

pub(in crate::rpc::router) use candidates::CredentialProviderCandidate;
