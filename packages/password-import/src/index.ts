export type {
  ImportResult,
  ImportedEntry,
  ImportedFolder,
  ImportedIcon,
  Conflict,
  ConflictResolution,
  ImportProgress,
  ExistingEntryInfo,
  UrlMatch,
  UrlRule,
} from './types.js'

export {
  IMPORT_LIMITS,
  ImportValidationError,
  assertFileSize,
  assertEntriesLimit,
  assertTextMaxLen,
} from './validation.js'
export type {ImportValidationCode} from './validation.js'

export {detectConflicts, generateUniqueName, resolveConflictsAutoRename} from './conflicts.js'

export {mapAndSaveEntry, overwriteEntry, ImportOrchestrator} from './mapper.js'
export type {CatalogOperations} from './mapper.js'

export {parseKeePass, KeePassParseError} from './parsers/keepass.js'
export {parseCSV} from './parsers/csv.js'
export {parseBitwardenJson} from './parsers/bitwarden.js'

export {
  MOBILE_FILE_PICKER_LIFECYCLE_END_EVENT,
  MOBILE_FILE_PICKER_LIFECYCLE_START_EVENT,
  notifyMobileFilePickerLifecycleEnd,
  notifyMobileFilePickerLifecycleStart,
} from './ui/mobile-file-picker-lifecycle.js'
export type {MobileFilePickerLifecycleStartDetail} from './ui/mobile-file-picker-lifecycle.js'

export {ImportDialog, setImportCatalogOps, setExistingEntriesMap} from './ui/import-dialog.js'
