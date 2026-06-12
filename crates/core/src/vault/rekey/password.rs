use subtle::ConstantTimeEq;
use zeroize::Zeroizing;

use crate::crypto::keystore::Keystore;
use crate::crypto::{catalog_chunk_name, derive_vault_key_v2, root_index_chunk_name};
use crate::error::{Error, Result};
use crate::storage::Storage;
use crate::types::KEY_SIZE;

const VAULT_PASSWORD_MIN_LEN: usize = 8;

pub(super) fn validate_new_password(current_password: &str, new_password: &str) -> Result<()> {
    if new_password.len() < VAULT_PASSWORD_MIN_LEN {
        return Err(Error::RekeyPasswordPolicy(format!(
            "new vault password must be at least {VAULT_PASSWORD_MIN_LEN} characters"
        )));
    }
    if current_password == new_password {
        return Err(Error::RekeyPasswordPolicy(
            "new vault password must differ from current password".to_string(),
        ));
    }
    Ok(())
}

pub(super) fn derive_session_key(
    storage: &Storage,
    keystore: &dyn Keystore,
    password: &str,
) -> Result<Zeroizing<[u8; KEY_SIZE]>> {
    let salt = storage.get_or_create_salt()?;
    let pepper = keystore
        .load_storage_pepper()
        .map_err(|error| Error::KeystoreUnavailable(error.to_string()))?
        .ok_or(Error::StoragePepperRequired)?;
    derive_vault_key_v2(password, &salt, &pepper)
}

pub(super) fn constant_time_eq(left: &[u8; KEY_SIZE], right: &[u8; KEY_SIZE]) -> bool {
    bool::from(left.as_slice().ct_eq(right.as_slice()))
}

/// Refuse to rekey into a password whose key-derived namespace already holds
/// vault data, which would otherwise collide with / corrupt a (possibly hidden)
/// vault under that password.
///
/// Plausible-deniability note: rejecting here does reveal, to a holder of the
/// current password, that the candidate password has a vault. This residual
/// oracle is inherent to a deniable design and gives the attacker no advantage
/// over simply unlocking with the candidate password (which, in this design,
/// already surfaces that vault) — both cost a full Argon2 derivation per guess.
/// We therefore keep the collision protection but return a generic policy error
/// rather than a message that explicitly confirms "this password has a vault".
pub(super) fn reject_existing_target_vault(
    storage: &Storage,
    new_key: &[u8; KEY_SIZE],
) -> Result<()> {
    let target_names = [
        catalog_chunk_name(new_key, 0),
        root_index_chunk_name(new_key, 0),
    ];
    for name in target_names {
        if storage.chunk_exists(&name)? {
            return Err(Error::RekeyPasswordPolicy(
                "new vault password is not allowed".to_string(),
            ));
        }
    }
    Ok(())
}
