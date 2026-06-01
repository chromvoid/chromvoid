type AndroidShareDiagnosticPayload = {
  sessionId: string
  files: Array<{
    size: number | null
    mimeType: string | null
  }>
}

export type AndroidShareDiagnosticSummary = {
  sessionId: string
  files: number
  knownBytes: number
  unknownSizes: number
  mimeTypes: string[]
}

export type AndroidShareDiagnosticScope = 'handoff' | 'import' | 'store' | 'transport'

export function summarizeAndroidSharePayload(
  payload: AndroidShareDiagnosticPayload,
): AndroidShareDiagnosticSummary {
  const knownBytes = payload.files.reduce((sum, file) => sum + (file.size ?? 0), 0)
  const unknownSizes = payload.files.filter((file) => file.size === null).length
  const mimeTypes = Array.from(
    new Set(payload.files.map((file) => file.mimeType).filter((mimeType): mimeType is string => Boolean(mimeType))),
  )

  return {
    sessionId: payload.sessionId,
    files: payload.files.length,
    knownBytes,
    unknownSizes,
    mimeTypes,
  }
}

export function sanitizeAndroidShareDiagnosticMessage(message: string): string {
  return message.replace(/\b(?:content|file):\/\/\S+/gi, '[redacted-uri]')
}

export function androidShareDiagnosticErrorCode(error: unknown): string | null {
  if (!error || typeof error !== 'object') return null
  const code = (error as {code?: unknown}).code
  return typeof code === 'string' ? code : null
}

export function androidShareDiagnosticErrorMessage(error: unknown): string {
  if (error instanceof Error) return sanitizeAndroidShareDiagnosticMessage(error.message)
  return sanitizeAndroidShareDiagnosticMessage(String(error))
}

export function logAndroidShareDiagnostic(
  scope: AndroidShareDiagnosticScope,
  event: string,
  details: Record<string, unknown> = {},
): void {
  console.info(`[dashboard][android-share-${scope}] ${JSON.stringify({event, ...details})}`)
}
