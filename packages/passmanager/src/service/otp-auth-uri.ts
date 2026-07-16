import type {Algorithm, Encoding, OTPOptions, OTPType} from './types'

export type OtpAuthUriParseErrorCode =
  | 'invalid_uri'
  | 'uri_too_long'
  | 'unsupported_scheme'
  | 'unsupported_type'
  | 'invalid_authority'
  | 'fragment_not_allowed'
  | 'duplicate_parameter'
  | 'missing_secret'
  | 'secret_too_long'
  | 'label_too_long'
  | 'unsupported_algorithm'
  | 'unsupported_encoding'
  | 'invalid_digits'
  | 'invalid_period'
  | 'invalid_counter'

export type OtpAuthUriMetadata = {
  issuer: string
  account: string
}

export type OtpAuthUriParseResult =
  | {
      ok: true
      otp: OTPOptions
      metadata: OtpAuthUriMetadata
    }
  | {
      ok: false
      code: OtpAuthUriParseErrorCode
      message: string
    }

const SUPPORTED_ALGORITHMS: ReadonlySet<Algorithm> = new Set(['SHA1', 'SHA256', 'SHA512'])
const SUPPORTED_ENCODINGS: ReadonlySet<Encoding> = new Set(['base16', 'base32', 'base64', 'utf-8'])
const MAX_URI_LENGTH = 16 * 1024
const MAX_SECRET_LENGTH = 4096
const MAX_LABEL_LENGTH = 256
const SECURITY_PARAMETERS = new Set(['secret', 'algorithm', 'encoding', 'digits', 'period', 'counter'])

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
  return Number.isSafeInteger(next) && next > 0 ? next : undefined
}

function parseNonNegativeInteger(value: string | null, fallback: number): number | undefined {
  if (value === null || value.trim() === '') return fallback
  if (!/^\d+$/u.test(value.trim())) return undefined
  const next = Number.parseInt(value, 10)
  return Number.isSafeInteger(next) && next >= 0 ? next : undefined
}

function normalizedParameters(uri: URL): Map<string, string[]> {
  const parameters = new Map<string, string[]>()
  for (const [rawKey, value] of uri.searchParams) {
    const key = rawKey.trim().toLowerCase()
    const values = parameters.get(key) ?? []
    values.push(value)
    parameters.set(key, values)
  }
  return parameters
}

function parameter(parameters: Map<string, string[]>, key: string): string | null {
  return parameters.get(key)?.[0] ?? null
}

function readLabel(
  uri: URL,
  issuer: string,
  fallbackLabel?: string,
): {label: string; metadata: OtpAuthUriMetadata} | undefined {
  const rawPath = uri.pathname.replace(/^\/+/u, '')
  let pathLabel = ''
  if (rawPath) {
    try {
      pathLabel = decodeURIComponent(rawPath).trim()
    } catch {
      return undefined
    }
  }

  let pathIssuer = ''
  let account = pathLabel
  if (pathLabel.includes(':')) {
    const separatorIndex = pathLabel.indexOf(':')
    pathIssuer = pathLabel.slice(0, separatorIndex).trim()
    account = pathLabel.slice(separatorIndex + 1).trim()
  }

  const resolvedIssuer = issuer || pathIssuer
  const label = account || resolvedIssuer || fallbackLabel?.trim() || ''
  if (
    resolvedIssuer.length > MAX_LABEL_LENGTH ||
    account.length > MAX_LABEL_LENGTH ||
    label.length > MAX_LABEL_LENGTH
  ) {
    return undefined
  }
  return {label, metadata: {issuer: resolvedIssuer, account}}
}

export function parseOtpAuthUri(raw: string, fallbackLabel?: string): OtpAuthUriParseResult {
  const input = raw.trim()
  if (!input) {
    return error('invalid_uri', 'OTP URI is empty')
  }
  if (input.length > MAX_URI_LENGTH) {
    return error('uri_too_long', 'OTP URI is too long')
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
  if (uri.username || uri.password || uri.port) {
    return error('invalid_authority', 'OTP URI must not contain user info or a port')
  }
  if (uri.hash) {
    return error('fragment_not_allowed', 'OTP URI must not contain a fragment')
  }

  const type = uri.hostname.toUpperCase() as OTPType
  if (type !== 'TOTP' && type !== 'HOTP') {
    return error('unsupported_type', 'OTP URI type must be TOTP or HOTP')
  }

  const parameters = normalizedParameters(uri)
  if ([...SECURITY_PARAMETERS, 'issuer'].some((key) => (parameters.get(key)?.length ?? 0) > 1)) {
    return error('duplicate_parameter', 'OTP URI contains a duplicate security parameter')
  }

  const secret = parameter(parameters, 'secret')?.trim()
  if (!secret) {
    return error('missing_secret', 'OTP URI is missing a secret')
  }
  if (secret.length > MAX_SECRET_LENGTH) {
    return error('secret_too_long', 'OTP URI secret is too long')
  }

  const algorithm = normalizeAlgorithm(parameter(parameters, 'algorithm'))
  if (!algorithm) {
    return error('unsupported_algorithm', 'OTP URI algorithm is unsupported')
  }

  const encoding = normalizeEncoding(parameter(parameters, 'encoding'))
  if (!encoding) {
    return error('unsupported_encoding', 'OTP URI encoding is unsupported')
  }

  const digits = parsePositiveInteger(parameter(parameters, 'digits'), 6)
  if (digits !== 6 && digits !== 8) {
    return error('invalid_digits', 'OTP URI digits value is invalid')
  }

  const period = parsePositiveInteger(parameter(parameters, 'period'), 30)
  if (period === undefined || (type === 'TOTP' && (period < 10 || period > 120))) {
    return error('invalid_period', 'OTP URI period value is invalid')
  }

  const counter = parseNonNegativeInteger(parameter(parameters, 'counter'), 0)
  if (type === 'HOTP' && counter === undefined) {
    return error('invalid_counter', 'OTP URI counter value is invalid')
  }

  const issuer = parameter(parameters, 'issuer')?.trim() ?? ''
  if (issuer.length > MAX_LABEL_LENGTH) {
    return error('label_too_long', 'OTP URI issuer is too long')
  }
  const label = readLabel(uri, issuer, fallbackLabel)
  if (!label) {
    return error('label_too_long', 'OTP URI label is invalid or too long')
  }

  return {
    ok: true,
    metadata: label.metadata,
    otp: {
      id: '',
      secret,
      label: label.label,
      algorithm,
      digits,
      period,
      encoding,
      type,
      ...(type === 'HOTP' ? {counter: counter ?? 0} : {}),
    },
  }
}
