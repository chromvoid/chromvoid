/**
 * Порт для работы менеджера паролей с хранилищем.
 * Инкапсулирует операции сохранения/чтения корневых данных PassManager.
 *
 * В текущей интеграции это сопоставимо с использованием SAVE_KEY и ManagerSaver,
 * но в дальнейшем UI должен зависеть от этого порта вместо низкоуровневого API.
 */
import type {Algorithm, Encoding, OTPType, UrlRule} from '../service/types'

export interface PasswordsRepository {
  /** Сохранить корневой JSON PassManager */
  saveRoot(file: File): Promise<boolean>

  /** Прочитать корневой JSON PassManager (тип клиент выбирает сам) */
  readRoot<T = unknown>(): Promise<T | undefined>

  /** Очистить/удалить корневые данные PassManager */
  removeRoot(): Promise<boolean>

  /** Точечный upsert meta.json одной записи (без управления всей структурой) */
  saveEntryMeta(data: {
    id: string
    title: string
    urls: UrlRule[]
    username: string
    otps: Array<{
      id?: string
      label?: string
      algorithm?: Algorithm
      digits?: number
      period?: number
      encoding?: Encoding
      type?: OTPType
      counter?: number
    }>
    groupPath?: string
    iconRef?: string
    sshKeys?: Array<{id: string; type: string; fingerprint: string; comment?: string}>
  }): Promise<boolean>

  /** Точечное удаление директории записи по её id */
  removeEntry(id: string): Promise<boolean>

  putIcon?(contentBase64: string, mimeType: string): Promise<{iconRef: string}>
  getIcon?(iconRef: string): Promise<{iconRef: string; mimeType: string; contentBase64: string}>
  gcIcons?(): Promise<{deleted: number}>
  setGroupMeta?(path: string, iconRef: string | null): Promise<boolean>

  /** Чтение/запись секретов записи */
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
