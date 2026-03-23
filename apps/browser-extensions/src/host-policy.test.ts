import assert from 'node:assert/strict'
import {describe, it} from 'node:test'

import {GATEWAY_FALLBACK_ORIGINS, normalizeGatewayOrigin} from './host-policy'

describe('normalizeGatewayOrigin', () => {
  it('accepts allowed localhost hosts', () => {
    assert.equal(normalizeGatewayOrigin('http://chromvoid.local/extension'), 'http://chromvoid.local')
    assert.equal(normalizeGatewayOrigin('https://localhost:8003/ws'), 'https://localhost:8003')
    assert.equal(normalizeGatewayOrigin('http://127.0.0.1:8003/ws'), 'http://127.0.0.1:8003')
    assert.equal(normalizeGatewayOrigin('http://[::1]:8003/ws'), 'http://[::1]:8003')
  })

  it('rejects non-local hosts and protocols', () => {
    assert.equal(normalizeGatewayOrigin('https://example.com'), undefined)
    assert.equal(normalizeGatewayOrigin('ftp://localhost:8003/ws'), undefined)
    assert.equal(normalizeGatewayOrigin('not-a-url'), undefined)
  })

  it('keeps fallback list inside allowlist', () => {
    for (const origin of GATEWAY_FALLBACK_ORIGINS) {
      assert.ok(normalizeGatewayOrigin(origin))
    }
  })
})
