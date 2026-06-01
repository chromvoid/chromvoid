use serde::{Deserialize, Serialize};

use crate::durable_tx::DurableTxPhase;
use crate::storage::StorageArtifact;

#[cfg(test)]
pub(in crate::rpc::router::master_rekey) const MASTER_REKEY_TRANSACTION_FILE: &str =
    "master.rekey.transaction.json";
pub(in crate::rpc::router::master_rekey) const MASTER_REKEY_TX_KIND: &str = "master_rekey";

pub(in crate::rpc::router::master_rekey) type MasterRekeyArtifactNames = Vec<String>;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(in crate::rpc::router::master_rekey) enum MasterRekeyArtifactKind {
    MasterVerify,
}

#[derive(Debug, Clone, Copy)]
pub(in crate::rpc::router::master_rekey) struct MasterRekeyArtifact {
    pub(in crate::rpc::router::master_rekey) name: &'static str,
    pub(in crate::rpc::router::master_rekey) file_name: &'static str,
    pub(in crate::rpc::router::master_rekey) target_artifact: StorageArtifact,
    pub(in crate::rpc::router::master_rekey) temp_artifact: StorageArtifact,
    pub(in crate::rpc::router::master_rekey) kind: MasterRekeyArtifactKind,
}

pub(in crate::rpc::router::master_rekey) const MASTER_REKEY_ARTIFACTS: &[MasterRekeyArtifact] =
    &[MasterRekeyArtifact {
        name: "master.verify",
        file_name: "master.verify",
        target_artifact: StorageArtifact::MasterVerify,
        temp_artifact: StorageArtifact::MasterVerifyRekeyTemp,
        kind: MasterRekeyArtifactKind::MasterVerify,
    }];

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub(in crate::rpc::router::master_rekey) struct MasterRekeyTransaction {
    pub(in crate::rpc::router::master_rekey) version: u8,
    pub(in crate::rpc::router::master_rekey) phase: DurableTxPhase,
    pub(in crate::rpc::router::master_rekey) artifacts: Vec<MasterRekeyTransactionArtifact>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub(in crate::rpc::router::master_rekey) struct MasterRekeyTransactionArtifact {
    pub(in crate::rpc::router::master_rekey) name: String,
    pub(in crate::rpc::router::master_rekey) target_name: String,
    pub(in crate::rpc::router::master_rekey) temp_name: String,
}

pub(in crate::rpc::router::master_rekey) fn master_rekey_temp_name(
    artifact: &MasterRekeyArtifact,
) -> String {
    format!(".{}.master-rekey.tmp", artifact.file_name)
}
