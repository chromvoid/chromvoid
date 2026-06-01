use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum DurableTxPhase {
    Staging,
    #[serde(alias = "publishing")]
    Committing,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct DurableTxRecord<TPayload> {
    pub(crate) version: u8,
    pub(crate) kind: String,
    pub(crate) tx_id: String,
    pub(crate) phase: DurableTxPhase,
    pub(crate) payload: TPayload,
}
