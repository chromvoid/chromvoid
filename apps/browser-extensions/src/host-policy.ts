const ALLOWED_GATEWAY_HOSTS = new Set(['chromvoid.local', 'localhost', '127.0.0.1', '[::1]'])

export const ALLOWED_GATEWAY_PATTERNS = [
  'http://chromvoid.local/*',
  'https://chromvoid.local/*',
  'http://localhost/*',
  'https://localhost/*',
  'http://127.0.0.1/*',
  'https://127.0.0.1/*',
  'http://[::1]/*',
  'https://[::1]/*',
]

export const GATEWAY_FALLBACK_ORIGINS = [
  'http://127.0.0.1:8003',
  'http://localhost:8003',
  'http://[::1]:8003',
  'http://chromvoid.local:8003',
]

export const normalizeGatewayOrigin = (value: string): string | undefined => {
  try {
    const url = new URL(value)
    const hostname = url.hostname.toLowerCase()
    const protocol = url.protocol.toLowerCase()

    if ((protocol !== 'http:' && protocol !== 'https:') || !ALLOWED_GATEWAY_HOSTS.has(hostname)) {
      return undefined
    }

    return `${protocol}//${url.host}`
  } catch {
    return undefined
  }
}

export const toGatewayWsEndpoint = (origin: string): string | undefined => {
  const normalized = normalizeGatewayOrigin(origin)
  if (!normalized) {
    return undefined
  }

  const url = new URL(normalized)
  const protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${url.host}/extension`
}

export const normalizeGatewayWsEndpoint = (value: string): string | undefined => {
  try {
    const url = new URL(value)
    const protocol = url.protocol.toLowerCase()
    const hostname = url.hostname.toLowerCase()
    if ((protocol !== 'ws:' && protocol !== 'wss:') || !ALLOWED_GATEWAY_HOSTS.has(hostname)) {
      return undefined
    }

    return `${protocol}//${url.host}/extension`
  } catch {
    return undefined
  }
}
