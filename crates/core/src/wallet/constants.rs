pub const WALLET_ROOT: &str = "/.wallet";
pub const WALLET_SCHEMA_VERSION: u32 = 2;
pub const WALLET_BALANCE_CACHE_SCHEMA_VERSION: u32 = 1;
pub const PREPARATION_TTL_MS: u64 = 5 * 60 * 1000;
pub const MNEMONIC_DRAFT_TTL_MS: u64 = 10 * 60 * 1000;
pub const BIP39_ENGLISH_WORDLIST: &str = "english";
pub const BIP39_MNEMONIC_STANDARD: &str = "bip39";
pub const TON_NATIVE_MNEMONIC_STANDARD: &str = "ton_native";
/// TEP-0003 §3.3 Rotation mnemonic: two independent 12-word BIP39 halves (anchor + signing).
pub const ROTATION_MNEMONIC_STANDARD: &str = "rotation";
pub const MULTICHAIN_WALLET_MODE: &str = "multichain";
pub const TON_ONLY_WALLET_MODE: &str = "ton_only";

pub(super) fn default_mnemonic_standard() -> String {
    BIP39_MNEMONIC_STANDARD.to_string()
}

pub(super) fn default_wallet_mode() -> String {
    MULTICHAIN_WALLET_MODE.to_string()
}
