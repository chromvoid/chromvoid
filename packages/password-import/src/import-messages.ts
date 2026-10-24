import type {ImportReview} from './credential-import-service.js'
import {i18n} from './i18n.js'
import type {TranslationKey} from './i18n/locales/index.js'

type ImportWarning = NonNullable<ImportReview['warnings']>[number]
const warningKeys: Record<ImportWarning['code'], TranslationKey> = {
  unsupported_records: 'import:warning:unsupported_records',
  passkeys_omitted: 'import:warning:passkeys_omitted',
  otp_in_note: 'import:warning:otp_in_note',
  card_in_note: 'import:warning:card_in_note',
  entry_limit: 'import:warning:entry_limit',
  invalid_rows: 'import:warning:invalid_rows',
  unmapped_columns: 'import:warning:unmapped_columns',
  attachments_omitted: 'import:warning:attachments_omitted',
  icons_omitted: 'import:warning:icons_omitted',
  records_omitted: 'import:warning:records_omitted',
  legacy_identifiers_matched: 'import:warning:legacy_identifiers_matched',
}

export function importWarningMessage(warning: ImportWarning): string {
  return `${i18n(warningKeys[warning.code])}: ${warning.count}`
}
