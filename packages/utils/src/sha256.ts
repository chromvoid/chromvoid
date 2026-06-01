// Implementation of SHA256 using the Web Crypto API in the browser
// and built-in crypto module in Node.js

// Determine if we are in Node.js
const isNode = typeof process !== 'undefined' && process.versions?.node !== undefined

// Cash for the crypto module in Node.js
let nodeCrypto: any = null

// Asynchronous version of SHA256
export async function sha256(data: string): Promise<string> {
  // Node.js uses the built-in crypto module
  if (isNode) {
    try {
      // Import the module only on the first call
      if (!nodeCrypto) {
        nodeCrypto = await import('crypto')
      }
      return nodeCrypto.createHash('sha256').update(data, 'utf8').digest('hex')
    } catch (_error) {
      throw new Error('Node.js crypto module not available')
    }
  }

  // In the browser we use the Web Crypto API
  if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.subtle) {
    try {
      const encoder = new TextEncoder()
      const buffer = encoder.encode(data)
      const hashBuffer = await globalThis.crypto.subtle.digest('SHA-256', buffer)
      const hashArray = Array.from(new Uint8Array(hashBuffer))
      return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
    } catch (_error) {
      throw new Error('Web Crypto API not available or failed')
    }
  }

  throw new Error('No crypto implementation available')
}
