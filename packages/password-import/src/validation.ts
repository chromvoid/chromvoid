export const IMPORT_LIMITS = {
  MAX_FILE_SIZE: 50 * 1024 * 1024, // 50MB
  MAX_ENTRIES: 10_000,
  MAX_NOTE_LENGTH: 50_000,
  MAX_PASSWORD_LENGTH: 10_000,
  MAX_TITLE_LENGTH: 300,
  MAX_USERNAME_LENGTH: 300,
  MAX_URL_LENGTH: 2000,
  MAX_URL_RULES: 50,
  MAX_CUSTOM_FIELDS: 100,
  MAX_CUSTOM_FIELD_KEY_LENGTH: 200,
  MAX_CUSTOM_FIELD_VALUE_LENGTH: 10_000,
} as const

export type ImportValidationCode =
  | 'IMPORT_FILE_TOO_LARGE'
  | 'IMPORT_TOO_MANY_ENTRIES'
  | 'IMPORT_FIELD_TOO_LONG'
  | 'IMPORT_INVALID_FIELD'

export class ImportValidationError extends Error {
  constructor(message: string, public readonly code: ImportValidationCode) {
    super(message)
    this.name = 'ImportValidationError'
  }
}

export function assertFileSize(file: File): void {
  if (file.size > IMPORT_LIMITS.MAX_FILE_SIZE) {
    throw new ImportValidationError(
      `File too large: ${(file.size / 1024 / 1024).toFixed(1)}MB (max ${IMPORT_LIMITS.MAX_FILE_SIZE / 1024 / 1024}MB)`,
      'IMPORT_FILE_TOO_LARGE',
    )
  }
}

export function assertEntriesLimit(count: number): void {
  if (count > IMPORT_LIMITS.MAX_ENTRIES) {
    throw new ImportValidationError(
      `Too many entries: ${count} (max ${IMPORT_LIMITS.MAX_ENTRIES})`,
      'IMPORT_TOO_MANY_ENTRIES',
    )
  }
}

export function assertTextMaxLen(value: string, max: number, field: string): void {
  if (value.length <= max) return
  throw new ImportValidationError(
    `Field too long: ${field} (${value.length} > ${max})`,
    'IMPORT_FIELD_TOO_LONG',
  )
}
