type ShareDiagnosticPayload = {
  sessionId: string
  files: Array<{
    size: number | null
    mimeType: string | null
  }>
}

export type ShareDiagnosticSummary = {
  sessionId: string
  files: number
  knownBytes: number
  unknownSizes: number
  mimeTypes: string[]
}

export type ShareDiagnosticScope = 'handoff' | 'import' | 'store' | 'transport'

export function summarizeSharePayload(
  payload: ShareDiagnosticPayload,
): ShareDiagnosticSummary {
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

export function sanitizeShareDiagnosticMessage(message: string): string {
  return message.replace(/\b(?:content|file):\/\/\S+/gi, '[redacted-uri]')
}

export function shareDiagnosticErrorCode(error: unknown): string | null {
  if (!error || typeof error !== 'object') return null
  const code = (error as {code?: unknown}).code
  return typeof code === 'string' ? code : null
}

export function shareDiagnosticErrorMessage(error: unknown): string {
  if (error instanceof Error) return sanitizeShareDiagnosticMessage(error.message)
  return sanitizeShareDiagnosticMessage(String(error))
}

export function logShareDiagnostic(
  scope: ShareDiagnosticScope,
  event: string,
  details: Record<string, unknown> = {},
): void {
  console.info(`[dashboard][share-${scope}] ${JSON.stringify({event, ...details})}`)
}
