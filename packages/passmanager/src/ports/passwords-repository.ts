/*** Port for password manager with storage.
* Encapsulates PassManager root data saving/reading operations.
*
In the current integration, this is comparable to using SAVE KEY and ManagerSaver.
The UI should depend on this port instead of a low-level API.
*/
import type {
  PassManagerCreateEntryPayload,
  PassManagerSaveEntryMetaPayload,
  PassManagerSecretSlot,
  PassManagerSshKey,
  SshKeygenParams,
  SshKeygenResult,
} from '../service/types'
import type {CredentialSecurityAuditArtifactV1} from '../service/security-audit'

export interface PasswordsRepository {
  /**Save the root JSON PassManager*/
  saveRoot(file: File): Promise<boolean>

  /**Read the root JSON PassManager (the type of client chooses himself)*/
  readRoot<T = unknown>(): Promise<T | undefined>

  /**Clean/remove PassManager root data*/
  removeRoot(): Promise<boolean>

  /**Point upsert meta.json of one record (without managing the entire structure)*/
  saveEntryMeta(data: PassManagerSaveEntryMetaPayload): Promise<boolean>

  /**Atomically create one record with its entry-owned secrets*/
  createEntry(data: PassManagerCreateEntryPayload): Promise<boolean>

  /**Point removal of the record directory by its id*/
  removeEntry(id: string): Promise<boolean>

  /**Point removal of a group and its nested subtree*/
  removeGroup(path: string): Promise<void>

  /**Point move of the record directory into another group*/
  moveEntryToGroup(entryId: string, targetGroupPath: string | undefined): Promise<boolean>

  putIcon?(contentBase64: string, mimeType: string): Promise<{iconRef: string; backgroundColor?: string}>
  getIcon?(iconRef: string): Promise<{
    iconRef: string
    mimeType: string
    backgroundColor?: string
    contentBase64: string
  }>
  gcIcons?(): Promise<{deleted: number}>
  setGroupMeta?(path: string, meta: {iconRef?: string | null; description?: string | null}): Promise<boolean>
  readCredentialSecurityAudit?(): Promise<CredentialSecurityAuditArtifactV1 | undefined>
  saveCredentialSecurityAudit?(artifact: CredentialSecurityAuditArtifactV1): Promise<boolean>

  listSshKeys(): Promise<PassManagerSshKey[]>
  updateSshKey(key: PassManagerSshKey): Promise<boolean>
  removeSshKey(keyId: string): Promise<boolean>
  readSshPublicKey(keyId: string): Promise<string | undefined>
  generateSshKey(params: SshKeygenParams): Promise<SshKeygenResult>

  /**Reading/writing of typed entry secrets*/
  readEntrySecret(entryId: string, slot: PassManagerSecretSlot): Promise<string | undefined>
  saveEntrySecret(entryId: string, slot: PassManagerSecretSlot, value: string | null): Promise<boolean>
  removeEntrySecret(entryId: string, slot: PassManagerSecretSlot): Promise<boolean>

  /**Compatibility wrappers for legacy callers*/
  readEntryPassword(entryId: string): Promise<string | undefined>
  saveEntryPassword(entryId: string, password: string | null): Promise<boolean>
  removeEntryPassword(entryId: string): Promise<boolean>

  readEntryNote(entryId: string): Promise<string | undefined>
  saveEntryNote(entryId: string, note: string | null): Promise<boolean>
  removeEntryNote(entryId: string): Promise<boolean>

  readEntrySshPrivateKey(entryId: string, keyId: string): Promise<string | undefined>
  readEntrySshPublicKey(entryId: string, keyId: string): Promise<string | undefined>
  saveEntrySshPrivateKey(entryId: string, keyId: string, key: string | null): Promise<boolean>
  saveEntrySshPublicKey(entryId: string, keyId: string, key: string | null): Promise<boolean>
  removeEntrySshPrivateKey(entryId: string, keyId: string): Promise<boolean>
  removeEntrySshPublicKey(entryId: string, keyId: string): Promise<boolean>
}
