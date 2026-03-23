import assert from 'node:assert/strict'
import {describe, it} from 'node:test'

import type {RpcResult} from '@chromvoid/scheme'

import {GatewayRpcClient} from './rpc-client'

const asMutableRecord = (value: object): Record<string, unknown> => {
  return value as unknown as Record<string, unknown>
}

const isRpcSuccess = <T>(value: RpcResult<T>): value is {ok: true; result: T} => {
  return value.ok === true && 'result' in value
}

const isRpcError = <T>(value: RpcResult<T>): value is {ok: false; error: string; code: string | null} => {
  return value.ok === false && 'error' in value
}

describe('gateway rpc client', () => {
  it('returns first successful response without reconnect', async () => {
    const client = new GatewayRpcClient([])
    const internal = asMutableRecord(client)
    let attempts = 0

    internal['callOnce'] = async (
      _messageId: bigint,
      _command: string,
      _data: Record<string, unknown>,
      _timeoutMs: number,
    ): Promise<RpcResult<{pong: true}>> => {
      attempts += 1
      return {ok: true, result: {pong: true}}
    }

    internal['resetConnection'] = (_error: Error): void => {
      throw new Error('resetConnection should not be called for successful first attempt')
    }

    const out = await client.call<{pong: true}>('ping', {})
    assert.equal(out.ok, true)
    if (isRpcSuccess(out)) {
      assert.deepEqual(out.result, {pong: true})
    }
    assert.equal(attempts, 1)
  })

  it('retries once and returns rpc error after repeated failures', async () => {
    const client = new GatewayRpcClient([])
    const internal = asMutableRecord(client)
    let attempts = 0
    let resets = 0

    internal['callOnce'] = async (
      _messageId: bigint,
      _command: string,
      _data: Record<string, unknown>,
      _timeoutMs: number,
    ): Promise<RpcResult<unknown>> => {
      attempts += 1
      throw new Error(`boom-${attempts}`)
    }

    internal['resetConnection'] = (_error: Error): void => {
      resets += 1
    }

    const out = await client.call('credential_provider:status', {})
    assert.equal(out.ok, false)
    if (isRpcError(out)) {
      assert.match(out.error, /boom-2/)
      assert.equal(out.code, null)
    }

    assert.equal(attempts, 2)
    assert.equal(resets, 2)
  })

  it('rejects pairing when pin is not a 6-digit code', async () => {
    const client = new GatewayRpcClient([])

    const invalidShort = await client.pairWithPin('12345')
    const invalidAlpha = await client.pairWithPin('12ab56')

    assert.equal(invalidShort, false)
    assert.equal(invalidAlpha, false)
  })
})
