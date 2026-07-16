import assert from 'node:assert/strict'
import {describe, it} from 'node:test'

import type {CredentialCandidate, RpcResult} from '@chromvoid/scheme'

import {
  CredentialProviderClient,
  CredentialProviderClientError,
  providerContextFromUrl,
} from './credential-provider-client'

type Call = {command: string; data: Record<string, unknown>}

const candidate = (overrides: Partial<CredentialCandidate> = {}): CredentialCandidate => ({
  credential_id: 'credential-1',
  label: 'Example',
  username: 'alice',
  domain: 'example.test',
  app_id: null,
  match: 'exact',
  otp_options: [{id: 'otp-1', label: 'Primary', type: 'totp'}],
  last_used_at: null,
  ...overrides,
})

const createGateway = (handler: (call: Call) => RpcResult<unknown>) => {
  const calls: Call[] = []
  return {
    calls,
    gateway: {
      async call<T>(command: string, data: Record<string, unknown>): Promise<RpcResult<T>> {
        const call = {command, data}
        calls.push(call)
        return handler(call) as RpcResult<T>
      },
      async pairWithPin() {
        return true
      },
      async probeReachable() {
        return true
      },
    },
  }
}

describe('credential provider client', () => {
  it('builds a canonical web context and rejects non-web URLs', () => {
    assert.deepEqual(providerContextFromUrl('https://www.Example.test:8443/login'), {
      kind: 'web',
      origin: 'https://www.example.test:8443',
      domain: 'example.test',
    })
    assert.equal(providerContextFromUrl('chrome://extensions'), undefined)
    assert.equal(providerContextFromUrl(undefined), undefined)
  })

  it('never sends an empty global search', async () => {
    const {gateway, calls} = createGateway(() => ({ok: true, result: {candidates: []}}))
    const client = new CredentialProviderClient(gateway)

    assert.deepEqual(await client.searchAll('  '), [])
    assert.deepEqual(calls, [])
  })

  it('searches metadata without a site context', async () => {
    const item = candidate()
    const {gateway, calls} = createGateway(() => ({ok: true, result: {candidates: [item]}}))
    const client = new CredentialProviderClient(gateway)

    assert.deepEqual(await client.searchAll('  alice  '), [item])
    assert.deepEqual(calls, [{command: 'credential_provider:search', data: {query: 'alice'}}])
  })

  it('re-lists the site, reads a password, and closes the one-shot session', async () => {
    const context = providerContextFromUrl('https://example.test/login')!
    const {gateway, calls} = createGateway(({command}) => {
      if (command === 'credential_provider:list') return {ok: true, result: {candidates: [candidate()]}}
      if (command === 'credential_provider:session:open') {
        return {ok: true, result: {provider_session: 'session-1', expires_at_ms: 1}}
      }
      if (command === 'credential_provider:getSecret') {
        return {
          ok: true,
          result: {credential_id: 'credential-1', username: 'alice', password: 'secret', otp: null},
        }
      }
      return {ok: true, result: null}
    })
    const client = new CredentialProviderClient(gateway)

    assert.deepEqual(await client.readPasswordForSite(context, 'credential-1'), {
      credentialId: 'credential-1',
      username: 'alice',
      password: 'secret',
    })
    assert.deepEqual(
      calls.map(({command}) => command),
      [
        'credential_provider:list',
        'credential_provider:session:open',
        'credential_provider:getSecret',
        'credential_provider:session:close',
      ],
    )
  })

  it('does not open a session when the credential is not confirmed for the site', async () => {
    const context = providerContextFromUrl('https://example.test')!
    const {gateway, calls} = createGateway(() => ({ok: true, result: {candidates: []}}))
    const client = new CredentialProviderClient(gateway)

    await assert.rejects(
      () => client.readPasswordForSite(context, 'credential-1'),
      (error: unknown) =>
        error instanceof CredentialProviderClientError && error.code === 'credential_not_allowed',
    )
    assert.deepEqual(
      calls.map(({command}) => command),
      ['credential_provider:list'],
    )
  })

  it('closes the session when a secret request fails and preserves the original error', async () => {
    const context = providerContextFromUrl('https://example.test')!
    const {gateway, calls} = createGateway(({command}) => {
      if (command === 'credential_provider:list') return {ok: true, result: {candidates: [candidate()]}}
      if (command === 'credential_provider:session:open') {
        return {ok: true, result: {provider_session: 'session-1', expires_at_ms: 1}}
      }
      if (command === 'credential_provider:getSecret') {
        return {ok: false, error: 'Vault changed', code: 'vault_locked'}
      }
      return {ok: true, result: null}
    })
    const client = new CredentialProviderClient(gateway)

    await assert.rejects(
      () => client.readPasswordForSite(context, 'credential-1'),
      (error: unknown) => error instanceof CredentialProviderClientError && error.code === 'vault_locked',
    )
    assert.equal(calls.at(-1)?.command, 'credential_provider:session:close')
  })

  it('uses the selected real OTP profile and the dedicated command', async () => {
    const context = providerContextFromUrl('https://example.test')!
    const {gateway, calls} = createGateway(({command}) => {
      if (command === 'credential_provider:list') return {ok: true, result: {candidates: [candidate()]}}
      if (command === 'credential_provider:session:open') {
        return {ok: true, result: {provider_session: 'session-1', expires_at_ms: 1}}
      }
      if (command === 'credential_provider:getOneTimeCode') {
        return {
          ok: true,
          result: {
            credential_id: 'credential-1',
            otp_id: 'otp-1',
            code: '123456',
            valid_until_ms: 2,
          },
        }
      }
      return {ok: true, result: null}
    })
    const client = new CredentialProviderClient(gateway)

    assert.equal((await client.readOneTimeCodeForSite(context, 'credential-1', 'otp-1')).code, '123456')
    assert.deepEqual(calls[2], {
      command: 'credential_provider:getOneTimeCode',
      data: {
        provider_session: 'session-1',
        credential_id: 'credential-1',
        otp_id: 'otp-1',
        context,
      },
    })
    assert.equal(calls.at(-1)?.command, 'credential_provider:session:close')
  })

  it('rejects HOTP profiles before opening a provider session', async () => {
    const context = providerContextFromUrl('https://example.test')!
    const {gateway, calls} = createGateway(() => ({
      ok: true,
      result: {candidates: [candidate({otp_options: [{id: 'hotp-1', label: 'Counter', type: 'HOTP'}]})]},
    }))
    const client = new CredentialProviderClient(gateway)

    await assert.rejects(
      () => client.readOneTimeCodeForSite(context, 'credential-1', 'hotp-1'),
      (error: unknown) => error instanceof CredentialProviderClientError && error.code === 'otp_unavailable',
    )
    assert.deepEqual(
      calls.map(({command}) => command),
      ['credential_provider:list'],
    )
  })
})
