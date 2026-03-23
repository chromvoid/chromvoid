import {describe, it, expect, vi, beforeEach} from 'vitest'

import {CatalogOTPSecretsGateway} from '../../src/core/state/passmanager/otp-secrets-gateway'
import type {CatalogDeps} from '../../src/core/state/passmanager/types'
import {CatalogTransport} from '../../src/core/state/passmanager/catalog-transport'

function createCatalogDeps() {
  const sendCatalog = vi.fn().mockResolvedValue({ok: true, result: {otp: '123456'}})

  return {
    sendCatalog,
    deps: {
      api: {download: vi.fn()},
      transport: {sendCatalog},
      catalog: {getChildren: vi.fn().mockReturnValue([])},
      lastError: {set: vi.fn()},
      queueRefresh: vi.fn(),
      refresh: vi.fn(async () => undefined),
      refreshSilent: vi.fn(async () => undefined),
    } as unknown as CatalogDeps,
  }
}

function createGateway(deps: CatalogDeps) {
  const transport = new CatalogTransport(deps)
  return new CatalogOTPSecretsGateway(deps, transport)
}

describe('CatalogOTPSecretsGateway', () => {
  let sendCatalog: ReturnType<typeof vi.fn>
  let gateway: CatalogOTPSecretsGateway

  beforeEach(() => {
    const ctx = createCatalogDeps()
    sendCatalog = ctx.sendCatalog
    gateway = createGateway(ctx.deps)
  })

  describe('getOTP (passmanager:otp:generate)', () => {
    const otpId = 'sha256-test-otp-id'
    const entryId = 'uuid-entry-001'

    it('sends otp_id and entry_id as domain identifiers', async () => {
      sendCatalog.mockResolvedValue({ok: true, result: {otp: '654321'}})

      const code = await gateway.getOTP({
        id: otpId,
        entryId,
        ts: 1700000000000,
        digits: 6,
        period: 30,
        ha: 'SHA1',
      })

      expect(code).toBe('654321')
      expect(sendCatalog).toHaveBeenCalledTimes(1)

      const [command, payload] = sendCatalog.mock.calls[0]!
      expect(command).toBe('passmanager:otp:generate')
      expect(payload).toMatchObject({
        otp_id: otpId,
        entry_id: entryId,
      })
      // Must NOT contain node_id or label
      expect(payload).not.toHaveProperty('node_id')
      expect(payload).not.toHaveProperty('nodeId')
    })

    it('forwards OTP timing parameters', async () => {
      sendCatalog.mockResolvedValue({ok: true, result: {otp: '000000'}})

      await gateway.getOTP({
        id: otpId,
        ts: 1700000000000,
        digits: 8,
        period: 60,
        ha: 'SHA256',
      })

      const [, payload] = sendCatalog.mock.calls[0]!
      expect(payload.ts).toBe(1700000000000)
      expect(payload.digits).toBe(8)
      expect(payload.period).toBe(60)
      expect(payload.ha).toBe('SHA256')
    })

    it('returns undefined on failure', async () => {
      sendCatalog.mockResolvedValue({ok: false, error: 'OTP_SECRET_NOT_FOUND'})

      const result = await gateway.getOTP({
        id: otpId,
        ts: Date.now(),
        digits: 6,
        period: 30,
        ha: 'SHA1',
      })

      expect(result).toBeUndefined()
    })

    it('returns undefined when transport throws', async () => {
      sendCatalog.mockRejectedValue(new Error('network error'))

      const result = await gateway.getOTP({
        id: otpId,
        ts: Date.now(),
        digits: 6,
        period: 30,
        ha: 'SHA1',
      })

      expect(result).toBeUndefined()
    })
  })

  describe('saveOTP (passmanager:otp:setSecret)', () => {
    it('sends otp_id and secret only — no node_id or label', async () => {
      sendCatalog.mockResolvedValue({ok: true})

      const result = await gateway.saveOTP('sha256-otp-save', 'JBSWY3DPEHPK3PXP')

      expect(result).toBe(true)
      expect(sendCatalog).toHaveBeenCalledTimes(1)

      const [command, payload] = sendCatalog.mock.calls[0]!
      expect(command).toBe('passmanager:otp:setSecret')
      expect(payload).toMatchObject({
        otp_id: 'sha256-otp-save',
        secret: 'JBSWY3DPEHPK3PXP',
      })
      // Must NOT contain legacy fields
      expect(payload).not.toHaveProperty('node_id')
      expect(payload).not.toHaveProperty('nodeId')
      expect(payload).not.toHaveProperty('label')
    })

    it('returns false on failure (error reported via lastError)', async () => {
      sendCatalog.mockResolvedValue({ok: false, error: 'OTP_SECRET_NOT_FOUND'})

      const result = await gateway.saveOTP('missing-otp', 'SECRET')
      expect(result).toBe(false)
    })
  })

  describe('removeOTP (passmanager:otp:removeSecret)', () => {
    it('sends otp_id only — no node_id or label', async () => {
      sendCatalog.mockResolvedValue({ok: true})

      const result = await gateway.removeOTP('sha256-otp-remove')

      expect(result).toBe(true)
      expect(sendCatalog).toHaveBeenCalledTimes(1)

      const [command, payload] = sendCatalog.mock.calls[0]!
      expect(command).toBe('passmanager:otp:removeSecret')
      expect(payload).toMatchObject({otp_id: 'sha256-otp-remove'})
      // Must NOT contain legacy fields
      expect(payload).not.toHaveProperty('node_id')
      expect(payload).not.toHaveProperty('nodeId')
      expect(payload).not.toHaveProperty('label')
    })

    it('returns false on failure (error reported via lastError)', async () => {
      sendCatalog.mockResolvedValue({ok: false, error: 'OTP_SECRET_NOT_FOUND'})

      const result = await gateway.removeOTP('missing-otp')
      expect(result).toBe(false)
    })
  })

  describe('getOTPSeckey (no-op)', () => {
    it('returns undefined — legacy .otp file reading removed', async () => {
      const result = await gateway.getOTPSeckey('any-otp-id')
      expect(result).toBeUndefined()
      // No transport calls should be made
      expect(sendCatalog).not.toHaveBeenCalled()
    })
  })
})
