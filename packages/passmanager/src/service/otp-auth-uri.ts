import type {Algorithm, Encoding, OTPOptions, OTPType} from './types'

export type OtpAuthUriParseErrorCode =
  | 'invalid_uri'
  | 'unsupported_scheme'
  | 'unsupported_type'
  | 'missing_secret'
  | 'unsupported_algorithm'
  | 'unsupported_encoding'
  | 'invalid_digits'
  | 'invalid_period'
  | 'invalid_counter'

export type OtpAuthUriParseResult =
  | {
      ok: true
      otp: OTPOptions
    }
  | {
      ok: false
      code: OtpAuthUriParseErrorCode
      message: string
    }

const SUPPORTED_ALGORITHMS: ReadonlySet<Algorithm> = new Set([
  'SHA1',
  'SHA224',
  'SHA256',
  'SHA384',
  'SHA512',
  'SHA3224',
  'SHA3256',
  'SHA3384',
  'SHA3512',
])

const SUPPORTED_ENCODINGS: ReadonlySet<Encoding> = new Set(['base16', 'base32', 'base64', 'utf-8'])

function error(code: OtpAuthUriParseErrorCode, message: string): OtpAuthUriParseResult {
  return {ok: false, code, message}
}

function normalizeAlgorithm(value: string | null): Algorithm | undefined {
  const next = (value || 'SHA1').trim().toUpperCase().replace(/-/g, '') as Algorithm
  return SUPPORTED_ALGORITHMS.has(next) ? next : undefined
}

function normalizeEncoding(value: string | null): Encoding | undefined {
  const next = (value || 'base32').trim().toLowerCase() as Encoding
  return SUPPORTED_ENCODINGS.has(next) ? next : undefined
}

function parsePositiveInteger(value: string | null, fallback: number): number | undefined {
  if (value === null || value.trim() === '') return fallback
  if (!/^\d+$/u.test(value.trim())) return undefined
  const next = Number.parseInt(value, 10)
  return Number.isInteger(next) && next > 0 ? next : undefined
}

function parseNonNegativeInteger(value: string | null, fallback: number): number | undefined {
  if (value === null || value.trim() === '') return fallback
  if (!/^\d+$/u.test(value.trim())) return undefined
  const next = Number.parseInt(value, 10)
  return Number.isInteger(next) && next >= 0 ? next : undefined
}

function readLabel(uri: URL, fallbackLabel?: string): string {
  const issuer = uri.searchParams.get('issuer')?.trim() ?? ''
  const rawPath = uri.pathname.replace(/^\/+/u, '')
  let pathLabel = ''

  if (rawPath) {
    try {
      pathLabel = decodeURIComponent(rawPath).trim()
    } catch {
      pathLabel = rawPath.trim()
    }
  }

  if (pathLabel.includes(':')) {
    const separatorIndex = pathLabel.indexOf(':')
    const pathIssuer = pathLabel.slice(0, separatorIndex)
    const label = pathLabel.slice(separatorIndex + 1).trim()
    if (label && (!issuer || pathIssuer.trim() === issuer)) {
      return label
    }
  }

  return pathLabel || issuer || fallbackLabel?.trim() || ''
}

export function parseOtpAuthUri(raw: string, fallbackLabel?: string): OtpAuthUriParseResult {
  const input = raw.trim()
  if (!input) {
    return error('invalid_uri', 'OTP URI is empty')
  }

  let uri: URL
  try {
    uri = new URL(input)
  } catch {
    return error('invalid_uri', 'Failed to parse OTP URI')
  }

  if (uri.protocol !== 'otpauth:') {
    return error('unsupported_scheme', 'OTP URI must use otpauth://')
  }

  const type = uri.hostname.toUpperCase() as OTPType
  if (type !== 'TOTP' && type !== 'HOTP') {
    return error('unsupported_type', 'OTP URI type must be TOTP or HOTP')
  }

  const secret = uri.searchParams.get('secret')?.trim()
  if (!secret) {
    return error('missing_secret', 'OTP URI is missing a secret')
  }

  const algorithm = normalizeAlgorithm(uri.searchParams.get('algorithm'))
  if (!algorithm) {
    return error('unsupported_algorithm', 'OTP URI algorithm is unsupported')
  }

  const encoding = normalizeEncoding(uri.searchParams.get('encoding'))
  if (!encoding) {
    return error('unsupported_encoding', 'OTP URI encoding is unsupported')
  }

  const digits = parsePositiveInteger(uri.searchParams.get('digits'), 6)
  if (!digits) {
    return error('invalid_digits', 'OTP URI digits value is invalid')
  }

  const period = parsePositiveInteger(uri.searchParams.get('period'), 30)
  if (!period) {
    return error('invalid_period', 'OTP URI period value is invalid')
  }

  const counter = parseNonNegativeInteger(uri.searchParams.get('counter'), 0)
  if (type === 'HOTP' && counter === undefined) {
    return error('invalid_counter', 'OTP URI counter value is invalid')
  }

  return {
    ok: true,
    otp: {
      id: '',
      secret,
      label: readLabel(uri, fallbackLabel),
      algorithm,
      digits,
      period,
      encoding,
      type,
      ...(type === 'HOTP' ? {counter: counter ?? 0} : {}),
    },
  }
}
