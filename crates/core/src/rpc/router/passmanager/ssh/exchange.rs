use serde::Deserialize;
use ssh_key::{HashAlg, PublicKey};
use zeroize::Zeroizing;

use super::super::error::PassmanagerCommandError as Error;
use super::store;
use crate::crypto::ssh::{export_ssh_private_key, MAX_OPENSSH_BYTES};
use crate::rpc::types::{PassmanagerSshExportRequest, PassmanagerSshExportResponse};
use crate::{storage::Storage, vault::VaultSession};

pub(super) fn export(
    session: &VaultSession,
    storage: &Storage,
    data: &serde_json::Value,
) -> Result<PassmanagerSshExportResponse, Error> {
    let request = PassmanagerSshExportRequest::deserialize(data)
        .map_err(|_| Error::empty_payload("Invalid SSH export settings"))?;
    if !store::is_valid_key_id(&request.key_id) {
        return Err(Error::empty_payload("SSH key id is invalid"));
    }
    if !matches!(
        request.format.as_str(),
        "openssh_public" | "openssh_private"
    ) || (request.format == "openssh_public" && request.passphrase.is_some())
    {
        return Err(Error::empty_payload("Choose a supported SSH export format"));
    }
    let keys = store::load_keys(session, storage)?;
    let key = keys
        .iter()
        .find(|key| key.id == request.key_id)
        .ok_or_else(|| Error::node_not_found("SSH key not found"))?;
    let (content, fingerprint, filename) = if request.format == "openssh_public" {
        let value = read_material(session, storage, &key.id, "ssh_public_key")?;
        let public = PublicKey::from_openssh(&value)
            .map_err(|_| Error::empty_payload("SSH public key is invalid"))?;
        let content = public
            .to_openssh()
            .map_err(|_| Error::internal("Could not encode SSH public key"))?;
        (
            Zeroizing::new(content),
            public.fingerprint(HashAlg::Sha256).to_string(),
            format!("{}.pub", key.id),
        )
    } else {
        let value = read_material(session, storage, &key.id, "ssh_private_key")?;
        let (content, fingerprint) = export_ssh_private_key(&value, request.passphrase.as_deref())
            .map_err(Error::empty_payload)?;
        (content, fingerprint, key.id.clone())
    };
    if fingerprint != key.fingerprint {
        return Err(Error::empty_payload(
            "SSH key does not match its saved fingerprint",
        ));
    }
    Ok(PassmanagerSshExportResponse {
        filename,
        content: content.to_string(),
    })
}

fn read_material(
    session: &VaultSession,
    storage: &Storage,
    key_id: &str,
    secret_type: &str,
) -> Result<Zeroizing<String>, Error> {
    let filename = store::secret_filename(key_id, secret_type)?;
    let path = format!("{}/{filename}", store::SSH_ROOT_PATH);
    // Check catalog size before allocating/decrypting an imported legacy secret file.
    if session
        .catalog()
        .find_by_path(&path)
        .is_some_and(|node| node.size > MAX_OPENSSH_BYTES as u64)
    {
        return Err(Error::empty_payload("SSH key exceeds 64 KiB"));
    }
    let value = Zeroizing::new(store::read_secret(session, storage, key_id, secret_type)?);
    if value.len() > MAX_OPENSSH_BYTES {
        return Err(Error::empty_payload("SSH key exceeds 64 KiB"));
    }
    Ok(value)
}
