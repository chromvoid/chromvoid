import assert from 'node:assert/strict'
import {beforeEach, describe, it} from 'node:test'

import {setLang} from './i18n'
import {resolvePopupStatusError} from './status'

describe('popup runtime status', () => {
  beforeEach(() => {
    setLang('en')
  })

  it('reports disconnected gateway first', () => {
    const out = resolvePopupStatusError({
      gatewayConnected: false,
      gatewayReachable: false,
      providerEnabled: true,
      vaultOpen: true,
    })

    assert.equal(out, 'No connection to Tauri gateway')
  })

  it('reports pairing/authorization requirement when gateway is reachable', () => {
    const out = resolvePopupStatusError({
      gatewayConnected: false,
      gatewayReachable: true,
      providerEnabled: undefined,
      vaultOpen: undefined,
    })

    assert.equal(out, 'Gateway is reachable, but extension is not paired or authorized')
  })

  it('reports provider disabled when gateway is connected', () => {
    const out = resolvePopupStatusError({
      gatewayConnected: true,
      gatewayReachable: true,
      providerEnabled: false,
      vaultOpen: true,
    })

    assert.equal(out, 'Credential provider is disabled in desktop app')
  })

  it('reports locked vault when gateway and provider are available', () => {
    const out = resolvePopupStatusError({
      gatewayConnected: true,
      gatewayReachable: true,
      providerEnabled: true,
      vaultOpen: false,
    })

    assert.equal(out, 'Vault is locked in desktop app')
  })

  it('returns undefined when status is healthy', () => {
    const out = resolvePopupStatusError({
      gatewayConnected: true,
      gatewayReachable: true,
      providerEnabled: true,
      vaultOpen: true,
    })

    assert.equal(out, undefined)
  })
})
