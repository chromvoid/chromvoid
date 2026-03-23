const DEFAULT_IMPORT_DIALOG_FILE_ACCEPT = '.kdbx,.json,.csv'

export function getImportDialogFileAccept(userAgent?: string): string | null {
  const runtimeUserAgent = typeof userAgent === 'string' ? userAgent : readNavigatorUserAgent()

  // Android document pickers often do not map custom .kdbx extensions to a selectable MIME type.
  // Leaving accept unset keeps the file selectable while processFile() still validates the format.
  if (/Android/i.test(runtimeUserAgent)) {
    return null
  }

  return DEFAULT_IMPORT_DIALOG_FILE_ACCEPT
}

function readNavigatorUserAgent(): string {
  if (typeof navigator === 'undefined' || typeof navigator.userAgent !== 'string') {
    return ''
  }

  return navigator.userAgent
}
