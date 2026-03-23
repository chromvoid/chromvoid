import assert from 'node:assert/strict'
import {describe, it} from 'node:test'

import type {CredentialCandidate, RpcResult} from '@chromvoid/scheme'
import type {OTPGetParams} from '@project/passmanager'

import {createExtensionManagerSaver} from './manager-saver-adapter'

type GatewayCall = {
  command: string
  data: Record<string, unknown>
}

type GatewayHandler = (command: string, data: Record<string, unknown>) => Promise<RpcResult<unknown>>

const ok = <T>(result: T): RpcResult<T> => ({ok: true, result})
const fail = (error: string): RpcResult<never> => ({ok: false, error, code: null})

const createGatewayMock = (handler: GatewayHandler) => {
  const calls: GatewayCall[] = []
  const gateway = {
    async call<T>(command: string, data: Record<string, unknown>): Promise<RpcResult<T>> {
      calls.push({command, data})
      return (await handler(command, data)) as RpcResult<T>
    },
  }

  return {gateway, calls}
}

describe('extension manager saver adapter', () => {
  it('builds passmanager root payload from credential_provider:list', async () => {
    const candidates: CredentialCandidate[] = [
      {
        credential_id: 'cred-1',
        label: 'Example Account',
        username: 'alice@example.com',
        domain: 'https://app.example.com/login',
        match: 'exact',
      },
    ]

    const {gateway, calls} = createGatewayMock(async (command) => {
      if (command === 'credential_provider:list') {
        return ok({candidates})
      }
      return fail('unexpected command')
    })

    const saver = createExtensionManagerSaver(gateway, () => 'https://app.example.com/login')
    const root = await saver.read<{
      version: number
      entries: Array<{id: string; urls: Array<{value: string}>}>
    }>('PASSWORDMANAGER')

    assert.ok(root)
    assert.equal(root?.version, 2)
    assert.equal(root?.entries.length, 1)
    assert.equal(root?.entries[0]?.id, 'cred-1')
    assert.equal(root?.entries[0]?.urls[0]?.value, 'https://app.example.com')
    assert.equal(calls.length, 1)
    assert.equal(calls[0]?.command, 'credential_provider:list')
  })

  it('loads password through list -> session:open -> getSecret flow', async () => {
    const {gateway, calls} = createGatewayMock(async (command) => {
      switch (command) {
        case 'credential_provider:list':
          return ok({candidates: [{credential_id: 'cred-1', label: 'x', username: 'u', match: 'exact'}]})
        case 'credential_provider:session:open':
          return ok({provider_session: 'sess-1'})
        case 'credential_provider:getSecret':
          return ok({
            credential_id: 'cred-1',
            username: 'alice@example.com',
            password: 'secret-password',
            otp: '123456',
          })
        default:
          return fail(`unexpected command ${command}`)
      }
    })

    const saver = createExtensionManagerSaver(gateway, () => 'https://app.example.com/login')
    const password = await saver.readEntryPassword('cred-1')

    assert.equal(password, 'secret-password')
    assert.deepEqual(
      calls.map((c) => c.command),
      ['credential_provider:list', 'credential_provider:session:open', 'credential_provider:getSecret'],
    )
    assert.equal(calls[2]?.data['provider_session'], 'sess-1')
    assert.equal(calls[2]?.data['credential_id'], 'cred-1')
  })

  it('returns undefined for secret reads when provider session open fails', async () => {
    const {gateway, calls} = createGatewayMock(async (command) => {
      switch (command) {
        case 'credential_provider:list':
          return ok({candidates: []})
        case 'credential_provider:session:open':
          return fail('VAULT_REQUIRED')
        default:
          return fail(`unexpected command ${command}`)
      }
    })

    const saver = createExtensionManagerSaver(gateway, () => 'https://app.example.com/login')
    const password = await saver.readEntryPassword('cred-1')

    assert.equal(password, undefined)
    assert.deepEqual(
      calls.map((c) => c.command),
      ['credential_provider:list', 'credential_provider:session:open'],
    )
  })

  it('returns undefined for otp when url context is not web', async () => {
    const {gateway, calls} = createGatewayMock(async () => ok({}))
    const saver = createExtensionManagerSaver(gateway, () => 'chrome://extensions')

    const out = await saver.getOTP({
      id: 'cred-1',
      ts: Date.now(),
      period: 30,
      digits: 6,
      ha: 'SHA1',
    } satisfies OTPGetParams)

    assert.equal(out, undefined)
    assert.equal(calls.length, 0)
  })
})
