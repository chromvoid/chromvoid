//! Telegram Wallet (`WalletTg`) contract bindings.
//!
//! Every account deploys the immutable trampoline code cell. The trampoline jumps into the
//! shared `WalletTg` bytecode stored in blockchain config parameter `-123`; validators upgrade
//! that bytecode by voting, so the account address and code hash never change.
//! Reference: <https://github.com/ton-blockchain/tg-wallet-contract> (rev00).

use std::sync::OnceLock;

use ::ton::block_tlb::{CommonMsgInfo, CommonMsgInfoExtIn, Msg, StateInit};
use ::ton::ton_core::cell::TonCell;
use ::ton::ton_core::traits::tlb::TLB;
use ::ton::ton_core::types::tlb_core::{MsgAddressExt, TLBCoins, TLBEitherRef};
use ::ton::ton_core::types::TonAddress;
use ::ton::ton_wallet::KeyPair;
use ed25519_dalek::{Signer, SigningKey};

use crate::wallet::WalletChainError;

use super::constants::{TON_WORKCHAIN, WALLET_TG_SUBWALLET_ID};
use super::error::ton_core_error;

/// `contracts/WalletTrampoline.boc` from tg-wallet-contract rev00.
pub(super) const WALLET_TG_TRAMPOLINE_CODE_BOC_BASE64: &str =
    "te6ccgEBAQEAGgAAMP8AIJgh10mDCLnyQN+Ahfgz0O0eIO1T2Q==";
/// Code-cell hash of the trampoline; identical for every account and every WalletTg revision.
pub(super) const WALLET_TG_TRAMPOLINE_CODE_HASH_HEX: &str =
    "9149ae51c1e4689710cebf7830297b16acfbadb363a920a537893e7ffeeca768";
/// `struct (0x00) Storage` prefix of the initial (rev00) storage layout.
pub(super) const WALLET_TG_STORAGE_REVISION: u8 = 0;
/// `SendOneMessageRequestE` opcode (external channel). Internal requests use `0x63896E74`.
const SEND_ONE_MESSAGE_EXTERNAL_OPCODE: u32 = 0x6389_6E75;
/// External requests must carry `SEND_MODE_IGNORE_ERRORS`, otherwise the contract throws 137.
pub(super) const SEND_MODE_IGNORE_ERRORS: u8 = 2;
const SIGNATURE_BITS: usize = 512;

static TRAMPOLINE_CODE: OnceLock<Result<TonCell, String>> = OnceLock::new();

/// `ChangePublicKeyRequestE` opcode (external channel). Internal requests use `0xFBBA99C7`.
const CHANGE_PUBLIC_KEY_EXTERNAL_OPCODE: u32 = 0xFBBA_99C8;
/// `KeyRotationProofPayload.tag`: the ASCII bytes of `KEY_ROTATION` as a 96-bit prefix.
const KEY_ROTATION_PROOF_TAG: &[u8; 12] = b"KEY_ROTATION";

/// Signing material and derived identity of one WalletTg account.
///
/// The address is fixed by the *anchor* public key written into the initial storage. Requests
/// are signed by the *signing* key, which equals the anchor key until the first on-chain
/// `ChangePublicKey` and is replaced by every rotation without changing the address.
pub(super) struct WalletTg {
    anchor_public_key: [u8; 32],
    signing_key_pair: KeyPair,
    address: TonAddress,
    subwallet_id: u32,
}

impl std::fmt::Debug for WalletTg {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("WalletTg")
            .field("address", &self.address.to_hex())
            .field("subwallet_id", &self.subwallet_id)
            .finish_non_exhaustive()
    }
}

impl WalletTg {
    /// A wallet whose signing key is still the anchor key (never rotated).
    pub(super) fn new(key_pair: KeyPair) -> Result<Self, WalletChainError> {
        let anchor_public_key = key_pair.public_key;
        Self::with_signing_key(anchor_public_key, key_pair)
    }

    /// A wallet addressed by `anchor_public_key` whose current on-chain signing key is
    /// `signing_key_pair` (after one or more rotations).
    pub(super) fn with_signing_key(
        anchor_public_key: [u8; 32],
        signing_key_pair: KeyPair,
    ) -> Result<Self, WalletChainError> {
        let subwallet_id = WALLET_TG_SUBWALLET_ID;
        let data = Self::initial_data_for(&anchor_public_key, subwallet_id)?;
        let address = StateInit::new(Self::code()?.clone(), data)
            .derive_address(TON_WORKCHAIN)
            .map_err(ton_core_error)?;
        Ok(Self {
            anchor_public_key,
            signing_key_pair,
            address,
            subwallet_id,
        })
    }

    pub(super) fn address(&self) -> &TonAddress {
        &self.address
    }

    /// The anchor public key: fixes the address and the initial storage.
    pub(super) fn public_key(&self) -> &[u8; 32] {
        &self.anchor_public_key
    }

    /// The key that signs requests; equals [`Self::public_key`] until the first rotation.
    pub(super) fn signing_public_key(&self) -> &[u8; 32] {
        &self.signing_key_pair.public_key
    }

    /// The immutable per-account trampoline code cell.
    pub(super) fn code() -> Result<&'static TonCell, WalletChainError> {
        TRAMPOLINE_CODE
            .get_or_init(|| {
                let code = TonCell::from_boc_base64(WALLET_TG_TRAMPOLINE_CODE_BOC_BASE64)
                    .map_err(|error| error.to_string())?;
                let hash = code.hash().map_err(|error| error.to_string())?.to_hex();
                if hash != WALLET_TG_TRAMPOLINE_CODE_HASH_HEX {
                    return Err(format!("code hash {hash} does not match the pinned hash"));
                }
                Ok(code)
            })
            .as_ref()
            .map_err(|error| {
                WalletChainError::internal(format!("WalletTg trampoline code is invalid: {error}"))
            })
    }

    /// `Storage { seqno: 0, subwalletId, publicKey }` with the rev00 prefix.
    pub(super) fn initial_data(&self) -> Result<TonCell, WalletChainError> {
        Self::initial_data_for(&self.anchor_public_key, self.subwallet_id)
    }

    fn initial_data_for(
        public_key: &[u8; 32],
        subwallet_id: u32,
    ) -> Result<TonCell, WalletChainError> {
        let mut builder = TonCell::builder();
        builder
            .write_num(&WALLET_TG_STORAGE_REVISION, 8)
            .map_err(ton_core_error)?;
        builder.write_num(&0u32, 32).map_err(ton_core_error)?;
        builder
            .write_num(&subwallet_id, 32)
            .map_err(ton_core_error)?;
        builder
            .write_bits(public_key, 256)
            .map_err(ton_core_error)?;
        builder.build().map_err(ton_core_error)
    }

    fn state_init(&self) -> Result<StateInit, WalletChainError> {
        Ok(StateInit::new(Self::code()?.clone(), self.initial_data()?))
    }

    /// Unsigned `SendOneMessageRequestE` body: header + one `MessageToSend`.
    pub(super) fn build_send_one_external_body(
        &self,
        seqno: u32,
        valid_until: u32,
        send_mode: u8,
        message: &TonCell,
    ) -> Result<TonCell, WalletChainError> {
        if send_mode & SEND_MODE_IGNORE_ERRORS == 0 {
            return Err(WalletChainError::invalid_input(
                "WalletTg external send requires the ignore-errors send mode",
            ));
        }
        let mut builder = TonCell::builder();
        builder
            .write_num(&SEND_ONE_MESSAGE_EXTERNAL_OPCODE, 32)
            .map_err(ton_core_error)?;
        builder
            .write_num(&self.subwallet_id, 32)
            .map_err(ton_core_error)?;
        builder
            .write_num(&valid_until, 32)
            .map_err(ton_core_error)?;
        builder.write_num(&seqno, 32).map_err(ton_core_error)?;
        builder.write_num(&send_mode, 8).map_err(ton_core_error)?;
        builder.write_ref(message.clone()).map_err(ton_core_error)?;
        builder.build().map_err(ton_core_error)
    }

    /// `SignedRequest` envelope with an all-zero signature, for `ignore_chksig` fee emulation.
    pub(super) fn unsigned_request(body: &TonCell) -> Result<TonCell, WalletChainError> {
        Self::envelope(&[0u8; 64], body)
    }

    /// `SignedRequest` envelope: the Ed25519 signature of the body hash is prepended to the body.
    pub(super) fn sign_request(&self, body: &TonCell) -> Result<TonCell, WalletChainError> {
        let signing_key = signing_key_from_pair(&self.signing_key_pair)?;
        let body_hash = body.hash().map_err(ton_core_error)?;
        let signature = signing_key.sign(body_hash.as_slice()).to_bytes();
        Self::envelope(&signature, body)
    }

    /// `KeyRotationProofPayload { tag, walletWorkchain, walletAddrHash }` signed by the *new*
    /// key: proves the rotation target controls the key it is being rotated to.
    pub(super) fn key_rotation_proof(
        &self,
        new_key_pair: &KeyPair,
    ) -> Result<[u8; 64], WalletChainError> {
        let mut builder = TonCell::builder();
        builder
            .write_bits(KEY_ROTATION_PROOF_TAG, 96)
            .map_err(ton_core_error)?;
        builder
            .write_bits([self.address.workchain as i8 as u8], 8)
            .map_err(ton_core_error)?;
        builder
            .write_bits(self.address.hash.as_slice(), 256)
            .map_err(ton_core_error)?;
        let payload = builder.build().map_err(ton_core_error)?;
        let new_key = signing_key_from_pair(new_key_pair)?;
        let payload_hash = payload.hash().map_err(ton_core_error)?;
        Ok(new_key.sign(payload_hash.as_slice()).to_bytes())
    }

    /// Unsigned `ChangePublicKeyRequestE` body: header + new key + rotation proof (as a ref).
    pub(super) fn build_change_public_key_external_body(
        &self,
        seqno: u32,
        valid_until: u32,
        new_public_key: &[u8; 32],
        rotation_signature: &[u8; 64],
    ) -> Result<TonCell, WalletChainError> {
        if new_public_key == self.signing_public_key() {
            return Err(WalletChainError::invalid_input(
                "WalletTg key rotation requires a different public key",
            ));
        }
        let mut proof = TonCell::builder();
        proof
            .write_bits(rotation_signature, SIGNATURE_BITS)
            .map_err(ton_core_error)?;
        let proof = proof.build().map_err(ton_core_error)?;
        let mut builder = TonCell::builder();
        builder
            .write_num(&CHANGE_PUBLIC_KEY_EXTERNAL_OPCODE, 32)
            .map_err(ton_core_error)?;
        builder
            .write_num(&self.subwallet_id, 32)
            .map_err(ton_core_error)?;
        builder
            .write_num(&valid_until, 32)
            .map_err(ton_core_error)?;
        builder.write_num(&seqno, 32).map_err(ton_core_error)?;
        builder
            .write_bits(new_public_key, 256)
            .map_err(ton_core_error)?;
        builder.write_ref(proof).map_err(ton_core_error)?;
        builder.build().map_err(ton_core_error)
    }

    /// Signed external-in message rotating the on-chain signing key to `new_key_pair`.
    /// The request is signed by the current signing key; the proof by the new key.
    pub(super) fn create_change_public_key_ext_in_msg(
        &self,
        new_key_pair: &KeyPair,
        seqno: u32,
        valid_until: u32,
        add_state_init: bool,
    ) -> Result<TonCell, WalletChainError> {
        let proof = self.key_rotation_proof(new_key_pair)?;
        let body = self.build_change_public_key_external_body(
            seqno,
            valid_until,
            &new_key_pair.public_key,
            &proof,
        )?;
        let signed_body = self.sign_request(&body)?;
        self.wrap_external(signed_body, add_state_init)
    }

    fn envelope(signature: &[u8; 64], body: &TonCell) -> Result<TonCell, WalletChainError> {
        let mut builder = TonCell::builder();
        builder
            .write_bits(signature, SIGNATURE_BITS)
            .map_err(ton_core_error)?;
        builder.write_cell(body).map_err(ton_core_error)?;
        builder.build().map_err(ton_core_error)
    }

    /// Signed external-in message carrying one outgoing message, optionally with the
    /// deploying `StateInit` when the account is still uninitialized.
    pub(super) fn create_ext_in_msg(
        &self,
        message: &TonCell,
        seqno: u32,
        valid_until: u32,
        send_mode: u8,
        add_state_init: bool,
    ) -> Result<TonCell, WalletChainError> {
        let body = self.build_send_one_external_body(seqno, valid_until, send_mode, message)?;
        let signed_body = self.sign_request(&body)?;
        self.wrap_external(signed_body, add_state_init)
    }

    fn wrap_external(
        &self,
        signed_body: TonCell,
        add_state_init: bool,
    ) -> Result<TonCell, WalletChainError> {
        let info = CommonMsgInfo::ExtIn(CommonMsgInfoExtIn {
            src: MsgAddressExt::NONE,
            dst: self.address.to_msg_address_int(),
            import_fee: TLBCoins::ZERO,
        });
        let mut message = Msg::new(info, signed_body);
        if add_state_init {
            message.init = Some(TLBEitherRef::new(self.state_init()?));
        }
        message.to_cell().map_err(ton_core_error)
    }
}

fn signing_key_from_pair(key_pair: &KeyPair) -> Result<SigningKey, WalletChainError> {
    let signing_key = SigningKey::from_keypair_bytes(&key_pair.secret_key)
        .map_err(|error| WalletChainError::internal(format!("invalid TON keypair: {error}")))?;
    if signing_key.verifying_key().to_bytes() != key_pair.public_key {
        return Err(WalletChainError::internal(
            "TON keypair public key mismatch",
        ));
    }
    Ok(signing_key)
}

#[cfg(test)]
mod tests {
    use std::str::FromStr;

    use ed25519_dalek::{Signature, Verifier, VerifyingKey};

    use super::*;
    use crate::wallet::hex_string;

    fn fixture_key_pair() -> KeyPair {
        let signing_key = SigningKey::from_bytes(&[7u8; 32]);
        KeyPair {
            public_key: signing_key.verifying_key().to_bytes(),
            secret_key: signing_key.to_keypair_bytes(),
        }
    }

    /// Prints BOCs for a manual TON Center `estimateFee` emulation against mainnet config[-123].
    /// Run with `cargo test -p chromvoid-core dump_emulation_bocs -- --ignored --nocapture`.
    #[test]
    #[ignore]
    fn dump_emulation_bocs() {
        let wallet = WalletTg::new(fixture_key_pair()).expect("wallet");
        let destination = TonAddress::from_str(
            "0:1111111111111111111111111111111111111111111111111111111111111111",
        )
        .expect("destination");
        let inner = super::super::transfer::build_internal_message(
            destination,
            1_000_000,
            TonCell::builder().build().expect("empty body"),
            false,
        )
        .expect("internal message");
        let body = wallet
            .build_send_one_external_body(0, u32::MAX, 3, &inner)
            .expect("body");
        println!("ADDRESS {}", wallet.address());
        println!(
            "BODY {}",
            WalletTg::unsigned_request(&body)
                .expect("unsigned")
                .to_boc_base64()
                .expect("boc")
        );
        println!(
            "CODE {}",
            WalletTg::code()
                .expect("code")
                .to_boc_base64()
                .expect("boc")
        );
        println!(
            "DATA {}",
            wallet
                .initial_data()
                .expect("data")
                .to_boc_base64()
                .expect("boc")
        );
        println!(
            "SIGNED {}",
            wallet
                .create_ext_in_msg(&inner, 0, u32::MAX, 3, true)
                .expect("signed message")
                .to_boc_base64()
                .expect("boc")
        );
        // Rotation to a fresh key at seqno 1, then a transfer signed by the new key at seqno 2.
        let new_key = rotated_key_pair();
        println!(
            "ROTATE {}",
            wallet
                .create_change_public_key_ext_in_msg(&new_key, 1, u32::MAX, false)
                .expect("rotation message")
                .to_boc_base64()
                .expect("boc")
        );
        println!("NEWKEY {}", hex_string(&new_key.public_key));
        let rotated = WalletTg::with_signing_key(*wallet.public_key(), new_key).expect("rotated");
        assert_eq!(rotated.address(), wallet.address());
        println!(
            "SIGNED_AFTER_ROTATION {}",
            rotated
                .create_ext_in_msg(&inner, 2, u32::MAX, 3, false)
                .expect("post-rotation message")
                .to_boc_base64()
                .expect("boc")
        );
        println!(
            "SIGNED_OLD_KEY_AFTER_ROTATION {}",
            wallet
                .create_ext_in_msg(&inner, 2, u32::MAX, 3, false)
                .expect("stale-key message")
                .to_boc_base64()
                .expect("boc")
        );
    }

    fn rotated_key_pair() -> KeyPair {
        let signing_key = SigningKey::from_bytes(&[9u8; 32]);
        KeyPair {
            public_key: signing_key.verifying_key().to_bytes(),
            secret_key: signing_key.to_keypair_bytes(),
        }
    }

    #[test]
    fn change_public_key_body_matches_contract_layout_and_proof_verifies() {
        let wallet = WalletTg::new(fixture_key_pair()).expect("wallet");
        let new_key = rotated_key_pair();
        let proof = wallet.key_rotation_proof(&new_key).expect("proof");
        let body = wallet
            .build_change_public_key_external_body(1, 1_700_000_000, &new_key.public_key, &proof)
            .expect("body");
        let mut parser = body.parser();
        assert_eq!(
            parser.read_num::<u32>(32).expect("opcode"),
            CHANGE_PUBLIC_KEY_EXTERNAL_OPCODE
        );
        assert_eq!(parser.read_num::<u32>(32).expect("subwallet"), 0x7FFF_7F11);
        assert_eq!(
            parser.read_num::<u32>(32).expect("valid_until"),
            1_700_000_000
        );
        assert_eq!(parser.read_num::<u32>(32).expect("seqno"), 1);
        assert_eq!(
            parser.read_bits(256).expect("new key"),
            new_key.public_key.to_vec()
        );
        assert_eq!(parser.data_bits_left().expect("end"), 0);
        assert_eq!(body.refs().len(), 1);
        let mut proof_parser = body.refs()[0].parser();
        assert_eq!(proof_parser.read_bits(512).expect("proof"), proof.to_vec());
        assert_eq!(proof_parser.data_bits_left().expect("end"), 0);

        // The proof is the new key's signature over `KEY_ROTATION | workchain | address hash`.
        let mut payload = TonCell::builder();
        payload.write_bits(b"KEY_ROTATION", 96).expect("tag");
        payload.write_bits([0u8], 8).expect("workchain");
        payload
            .write_bits(wallet.address().hash.as_slice(), 256)
            .expect("hash");
        let payload = payload.build().expect("payload");
        VerifyingKey::from_bytes(&new_key.public_key)
            .expect("key")
            .verify(
                payload.hash().expect("hash").as_slice(),
                &Signature::from_slice(&proof).expect("signature"),
            )
            .expect("proof signed by the new key");
    }

    #[test]
    fn change_public_key_rejects_same_key_and_message_is_signed_by_current_key() {
        let wallet = WalletTg::new(fixture_key_pair()).expect("wallet");
        let same = fixture_key_pair();
        let proof = wallet.key_rotation_proof(&same).expect("proof");
        let error = wallet
            .build_change_public_key_external_body(1, 1, &same.public_key, &proof)
            .expect_err("same key");
        assert!(error.message.contains("different public key"));

        let new_key = rotated_key_pair();
        let message = wallet
            .create_change_public_key_ext_in_msg(&new_key, 1, 2, false)
            .expect("message");
        let parsed = Msg::<TonCell>::from_cell(&message).expect("parse");
        assert!(parsed.init.is_none());
        let mut body = parsed.body.parser();
        let signature = body.read_bits(512).expect("signature");
        let rest_bits = body.data_bits_left().expect("rest");
        let mut rest = TonCell::builder();
        rest.write_bits(body.read_bits(rest_bits).expect("rest"), rest_bits)
            .expect("rest bits");
        for cell_ref in parsed.body.refs() {
            rest.write_ref(cell_ref.clone()).expect("ref");
        }
        let rest = rest.build().expect("request cell");
        VerifyingKey::from_bytes(wallet.signing_public_key())
            .expect("key")
            .verify(
                rest.hash().expect("hash").as_slice(),
                &Signature::from_slice(&signature).expect("signature"),
            )
            .expect("request signed by the current signing key");
    }

    #[test]
    fn rotated_wallet_keeps_anchor_address_and_signs_with_new_key() {
        let anchor = WalletTg::new(fixture_key_pair()).expect("wallet");
        let rotated =
            WalletTg::with_signing_key(*anchor.public_key(), rotated_key_pair()).expect("rotated");
        assert_eq!(rotated.address(), anchor.address());
        assert_eq!(rotated.public_key(), anchor.public_key());
        assert_ne!(rotated.signing_public_key(), anchor.signing_public_key());
        assert_eq!(
            rotated.initial_data().expect("data"),
            anchor.initial_data().expect("data")
        );
    }

    #[test]
    fn trampoline_code_hash_matches_upstream() {
        let code = WalletTg::code().expect("code");
        assert_eq!(
            code.hash().expect("hash").to_hex(),
            WALLET_TG_TRAMPOLINE_CODE_HASH_HEX
        );
    }

    #[test]
    fn initial_data_uses_rev00_layout_and_mainnet_subwallet() {
        let wallet = WalletTg::new(fixture_key_pair()).expect("wallet");
        let data = wallet.initial_data().expect("data");
        let mut parser = data.parser();
        assert_eq!(parser.read_num::<u8>(8).expect("revision"), 0);
        assert_eq!(parser.read_num::<u32>(32).expect("seqno"), 0);
        assert_eq!(parser.read_num::<u32>(32).expect("subwallet"), 0x7FFF_7F11);
        assert_eq!(
            parser.read_bits(256).expect("public key"),
            wallet.public_key().to_vec()
        );
        assert_eq!(parser.data_bits_left().expect("end"), 0);
        assert_eq!(data.refs().len(), 0);
    }

    #[test]
    fn address_is_state_init_hash_of_trampoline_and_initial_data() {
        let wallet = WalletTg::new(fixture_key_pair()).expect("wallet");
        let expected = StateInit::new(
            WalletTg::code().expect("code").clone(),
            wallet.initial_data().expect("data"),
        )
        .derive_address(0)
        .expect("address");
        assert_eq!(wallet.address(), &expected);
        assert_eq!(wallet.address().workchain, 0);
    }

    #[test]
    fn send_one_external_body_matches_contract_layout() {
        let wallet = WalletTg::new(fixture_key_pair()).expect("wallet");
        let message = TonCell::builder().build().expect("empty message");
        let body = wallet
            .build_send_one_external_body(5, 1_700_000_000, 3, &message)
            .expect("body");
        let mut parser = body.parser();
        assert_eq!(
            parser.read_num::<u32>(32).expect("opcode"),
            SEND_ONE_MESSAGE_EXTERNAL_OPCODE
        );
        assert_eq!(parser.read_num::<u32>(32).expect("subwallet"), 0x7FFF_7F11);
        assert_eq!(
            parser.read_num::<u32>(32).expect("valid_until"),
            1_700_000_000
        );
        assert_eq!(parser.read_num::<u32>(32).expect("seqno"), 5);
        assert_eq!(parser.read_num::<u8>(8).expect("send mode"), 3);
        assert_eq!(parser.data_bits_left().expect("end"), 0);
        assert_eq!(body.refs().len(), 1);
        assert_eq!(&body.refs()[0], &message);
    }

    #[test]
    fn send_one_external_body_rejects_send_mode_without_ignore_errors() {
        let wallet = WalletTg::new(fixture_key_pair()).expect("wallet");
        let message = TonCell::builder().build().expect("empty message");
        let error = wallet
            .build_send_one_external_body(0, 1, 1, &message)
            .expect_err("mode 1 lacks +2");
        assert!(error.message.contains("ignore-errors"));
    }

    #[test]
    fn signed_request_prepends_valid_signature_of_body_hash() {
        let wallet = WalletTg::new(fixture_key_pair()).expect("wallet");
        let message = TonCell::builder().build().expect("empty message");
        let body = wallet
            .build_send_one_external_body(0, 1, 3, &message)
            .expect("body");
        let signed = wallet.sign_request(&body).expect("signed");
        let mut parser = signed.parser();
        let signature = parser.read_bits(512).expect("signature");
        let rest_bits = parser.data_bits_left().expect("rest");
        assert_eq!(rest_bits, body.data_len_bits());
        assert_eq!(parser.read_bits(rest_bits).expect("body bits"), {
            let mut body_parser = body.parser();
            body_parser
                .read_bits(rest_bits)
                .expect("original body bits")
        });
        assert_eq!(signed.refs(), body.refs());
        let verifying_key = VerifyingKey::from_bytes(wallet.public_key()).expect("key");
        let signature = Signature::from_slice(&signature).expect("signature");
        verifying_key
            .verify(body.hash().expect("hash").as_slice(), &signature)
            .expect("signature over body hash");

        let unsigned = WalletTg::unsigned_request(&body).expect("unsigned");
        let mut parser = unsigned.parser();
        assert_eq!(
            parser.read_bits(512).expect("zero signature"),
            vec![0u8; 64]
        );
    }

    #[test]
    fn ext_in_msg_carries_state_init_only_when_requested() {
        let wallet = WalletTg::new(fixture_key_pair()).expect("wallet");
        let message = TonCell::builder().build().expect("empty message");
        let with_init = wallet
            .create_ext_in_msg(&message, 0, 1, 3, true)
            .expect("deploying message");
        let without_init = wallet
            .create_ext_in_msg(&message, 0, 1, 3, false)
            .expect("plain message");
        let parsed_with = Msg::<TonCell>::from_cell(&with_init).expect("parse");
        let parsed_without = Msg::<TonCell>::from_cell(&without_init).expect("parse");
        let init = parsed_with.init.expect("state init present").value;
        assert_eq!(
            init.code.expect("code").hash().expect("hash").to_hex(),
            WALLET_TG_TRAMPOLINE_CODE_HASH_HEX
        );
        assert!(parsed_without.init.is_none());
        assert_eq!(
            hex_string(wallet.public_key()).len(),
            64,
            "public key is a 32-byte Ed25519 key"
        );
    }
}
