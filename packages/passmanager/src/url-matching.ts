import type {UrlRule} from './service/types'

const COMMON_SLD = new Set(['co', 'com', 'net', 'org', 'gov', 'edu', 'ac'])

function normalizeHostname(hostname: string): string {
  return hostname.toLowerCase().replace(/^www\./i, '')
}

function getBaseDomain(hostname: string): string | undefined {
  const host = normalizeHostname(hostname)
  const parts = host.split('.').filter(Boolean)
  if (parts.length < 2) return undefined

  const last = parts[parts.length - 1] ?? ''
  const secondLast = parts[parts.length - 2] ?? ''
  const thirdLast = parts[parts.length - 3] ?? ''

  // Heuristic for common ccTLD second-level registries (co.uk, com.au, etc.)
  if (last.length === 2 && COMMON_SLD.has(secondLast) && thirdLast) {
    return `${thirdLast}.${secondLast}.${last}`
  }

  return `${secondLast}.${last}`
}

function parseRuleUrl(value: string): URL | undefined {
  const raw = String(value ?? '').trim()
  if (!raw) return undefined
  try {
    return new URL(raw)
  } catch {
    // Bitwarden assumes http:// if no scheme is specified.
    try {
      return new URL('http://' + raw)
    } catch {
      return undefined
    }
  }
}

function stripHash(url: URL): string {
  // Match semantics should ignore fragments.
  return url.origin + url.pathname + url.search
}

export function matchesUrlRule(rule: UrlRule, current: URL): boolean {
  const match = rule.match
  const value = String(rule.value ?? '').trim()
  if (!value) return false
  if (match === 'never') return false

  if (match === 'regex') {
    try {
      const re = new RegExp(value, 'i')
      return re.test(stripHash(current))
    } catch {
      return false
    }
  }

  const parsed = parseRuleUrl(value)
  if (!parsed) return false

  if (match === 'exact') {
    return stripHash(parsed) === stripHash(current)
  }

  if (match === 'starts_with') {
    // Uses string prefix on the normalized URL (without fragment).
    return stripHash(current).startsWith(stripHash(parsed))
  }

  if (match === 'host') {
    const ruleHost = normalizeHostname(parsed.hostname)
    const curHost = normalizeHostname(current.hostname)
    if (!ruleHost || !curHost) return false
    if (ruleHost !== curHost) return false

    // Only enforce port when explicitly specified in the rule.
    if (parsed.port) {
      return String(current.port || '') === String(parsed.port)
    }
    return true
  }

  if (match === 'base_domain') {
    const ruleDomain = getBaseDomain(parsed.hostname)
    const curDomain = getBaseDomain(current.hostname)
    if (!ruleDomain || !curDomain) return false
    return ruleDomain === curDomain
  }

  return false
}

export function matchesAnyUrlRule(rules: UrlRule[], current: URL): boolean {
  return rules.some((r) => matchesUrlRule(r, current))
}
