export function generatePassword(symbols = 18) {
  return (
    window.crypto
      .getRandomValues(new BigUint64Array(4))
      .reduce(
        (prev, curr, index) =>
          //@ts-ignore
          (!index ? prev : prev.toString(36)) +
          (index % 2 ? curr.toString(36).toUpperCase() : curr.toString(36)),
        '',
      )
      .split('')
      //@ts-ignore
      .sort(() => 128 - window.crypto.getRandomValues(new Uint8Array(1))[0])
      .slice(0, symbols)
      .join('')
  )
}

// Character Sets for Extended Password Generator
const CHARSETS = {
  lowercase: 'abcdefghijklmnopqrstuvwxyz',
  uppercase: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  digits: '0123456789',
  symbols: '!@#$%^&*()-_=+[]{};:,.<>/?',
}

export type PasswordGeneratorOptions = {
  length: number
  sets: {
    lowercase: boolean
    uppercase: boolean
    digits: boolean
    symbols: boolean
  }
}

export function generatePasswordWithOptions(options: PasswordGeneratorOptions): string {
  const {length, sets} = options
  const enabledSets: Array<keyof typeof CHARSETS> = (
    Object.keys(sets) as Array<keyof typeof CHARSETS>
  ).filter((k) => sets[k])

  if (enabledSets.length === 0) {
    return generatePassword(length)
  }

  let pool = ''
  for (const key of enabledSets) pool += CHARSETS[key]

  const result: string[] = []

  // At least one character from each selected set
  for (const key of enabledSets) {
    const cs = CHARSETS[key]
    const len = cs.length
    const rand = crypto.getRandomValues(new Uint32Array(1))[0] as number
    const idx = len > 0 ? rand % len : 0
    result.push(cs.charAt(idx))
  }

  // Other symbols from the common pool
  const remaining = Math.max(0, length - result.length)
  const randoms = crypto.getRandomValues(new Uint32Array(remaining))
  for (let i = 0; i < remaining; i++) {
    const plen = pool.length
    const idx = plen > 0 ? randoms[i]! % plen : 0
    result.push(pool.charAt(idx))
  }

  // Fisher-Yates stirring
  for (let i = result.length - 1; i > 0; i--) {
    const rand = crypto.getRandomValues(new Uint32Array(1))[0] as number
    const j = rand % (i + 1)
    const tmp = result[i] as string
    result[i] = result[j] as string
    result[j] = tmp
  }

  return result.join('').slice(0, length)
}

export type PasswordStrength = {
  entropyBits: number
  score: 0 | 1 | 2 | 3 | 4
  label: 'Very weak' | 'Weak' | 'Medium' | 'Good' | 'Strong'
}

export function estimatePasswordStrength(password: string): PasswordStrength {
  let poolSize = 0
  const hasLower = /[a-z]/.test(password)
  const hasUpper = /[A-Z]/.test(password)
  const hasDigits = /[0-9]/.test(password)
  const hasSymbols = /[^a-zA-Z0-9]/.test(password)

  if (hasLower) poolSize += CHARSETS.lowercase.length
  if (hasUpper) poolSize += CHARSETS.uppercase.length
  if (hasDigits) poolSize += CHARSETS.digits.length
  if (hasSymbols) poolSize += CHARSETS.symbols.length

  const length = password.length
  const entropyBits = poolSize > 0 && length > 0 ? Math.floor(length * Math.log2(poolSize)) : 0

  let score: 0 | 1 | 2 | 3 | 4 = 0
  if (entropyBits >= 100) score = 4
  else if (entropyBits >= 70) score = 3
  else if (entropyBits >= 45) score = 2
  else if (entropyBits >= 28) score = 1
  else score = 0

  const label: PasswordStrength['label'] =
    score === 4
      ? 'Strong'
      : score === 3
        ? 'Good'
        : score === 2
          ? 'Medium'
          : score === 1
            ? 'Weak'
            : 'Very weak'

  return {entropyBits, score, label}
}

export const DEFAULT_CLIPBOARD_WIPE_MS = 15000
export const DEFAULT_SECRET_REVEAL_MS = 10000

let clipboardWipeTimer: ReturnType<typeof globalThis.setTimeout> | undefined
let clipboardCopyVersion = 0

type TauriInternals = {
  invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>
}

/** @internal exported for testing */
export function getTauriInternals(): TauriInternals | undefined {
  return (globalThis as unknown as {__TAURI_INTERNALS__?: TauriInternals}).__TAURI_INTERNALS__
}

/** @internal exported for testing */
export async function writeClipboardText(text: string): Promise<void> {
  // Tauri v2: call clipboard plugin IPC directly — dynamic import() does not
  // work in bundled single-file builds (no runtime module loader).
  const tauri = getTauriInternals()
  if (tauri) {
    await tauri.invoke('plugin:clipboard-manager|write_text', {text})
    return
  }

  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }

  // execCommand fallback
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()
  document.execCommand('copy')
  document.body.removeChild(textarea)
}

export async function copyWithAutoWipe(
  text: string,
  wipeMs: number = DEFAULT_CLIPBOARD_WIPE_MS,
): Promise<void> {
  await writeClipboardText(text)

  const version = ++clipboardCopyVersion
  if (clipboardWipeTimer !== undefined) {
    globalThis.clearTimeout(clipboardWipeTimer)
    clipboardWipeTimer = undefined
  }

  if (wipeMs > 0) {
    clipboardWipeTimer = globalThis.setTimeout(async () => {
      if (version !== clipboardCopyVersion) {
        return
      }

      clipboardWipeTimer = undefined
      try {
        await writeClipboardText('')
      } catch {
        // Ignore errors when cleaning the buffer
      }
    }, wipeMs)
  }
}

/**Normalizes the time stamp value to milliseconds from the Unix era.
• Seconds (<=10 digits), milliseconds (<=13) are supported
Microseconds (<=16) and nanoseconds (>16).
*/
export function normalizeTimestampMs(ts: number | string | null | undefined): number {
  const n = Number(ts)
  if (!Number.isFinite(n) || n <= 0) return Date.now()

  const digits = Math.floor(Math.log10(n)) + 1

  if (digits <= 10) return Math.floor(n * 1000) // seconds
  if (digits <= 13) return Math.floor(n) // already.
  if (digits <= 16) return Math.floor(n / 1000) // mx
  return Math.floor(n / 1_000_000) // ns → ms
}
