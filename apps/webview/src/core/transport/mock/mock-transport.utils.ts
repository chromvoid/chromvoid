import type {CatalogAttachmentRequest, CatalogAttachmentResponse} from '@chromvoid/scheme'

import {normalizePath, splitPath} from '../../catalog/local-catalog/path'
import type {Err, Ok} from './mock-transport.types'

export function ok<T>(result: T): Ok<T> {
  return {ok: true, result}
}

export function err(message: string): Err {
  return {ok: false, error: message}
}

export function toStringValue(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined
}

export function toBooleanValue(v: unknown): boolean | undefined {
  return typeof v === 'boolean' ? v : undefined
}

export function toNumberValue(v: unknown): number | undefined {
  if (typeof v !== 'number') return undefined
  if (!Number.isFinite(v)) return undefined
  return v
}

export function toOptionalString(v: unknown): string | undefined {
  const s = toStringValue(v)
  return s && s.length > 0 ? s : undefined
}

export function uint8ToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!)
  }
  return btoa(binary)
}

export function base64ToUint8(b64: string): Uint8Array {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

export function utf8ToUint8(value: string): Uint8Array {
  return new TextEncoder().encode(value)
}

export function uint8ToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return new Uint8Array(bytes).buffer
}

export function nextSourceRevision(previous: number | undefined): number {
  const now = Date.now()
  return Math.max(now, (previous ?? 0) + 1)
}

const MOCK_SYSTEM_SHARD_IDS: ReadonlySet<string> = new Set([
  '.passmanager',
  '.wallet',
  '.passkeys',
  '.trash',
  '.cv-env-runtime',
])

const MOCK_ATTACHMENT_MIME_EXTENSIONS: Readonly<Record<string, string>> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'image/tiff': 'tiff',
  'image/bmp': 'bmp',
  'image/svg+xml': 'svg',
}

/**
 * Names an attachment the way Core `catalog:attachment:prepare` does; null for a request Core rejects
 * as invalid. Creating the folder chain is left to the caller.
 */
export function planMockAttachment(request: CatalogAttachmentRequest): CatalogAttachmentResponse | null {
  const rawFolder = request.folder_path.trim()
  if (
    !rawFolder.startsWith('/') ||
    rawFolder.includes('\\') ||
    /\p{Cc}/u.test(rawFolder) ||
    rawFolder.split('/').some((part) => part === '.' || part === '..')
  ) {
    return null
  }
  const folder = normalizePath(rawFolder)
  const mimeType = request.mime_type.trim().toLowerCase()
  if (
    folder === '/' ||
    MOCK_SYSTEM_SHARD_IDS.has(splitPath(folder)[0] ?? '') ||
    !mimeType.startsWith('image/') ||
    mimeType.length <= 'image/'.length ||
    /\p{White_Space}/u.test(mimeType)
  ) {
    return null
  }

  const sourceName = request.file_name.split(/[/\\]/u).pop() ?? ''
  const dot = sourceName.lastIndexOf('.')
  const rawStem = dot >= 0 ? sourceName.slice(0, dot) : sourceName
  const suffix = dot >= 0 ? sourceName.slice(dot + 1) : ''
  const extension = /^[A-Za-z\d]{1,10}$/u.test(suffix)
    ? suffix.toLowerCase()
    : MOCK_ATTACHMENT_MIME_EXTENSIONS[mimeType]
  if (!extension) {
    return null
  }

  const stem =
    Array.from(rawStem)
      .slice(0, 80)
      .map((char) => (/[\p{Alphabetic}\p{N}_-]/u.test(char) ? char : '-'))
      .join('')
      .replace(/^-+|-+$/gu, '') || 'image'
  const randomSuffix = uint8ToBase64(crypto.getRandomValues(new Uint8Array(16)))
    .replace(/\+/gu, '-')
    .replace(/\//gu, '_')
    .replace(/=+$/u, '')
  const name = `${stem}-${randomSuffix}.${extension}`
  const path = `${folder}/${name}`
  return {
    parent_path: folder,
    name,
    mime_type: mimeType,
    path,
    markdown: `![${stem.replaceAll('_', '\\_')}](<${percentEncodeAttachmentPath(path)}>)`,
  }
}

// Core keeps ASCII alphanumerics and `/-_.~`, so the renderer still sees a vault-absolute target.
function percentEncodeAttachmentPath(path: string): string {
  return Array.from(utf8ToUint8(path), (byte) => {
    const char = String.fromCharCode(byte)
    return /[A-Za-z\d/._~-]/u.test(char) ? char : `%${byte.toString(16).toUpperCase().padStart(2, '0')}`
  }).join('')
}

function chunkString(value: string, size: number): string {
  const chunks: string[] = []
  for (let i = 0; i < value.length; i += size) {
    chunks.push(value.slice(i, i + size))
  }
  return chunks.join('\n')
}

function resolveMockSshAlgorithm(keyType: string): string | undefined {
  switch (keyType) {
    case 'ed25519':
      return 'ssh-ed25519'
    case 'rsa':
      return 'ssh-rsa'
    case 'ecdsa':
      return 'ecdsa-sha2-nistp256'
    default:
      return undefined
  }
}

export async function createMockSshKeyMaterial(
  keyType: 'ed25519' | 'rsa' | 'ecdsa',
  comment: string,
) {
  const algorithm = resolveMockSshAlgorithm(keyType)
  if (!algorithm) {
    throw new Error(`Unsupported SSH key type: ${keyType}`)
  }

  const keyId = crypto.randomUUID()
  const marker = `chromvoid-mock-ssh:${keyType}:${keyId}`
  const publicBlob = uint8ToBase64(utf8ToUint8(`${marker}:public`))
  const publicKey = `${algorithm} ${publicBlob}${comment ? ` ${comment}` : ''}`
  const privateBlob = uint8ToBase64(utf8ToUint8(`${marker}:private:${comment}`))
  const privateKey = `-----BEGIN OPENSSH PRIVATE KEY-----\n${chunkString(privateBlob, 70)}\n-----END OPENSSH PRIVATE KEY-----`
  const digest = await crypto.subtle.digest('SHA-256', uint8ToArrayBuffer(utf8ToUint8(publicKey)))
  const fingerprint = `SHA256:${uint8ToBase64(new Uint8Array(digest)).replace(/=+$/u, '')}`

  return {
    key_id: keyId,
    public_key_openssh: publicKey,
    private_key_openssh: privateKey,
    fingerprint,
    key_type: keyType,
  }
}

export async function readFileBytes(file: File): Promise<Uint8Array> {
  if (typeof file.arrayBuffer === 'function') {
    return new Uint8Array(await file.arrayBuffer())
  }
  if (typeof file.text === 'function') {
    return utf8ToUint8(await file.text())
  }
  if (typeof FileReader === 'function') {
    return await new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        if (reader.result instanceof ArrayBuffer) {
          resolve(new Uint8Array(reader.result))
          return
        }
        reject(new Error('FileReader returned non-binary result'))
      }
      reader.onerror = () => reject(reader.error ?? new Error('File bytes are not readable'))
      reader.readAsArrayBuffer(file)
    })
  }
  throw new Error('File bytes are not readable')
}
