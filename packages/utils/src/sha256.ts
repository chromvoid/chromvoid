// Реализация SHA256 с использованием Web Crypto API в браузере
// и встроенного модуля crypto в Node.js

// Определяем, находимся ли мы в Node.js
const isNode = typeof globalThis.process !== 'undefined' && globalThis.process?.versions?.node !== undefined

// Кэш для модуля crypto в Node.js
let nodeCrypto: any = null

// Асинхронная версия SHA256
export async function sha256(data: string): Promise<string> {
  // В Node.js используем встроенный модуль crypto
  if (isNode) {
    try {
      // Импортируем модуль только при первом вызове
      if (!nodeCrypto) {
        nodeCrypto = await import('crypto')
      }
      return nodeCrypto.createHash('sha256').update(data, 'utf8').digest('hex')
    } catch (_error) {
      throw new Error('Node.js crypto module not available')
    }
  }

  // В браузере используем Web Crypto API
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    try {
      const encoder = new TextEncoder()
      const buffer = encoder.encode(data)
      const hashBuffer = await crypto.subtle.digest('SHA-256', buffer)
      const hashArray = Array.from(new Uint8Array(hashBuffer))
      return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
    } catch (_error) {
      throw new Error('Web Crypto API not available or failed')
    }
  }

  throw new Error('No crypto implementation available')
}
