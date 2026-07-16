pub const BITCOIN_NETWORK: &str = "bitcoin";
pub const BITCOIN_AMOUNT_UNIT: &str = "satoshi";
pub const BITCOIN_ACCOUNT_MODEL: &str = "utxo";
pub const BITCOIN_DERIVATION_PROFILE: &str = "bitcoin_bip84_account";
pub const BITCOIN_DUST_THRESHOLD_SATS: u64 = 294;
pub const BITCOIN_ADDRESS_GAP: u32 = 20;
pub const BITCOIN_FINALITY_CONFIRMATIONS: u32 = 6;
pub const BITCOIN_RECONCILIATION_WINDOW_MS: u64 = 14 * 24 * 60 * 60 * 1000;

pub(super) const BITCOIN_PREPARED_PAYLOAD_KIND: &str = "bitcoin_prepared_payload_v1";
pub(super) const BITCOIN_PROVIDER_SNAPSHOT_KIND: &str = "bitcoin_provider_snapshot_v1";
pub(super) const BITCOIN_CURVE: &str = "secp256k1";
pub(super) const BITCOIN_WIF_ENCODING: &str = "wif";
