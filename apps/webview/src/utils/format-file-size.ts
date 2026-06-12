const FILE_SIZE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'] as const

export type FormatFileSizeOptions = {
  empty?: string
}

export function formatFileSize(bytes: number | null | undefined, options: FormatFileSizeOptions = {}): string {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes)) {
    return options.empty ?? '0 B'
  }

  if (bytes <= 0) return '0 B'

  const exponent = Math.min(FILE_SIZE_UNITS.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)))
  const value = Math.round((bytes / Math.pow(1024, exponent)) * 100) / 100
  return `${value} ${FILE_SIZE_UNITS[exponent]}`
}
