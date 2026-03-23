import {chacha20poly1305} from '@noble/ciphers/chacha.js'
import {x25519} from '@noble/curves/ed25519.js'
import {blake2s} from '@noble/hashes/blake2.js'
import {hmac} from '@noble/hashes/hmac.js'
import {bytesToHex, concatBytes, hexToBytes} from '@noble/hashes/utils.js'

const HASH_LEN = 32
const EMPTY = new Uint8Array(0)
const NOISE_PROTOCOL_XX = new TextEncoder().encode('Noise_XX_25519_ChaChaPoly_BLAKE2s')
const NOISE_PROTOCOL_XXPSK0 = new TextEncoder().encode('Noise_XXpsk0_25519_ChaChaPoly_BLAKE2s')

const STATIC_KEY_STORAGE_KEY = 'gateway-noise-static-key-v1'

const toPaddedHash = (input: Uint8Array): Uint8Array => {
  if (input.length <= HASH_LEN) {
    const out = new Uint8Array(HASH_LEN)
    out.set(input)
    return out
  }

  return blake2s(input)
}

const hmacBlake2s = (key: Uint8Array, data: Uint8Array): Uint8Array => {
  return hmac(blake2s, key, data)
}

const hkdf2 = (chainingKey: Uint8Array, inputKeyMaterial: Uint8Array): [Uint8Array, Uint8Array] => {
  const tempKey = hmacBlake2s(chainingKey, inputKeyMaterial)
  const out1 = hmacBlake2s(tempKey, new Uint8Array([0x01]))
  const out2 = hmacBlake2s(tempKey, concatBytes(out1, new Uint8Array([0x02])))
  return [out1, out2]
}

const hkdf3 = (
  chainingKey: Uint8Array,
  inputKeyMaterial: Uint8Array,
): [Uint8Array, Uint8Array, Uint8Array] => {
  const tempKey = hmacBlake2s(chainingKey, inputKeyMaterial)
  const out1 = hmacBlake2s(tempKey, new Uint8Array([0x01]))
  const out2 = hmacBlake2s(tempKey, concatBytes(out1, new Uint8Array([0x02])))
  const out3 = hmacBlake2s(tempKey, concatBytes(out2, new Uint8Array([0x03])))
  return [out1, out2, out3]
}

const nonceToBytes = (nonce: bigint): Uint8Array => {
  const out = new Uint8Array(12)
  const view = new DataView(out.buffer, out.byteOffset, out.byteLength)
  view.setBigUint64(4, nonce, true)
  return out
}

const toBytes = (value: ArrayBuffer | Uint8Array): Uint8Array => {
  if (value instanceof Uint8Array) {
    return value
  }

  return new Uint8Array(value)
}

export type NoiseKeyPair = {
  publicKey: Uint8Array
  secretKey: Uint8Array
}

type CipherState = {
  key: Uint8Array | undefined
  nonce: bigint
}

const createCipherState = (key?: Uint8Array): CipherState => ({
  key,
  nonce: 0n,
})

const encryptWithCipherState = (state: CipherState, ad: Uint8Array, plaintext: Uint8Array): Uint8Array => {
  if (!state.key) {
    return plaintext
  }

  const cipher = chacha20poly1305(state.key, nonceToBytes(state.nonce), ad)
  const ciphertext = cipher.encrypt(plaintext)
  state.nonce += 1n

  return ciphertext
}

const decryptWithCipherState = (state: CipherState, ad: Uint8Array, ciphertext: Uint8Array): Uint8Array => {
  if (!state.key) {
    return ciphertext
  }

  const cipher = chacha20poly1305(state.key, nonceToBytes(state.nonce), ad)
  const plaintext = cipher.decrypt(ciphertext)
  state.nonce += 1n

  return plaintext
}

class NoiseSymmetricState {
  private chainingKey: Uint8Array
  private hash: Uint8Array
  private cipherState: CipherState

  constructor(protocolName: Uint8Array) {
    this.hash = toPaddedHash(protocolName)
    this.chainingKey = this.hash.slice()
    this.cipherState = createCipherState(undefined)
    this.mixHash(EMPTY)
  }

  mixHash(data: Uint8Array) {
    this.hash = blake2s(concatBytes(this.hash, data))
  }

  mixKey(inputKeyMaterial: Uint8Array) {
    const [nextCk, tempKey] = hkdf2(this.chainingKey, inputKeyMaterial)
    this.chainingKey = nextCk
    this.cipherState = createCipherState(tempKey)
  }

  mixKeyAndHash(inputKeyMaterial: Uint8Array) {
    const [nextCk, tempHash, tempKey] = hkdf3(this.chainingKey, inputKeyMaterial)
    this.chainingKey = nextCk
    this.mixHash(tempHash)
    this.cipherState = createCipherState(tempKey)
  }

  encryptAndHash(plaintext: Uint8Array): Uint8Array {
    const ciphertext = encryptWithCipherState(this.cipherState, this.hash, plaintext)
    this.mixHash(ciphertext)
    return ciphertext
  }

  decryptAndHash(ciphertext: Uint8Array): Uint8Array {
    const plaintext = decryptWithCipherState(this.cipherState, this.hash, ciphertext)
    this.mixHash(ciphertext)
    return plaintext
  }

  split(): {tx: CipherState; rx: CipherState} {
    const [txKey, rxKey] = hkdf2(this.chainingKey, EMPTY)
    return {
      tx: createCipherState(txKey),
      rx: createCipherState(rxKey),
    }
  }
}

const dh = (localSecretKey: Uint8Array, remotePublicKey: Uint8Array): Uint8Array => {
  return x25519.getSharedSecret(localSecretKey, remotePublicKey)
}

const isValidKeyPair = (value: unknown): value is {publicKey: string; secretKey: string} => {
  if (!value || typeof value !== 'object') {
    return false
  }

  const obj = value as Record<string, unknown>
  return typeof obj['publicKey'] === 'string' && typeof obj['secretKey'] === 'string'
}

export const loadOrCreateNoiseStaticKeyPair = (): NoiseKeyPair => {
  const raw = localStorage.getItem(STATIC_KEY_STORAGE_KEY)
  if (raw) {
    try {
      const parsed: unknown = JSON.parse(raw)
      if (isValidKeyPair(parsed)) {
        const publicKey = hexToBytes(parsed.publicKey)
        const secretKey = hexToBytes(parsed.secretKey)
        if (publicKey.length === 32 && secretKey.length === 32) {
          return {publicKey, secretKey}
        }
      }
    } catch {
      // ignore malformed storage and rotate key below
    }
  }

  const keyPair = x25519.keygen()
  const next = {
    publicKey: bytesToHex(keyPair.publicKey),
    secretKey: bytesToHex(keyPair.secretKey),
  }
  localStorage.setItem(STATIC_KEY_STORAGE_KEY, JSON.stringify(next))

  return {
    publicKey: keyPair.publicKey,
    secretKey: keyPair.secretKey,
  }
}

export class GatewayNoiseTransport {
  private readonly tx: CipherState
  private readonly rx: CipherState

  constructor(tx: CipherState, rx: CipherState) {
    this.tx = tx
    this.rx = rx
  }

  encrypt(plaintext: Uint8Array): Uint8Array {
    return encryptWithCipherState(this.tx, EMPTY, plaintext)
  }

  decrypt(ciphertext: Uint8Array): Uint8Array {
    return decryptWithCipherState(this.rx, EMPTY, ciphertext)
  }
}

export class NoiseXXInitiator {
  private readonly symmetric: NoiseSymmetricState
  private readonly staticKeyPair: NoiseKeyPair
  private readonly pskEnabled: boolean
  private ephemeralKeyPair: NoiseKeyPair | undefined
  private remoteEphemeral: Uint8Array | undefined
  private remoteStatic: Uint8Array | undefined

  constructor(
    staticKeyPair: NoiseKeyPair,
    options?: {
      psk?: Uint8Array
      mode?: 'xx' | 'xxpsk0'
    },
  ) {
    const mode = options?.mode ?? (options?.psk ? 'xxpsk0' : 'xx')
    this.pskEnabled = mode === 'xxpsk0'
    this.symmetric = new NoiseSymmetricState(mode === 'xxpsk0' ? NOISE_PROTOCOL_XXPSK0 : NOISE_PROTOCOL_XX)

    this.staticKeyPair = {
      publicKey: toBytes(staticKeyPair.publicKey),
      secretKey: toBytes(staticKeyPair.secretKey),
    }

    if (options?.psk) {
      this.symmetric.mixKeyAndHash(options.psk)
    }
  }

  writeMessage1(): Uint8Array {
    this.ephemeralKeyPair = x25519.keygen()
    this.symmetric.mixHash(this.ephemeralKeyPair.publicKey)
    if (this.pskEnabled) {
      this.symmetric.mixKey(this.ephemeralKeyPair.publicKey)
    }
    const payload = this.symmetric.encryptAndHash(EMPTY)
    return concatBytes(this.ephemeralKeyPair.publicKey, payload)
  }

  readMessage2(message: Uint8Array) {
    if (!this.ephemeralKeyPair) {
      throw new Error('message1 must be sent before reading message2')
    }

    if (message.length < 32 + 48 + 16) {
      throw new Error('message2 is too short')
    }

    let offset = 0
    this.remoteEphemeral = message.subarray(offset, offset + 32)
    offset += 32
    this.symmetric.mixHash(this.remoteEphemeral)
    if (this.pskEnabled) {
      this.symmetric.mixKey(this.remoteEphemeral)
    }
    this.symmetric.mixKey(dh(this.ephemeralKeyPair.secretKey, this.remoteEphemeral))

    const encryptedRemoteStatic = message.subarray(offset, offset + 48)
    offset += 48
    this.remoteStatic = this.symmetric.decryptAndHash(encryptedRemoteStatic)
    this.symmetric.mixKey(dh(this.ephemeralKeyPair.secretKey, this.remoteStatic))

    const encryptedPayload = message.subarray(offset)
    void this.symmetric.decryptAndHash(encryptedPayload)
  }

  writeMessage3(): Uint8Array {
    if (!this.remoteEphemeral) {
      throw new Error('message2 must be processed before sending message3')
    }

    const encryptedStatic = this.symmetric.encryptAndHash(this.staticKeyPair.publicKey)
    this.symmetric.mixKey(dh(this.staticKeyPair.secretKey, this.remoteEphemeral))
    const encryptedPayload = this.symmetric.encryptAndHash(EMPTY)

    return concatBytes(encryptedStatic, encryptedPayload)
  }

  intoTransport(): GatewayNoiseTransport {
    const {tx, rx} = this.symmetric.split()
    return new GatewayNoiseTransport(tx, rx)
  }
}
