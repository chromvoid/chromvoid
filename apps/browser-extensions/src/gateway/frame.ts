export enum GatewayFrameType {
  RpcRequest = 0x01,
  RpcResponse = 0x02,
  Heartbeat = 0x03,
  Error = 0x04,
}

export const GATEWAY_FRAME_HEADER_SIZE = 14
export const GATEWAY_FLAG_HAS_CONTINUATION = 0x01
const MAX_PAYLOAD_SIZE = 16 * 1024 * 1024

export type GatewayFrame = {
  frameType: GatewayFrameType
  messageId: bigint
  flags: number
  payload: Uint8Array
}

const readBigEndianU32 = (bytes: Uint8Array): number => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  return view.getUint32(0, false)
}

export const encodeGatewayFrame = (frame: GatewayFrame): Uint8Array => {
  const payload = frame.payload
  const out = new Uint8Array(GATEWAY_FRAME_HEADER_SIZE + payload.length)
  const view = new DataView(out.buffer)

  out[0] = frame.frameType
  view.setBigUint64(1, frame.messageId, false)
  out[9] = frame.flags & 0xff
  view.setUint32(10, payload.length, false)
  out.set(payload, GATEWAY_FRAME_HEADER_SIZE)

  return out
}

export const decodeGatewayFrame = (bytes: Uint8Array): GatewayFrame => {
  if (bytes.length < GATEWAY_FRAME_HEADER_SIZE) {
    throw new Error('frame too short')
  }

  const frameType = bytes[0]
  if (frameType === undefined) {
    throw new Error('frame too short')
  }
  if (
    frameType !== GatewayFrameType.RpcRequest &&
    frameType !== GatewayFrameType.RpcResponse &&
    frameType !== GatewayFrameType.Heartbeat &&
    frameType !== GatewayFrameType.Error
  ) {
    throw new Error('unsupported frame type')
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const messageId = view.getBigUint64(1, false)
  const flags = bytes[9] ?? 0
  if ((flags & 0b1111_1100) !== 0) {
    throw new Error('unsupported flags')
  }

  const payloadLength = readBigEndianU32(bytes.subarray(10, 14))
  if (payloadLength > MAX_PAYLOAD_SIZE) {
    throw new Error('payload too large')
  }

  if (bytes.length !== GATEWAY_FRAME_HEADER_SIZE + payloadLength) {
    throw new Error('payload length mismatch')
  }

  return {
    frameType,
    messageId,
    flags,
    payload: bytes.subarray(GATEWAY_FRAME_HEADER_SIZE),
  }
}
