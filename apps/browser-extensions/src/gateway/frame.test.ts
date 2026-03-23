import assert from 'node:assert/strict'
import {describe, it} from 'node:test'

import {
  decodeGatewayFrame,
  encodeGatewayFrame,
  GatewayFrameType,
  GATEWAY_FLAG_HAS_CONTINUATION,
} from './frame'

describe('gateway frame codec', () => {
  it('round-trips rpc frames', () => {
    const payload = new TextEncoder().encode('{"ok":true}')
    const encoded = encodeGatewayFrame({
      frameType: GatewayFrameType.RpcRequest,
      messageId: 42n,
      flags: GATEWAY_FLAG_HAS_CONTINUATION,
      payload,
    })

    const decoded = decodeGatewayFrame(encoded)
    assert.equal(decoded.frameType, GatewayFrameType.RpcRequest)
    assert.equal(decoded.messageId, 42n)
    assert.equal(decoded.flags, GATEWAY_FLAG_HAS_CONTINUATION)
    assert.equal(new TextDecoder().decode(decoded.payload), '{"ok":true}')
  })

  it('rejects malformed frames', () => {
    assert.throws(() => decodeGatewayFrame(new Uint8Array([0x01])), /frame too short/)
  })
})
