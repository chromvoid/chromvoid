import type {RpcError, RpcRequest, RpcResult, RpcSuccess} from '@chromvoid/scheme'
import {sha256} from '@noble/hashes/sha2.js'

import {GATEWAY_FALLBACK_ORIGINS, toGatewayWsEndpoint} from '../host-policy'
import {decodeGatewayFrame, encodeGatewayFrame, GatewayFrameType} from './frame'
import {GatewayNoiseTransport, loadOrCreateNoiseStaticKeyPair, NoiseXXInitiator} from './noise-xx'

const PROTOCOL_VERSION = 1
const DEFAULT_TIMEOUT_MS = 15000
const CONNECT_TIMEOUT_MS = 5000
const HEARTBEAT_INTERVAL_MS = 25000

type PendingRequest = {
  resolve: (value: RpcResult<unknown>) => void
  reject: (error: Error) => void
  timeoutId: ReturnType<typeof setTimeout>
}

type GatewayConnection = {
  ws: WebSocket
  transport: GatewayNoiseTransport
}

const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()

const concatChunks = (chunks: Uint8Array[]): Uint8Array => {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.length
  }
  return out
}

const toUint8Array = async (value: Blob | ArrayBuffer | Uint8Array): Promise<Uint8Array> => {
  if (value instanceof Uint8Array) {
    return value
  }

  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value)
  }

  return new Uint8Array(await value.arrayBuffer())
}

const defaultEndpoints = (): string[] => {
  const output: string[] = []
  const seen = new Set<string>()
  for (const origin of GATEWAY_FALLBACK_ORIGINS) {
    const endpoint = toGatewayWsEndpoint(origin)
    if (!endpoint || seen.has(endpoint)) {
      continue
    }
    seen.add(endpoint)
    output.push(endpoint)
  }

  if (!seen.has('ws://127.0.0.1:8003/extension')) {
    output.push('ws://127.0.0.1:8003/extension')
  }

  return output
}

export class GatewayRpcClient {
  private readonly endpoints: string[]
  private connection: GatewayConnection | undefined
  private connecting: Promise<GatewayConnection> | undefined
  private heartbeatTimer: ReturnType<typeof setInterval> | undefined
  private nextMessageId = BigInt(Math.floor(Math.random() * 1_000_000) + 1)
  private readonly pending = new Map<bigint, PendingRequest>()
  private readonly continuation = new Map<bigint, Uint8Array[]>()

  constructor(endpoints: string[] = defaultEndpoints()) {
    this.endpoints = endpoints
  }

  async call<T>(
    command: string,
    data: Record<string, unknown>,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  ): Promise<RpcResult<T>> {
    let lastError: Error | undefined

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const messageId = this.allocateMessageId()
      try {
        return (await this.callOnce<T>(messageId, command, data, timeoutMs)) as RpcResult<T>
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))
        this.resetConnection(lastError)
      }
    }

    const fallbackError = lastError ?? new Error('Gateway request failed')
    return {
      ok: false,
      error: fallbackError.message,
      code: null,
    } satisfies RpcError
  }

  async probeReachable(timeoutMs = 1200): Promise<boolean> {
    for (const endpoint of this.endpoints) {
      try {
        const ws = await this.openWebSocket(endpoint, timeoutMs)
        ws.close()
        return true
      } catch {
        continue
      }
    }

    return false
  }

  async pairWithPin(pin: string, timeoutMs = 5000): Promise<boolean> {
    const normalizedPin = pin.trim()
    if (!/^\d{6}$/.test(normalizedPin)) {
      return false
    }

    const psk = sha256(textEncoder.encode(normalizedPin))

    for (const endpoint of this.endpoints) {
      const pairEndpoint = endpoint.endsWith('/extension')
        ? `${endpoint.slice(0, endpoint.length - '/extension'.length)}/pair`
        : endpoint

      try {
        const ws = await this.openWebSocket(pairEndpoint, timeoutMs)
        const initiator = new NoiseXXInitiator(loadOrCreateNoiseStaticKeyPair(), {
          mode: 'xxpsk0',
          psk,
        })
        ws.send(initiator.writeMessage1())
        const message2 = await this.readBinaryHandshakeMessage(ws)
        initiator.readMessage2(message2)
        ws.send(initiator.writeMessage3())
        ws.close()
        this.resetConnection(new Error('Reconnect after successful pairing'))
        return true
      } catch {
        continue
      }
    }

    return false
  }

  private async callOnce<T>(
    messageId: bigint,
    command: string,
    data: Record<string, unknown>,
    timeoutMs: number,
  ) {
    const connection = await this.ensureConnection()
    const payloadData = {...data}
    if (typeof payloadData['timestamp'] !== 'number') {
      payloadData['timestamp'] = Math.floor(Date.now() / 1000)
    }

    const request: RpcRequest = {
      v: PROTOCOL_VERSION,
      command,
      data: JSON.parse(JSON.stringify(payloadData)) as RpcRequest['data'],
    }

    const payload = textEncoder.encode(JSON.stringify(request))
    const plainFrame = encodeGatewayFrame({
      frameType: GatewayFrameType.RpcRequest,
      messageId,
      flags: 0,
      payload,
    })

    const encrypted = connection.transport.encrypt(plainFrame)

    return new Promise<RpcResult<T>>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pending.delete(messageId)
        reject(new Error(`Gateway request timeout for ${command}`))
      }, timeoutMs)

      this.pending.set(messageId, {
        resolve: (result) => {
          resolve(result as RpcResult<T>)
        },
        reject,
        timeoutId,
      })

      try {
        connection.ws.send(encrypted)
      } catch (error) {
        const pending = this.pending.get(messageId)
        if (pending) {
          clearTimeout(pending.timeoutId)
          this.pending.delete(messageId)
        }
        reject(error instanceof Error ? error : new Error(String(error)))
      }
    })
  }

  private allocateMessageId(): bigint {
    this.nextMessageId += 1n
    return this.nextMessageId
  }

  private async ensureConnection(): Promise<GatewayConnection> {
    if (this.connection && this.connection.ws.readyState === WebSocket.OPEN) {
      return this.connection
    }

    if (this.connecting) {
      return this.connecting
    }

    this.connecting = this.connect()
      .then((connection) => {
        this.connection = connection
        return connection
      })
      .finally(() => {
        this.connecting = undefined
      })

    return this.connecting
  }

  private async connect(): Promise<GatewayConnection> {
    let lastError: Error | undefined

    for (const endpoint of this.endpoints) {
      try {
        const ws = await this.openWebSocket(endpoint)
        const transport = await this.handshake(ws)
        this.bindConnectionHandlers(ws, transport)
        this.startHeartbeat()
        return {ws, transport}
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))
      }
    }

    throw lastError ?? new Error('Unable to connect to local gateway')
  }

  private openWebSocket(endpoint: string, timeoutMs = CONNECT_TIMEOUT_MS): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
      let ws: WebSocket
      try {
        ws = new WebSocket(endpoint)
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)))
        return
      }
      ws.binaryType = 'arraybuffer'

      const timeoutId = setTimeout(() => {
        cleanup()
        ws.close()
        reject(new Error(`Gateway websocket timeout: ${endpoint}`))
      }, timeoutMs)

      const cleanup = () => {
        clearTimeout(timeoutId)
        ws.removeEventListener('open', onOpen)
        ws.removeEventListener('error', onError)
        ws.removeEventListener('close', onClose)
      }

      const onOpen = () => {
        cleanup()
        resolve(ws)
      }

      const onError = () => {
        cleanup()
        reject(new Error(`Gateway websocket open failed: ${endpoint}`))
      }

      const onClose = (event: CloseEvent) => {
        cleanup()
        reject(new Error(`Gateway websocket closed before open (${event.code}): ${endpoint}`))
      }

      ws.addEventListener('open', onOpen)
      ws.addEventListener('error', onError)
      ws.addEventListener('close', onClose)
    })
  }

  private async handshake(ws: WebSocket): Promise<GatewayNoiseTransport> {
    const initiator = new NoiseXXInitiator(loadOrCreateNoiseStaticKeyPair())
    ws.send(initiator.writeMessage1())
    const message2 = await this.readBinaryHandshakeMessage(ws)
    initiator.readMessage2(message2)
    ws.send(initiator.writeMessage3())
    return initiator.intoTransport()
  }

  private readBinaryHandshakeMessage(ws: WebSocket): Promise<Uint8Array> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        cleanup()
        reject(new Error('Gateway handshake timed out'))
      }, CONNECT_TIMEOUT_MS)

      const cleanup = () => {
        clearTimeout(timeoutId)
        ws.removeEventListener('message', onMessage)
        ws.removeEventListener('error', onError)
        ws.removeEventListener('close', onClose)
      }

      const onMessage = async (event: MessageEvent<Blob | ArrayBuffer | Uint8Array>) => {
        cleanup()
        try {
          resolve(await toUint8Array(event.data))
        } catch (error) {
          reject(error instanceof Error ? error : new Error(String(error)))
        }
      }

      const onError = () => {
        cleanup()
        reject(new Error('Gateway handshake failed'))
      }

      const onClose = () => {
        cleanup()
        reject(new Error('Gateway connection closed during handshake'))
      }

      ws.addEventListener('message', onMessage)
      ws.addEventListener('error', onError)
      ws.addEventListener('close', onClose)
    })
  }

  private bindConnectionHandlers(ws: WebSocket, transport: GatewayNoiseTransport) {
    ws.addEventListener('message', (event: MessageEvent<Blob | ArrayBuffer | Uint8Array>) => {
      void this.handleSocketMessage(event.data, transport)
    })

    ws.addEventListener('error', () => {
      this.resetConnection(new Error('Gateway websocket error'))
    })

    ws.addEventListener('close', () => {
      this.resetConnection(new Error('Gateway websocket closed'))
    })
  }

  private async handleSocketMessage(data: Blob | ArrayBuffer | Uint8Array, transport: GatewayNoiseTransport) {
    try {
      const encrypted = await toUint8Array(data)
      const plain = transport.decrypt(encrypted)
      const frame = decodeGatewayFrame(plain)

      if (frame.frameType === GatewayFrameType.Heartbeat) {
        return
      }

      if (frame.frameType !== GatewayFrameType.RpcResponse && frame.frameType !== GatewayFrameType.Error) {
        return
      }

      const chunks = this.continuation.get(frame.messageId) ?? []
      chunks.push(frame.payload)

      if ((frame.flags & 0x01) !== 0) {
        this.continuation.set(frame.messageId, chunks)
        return
      }

      this.continuation.delete(frame.messageId)
      const payload = concatChunks(chunks)
      const pending = this.pending.get(frame.messageId)
      if (!pending) {
        return
      }

      this.pending.delete(frame.messageId)
      clearTimeout(pending.timeoutId)

      if (frame.frameType === GatewayFrameType.Error) {
        const parsed = this.parseJsonPayload(payload)
        const message =
          isRecord(parsed) && typeof parsed['error_message'] === 'string'
            ? parsed['error_message']
            : 'Gateway returned protocol error'
        pending.resolve({
          ok: false,
          error: message,
          code: null,
        } satisfies RpcError)
        return
      }

      const parsed = this.parseJsonPayload(payload)
      if (isRecord(parsed) && typeof parsed['ok'] === 'boolean') {
        pending.resolve(parsed as RpcSuccess<unknown> | RpcError)
        return
      }

      pending.resolve({
        ok: false,
        error: 'Gateway returned invalid RPC payload',
        code: null,
      } satisfies RpcError)
    } catch (error) {
      this.resetConnection(error instanceof Error ? error : new Error(String(error)))
    }
  }

  private parseJsonPayload(payload: Uint8Array): unknown {
    const raw = textDecoder.decode(payload)
    if (!raw) {
      return undefined
    }
    return JSON.parse(raw)
  }

  private startHeartbeat() {
    this.stopHeartbeat()
    this.heartbeatTimer = setInterval(() => {
      const connection = this.connection
      if (!connection || connection.ws.readyState !== WebSocket.OPEN) {
        return
      }

      try {
        const frame = encodeGatewayFrame({
          frameType: GatewayFrameType.Heartbeat,
          messageId: this.allocateMessageId(),
          flags: 0,
          payload: textEncoder.encode(
            JSON.stringify({v: PROTOCOL_VERSION, timestamp: Math.floor(Date.now() / 1000), status: 'alive'}),
          ),
        })
        const encrypted = connection.transport.encrypt(frame)
        connection.ws.send(encrypted)
      } catch {
        this.resetConnection(new Error('Gateway heartbeat failed'))
      }
    }, HEARTBEAT_INTERVAL_MS)
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = undefined
    }
  }

  private resetConnection(error: Error) {
    this.stopHeartbeat()
    const current = this.connection
    if (current) {
      try {
        current.ws.close()
      } catch (closeError) {
        void closeError
      }
    }
    this.connection = undefined
    this.continuation.clear()

    for (const [messageId, pending] of this.pending.entries()) {
      clearTimeout(pending.timeoutId)
      pending.reject(error)
      this.pending.delete(messageId)
    }
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null
}
