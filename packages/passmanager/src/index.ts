export {ManagerRoot} from './service/root'
export type {Logger, LogLevel} from './service/logger'
export {logger, noopLogger, FallbackLogger} from './service/logger'

export {setLang as setPasswordManagerLang} from './i18n'
export {i18n} from './i18n'
export * from './i18n/format'
export {notify, getNotifyAdapter, setNotifyAdapter, showNotifyToast} from './service/notify'
export {
  confirmPassManagerAction,
  getPassManagerDialogAdapter,
  setPassManagerDialogAdapter,
  showPassManagerAlert,
} from './service/dialog'
export type {
  PassManagerAlertOptions,
  PassManagerConfirmOptions,
  PassManagerDialogAdapter,
  PassManagerDialogVariant,
  PassManagerConfirmVariant,
} from './service/dialog'
export type {
  NotifyAdapter,
  NotifyHandle,
  NotifyPayload,
  NotifyToastOptions,
  NotifyVariant,
  ShowNotifyToastOptions,
  ToastPosition,
} from './service/notify'

export type {
  PassManagerEntryType,
  PaymentCardBrand,
  PaymentCardMeta,
  PassManagerSecretSlot,
  PassManagerExportV1,
  PassManagerExportV1Entry,
  ManagerSaver,
  OTPOptions,
  OTPGetParams,
  OTPPreviewParams,
  OTPPreviewResult,
  OTPSaveSettings,
  UrlMatch,
  UrlRule,
  PassManagerRootV2,
  PassManagerRootV2Entry,
  PassManagerRootV2OTP,
  PassManagerRootV2Encoding,
  PassManagerRootV2FolderMeta,
  PassManagerRootV3,
  PassManagerRootV3Entry,
  PassManagerRootV3OTP,
  PassManagerRootV3Encoding,
  PassManagerRootV3FolderMeta,
  PassManagerRootV4,
  PassManagerSshKey,
  SshKeygenParams,
  SshKeygenResult,
  PassManagerCreateEntryPayload,
  PassManagerSaveEntryMetaPayload,
} from './service/types'
export type {
  CredentialTagCatalogMeta,
  CredentialTagColorId,
  CredentialTagKey,
  CredentialTagLabel,
  CredentialTagMeta,
  CredentialTagOption,
} from './service/tags'
export type {IEntry, SshKeyEntry, SshKeyType} from './service/types'
export type {Algorithm, Encoding, OTPType, IEntryExternal} from './service/types'
export type {IGroup} from './service/root'
export type {GroupSaveChangesInput, GroupSaveChangesResult} from './service/group'
export type {PasswordsRepository, OTPSecretsGateway} from './ports'
export type {RootJSONData} from './service/root'
export {Group, ALGORITHMS, ENCODINGS, filterEntries} from './service/root'
export {Entry} from './service/entry'
export {DEFAULT_OPTIONS} from './service/entry'
export type {MutationPresentation} from './service/mutation-presentation'
export {OTP} from './service/otp'
export {
  parseOtpAuthUri,
  type OtpAuthUriMetadata,
  type OtpAuthUriParseErrorCode,
  type OtpAuthUriParseResult,
} from './service/otp-auth-uri'
export {timer} from './service/timer'
export type {Entry as EntryType} from './service/root'
export {EntryFile} from './service/entry-file'
export {syncUiModeWithQuery} from './service/flags'
export {bindPMTheme} from './service/theme'
export {sortStorage} from './service/sort-storage'
export * from './service/sorting'
export * from './service/select'
export * from './service/tags'
export * from './service/security-audit'
export {
  generatePassword,
  generatePasswordWithOptions,
  estimatePasswordStrength,
  copyWithAutoWipe,
  DEFAULT_CLIPBOARD_WIPE_MS,
  DEFAULT_SECRET_REVEAL_MS,
  normalizeTimestampMs,
} from './service/utils'
export type {FileSnapshot} from './service/entry-file'
export {transformUrls, showUrls, formatLink, truncateLink, isLink} from './utils'
export {getPrimaryUrlRule, isOpenableUrlRule, matchesAnyUrlRule, matchesUrlRule} from './url-matching'
export {
  URLValidator,
  type UrlMatchDefault,
  type URLValidationEntry,
  type URLValidationError,
  type URLValidationErrorCode,
  type URLValidationResult,
  type URLValidatorOptions,
} from './url-validator'
