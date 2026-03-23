import type {OTPGetParams, OTPSecretsGateway} from '@project/passmanager'
import type {CatalogDeps} from './types'
import type {CatalogTransport} from './catalog-transport'

import type {Logger} from '../../logger'
import {defaultLogger} from '../../logger'
import {ADAPTER_ERROR, formatAdapterError} from '../../pass-utils'

const isLogger = (value: unknown): value is Logger => {
  if (!value || typeof value !== 'object') return false
  const rec = value as Record<string, unknown>
  return (
    typeof rec['debug'] === 'function' &&
    typeof rec['info'] === 'function' &&
    typeof rec['warn'] === 'function' &&
    typeof rec['error'] === 'function'
  )
}

const OTP_MISS_RE = /(OTP_SECRET_NOT_FOUND|NODE_NOT_FOUND|not\s*found)/i

export class CatalogOTPSecretsGateway implements OTPSecretsGateway {
  private readonly logger: Logger

  constructor(catalog: CatalogDeps, transport: CatalogTransport, logger?: Logger)
  constructor(catalog: CatalogDeps, transport: CatalogTransport, logger: unknown, ...legacy: unknown[])
  constructor(
    private readonly catalog: CatalogDeps,
    private readonly transport: CatalogTransport,
    logger: unknown = defaultLogger,
    ...legacy: unknown[]
  ) {
    if (isLogger(logger)) {
      this.logger = logger
      return
    }
    const legacyLogger = legacy.find((value): value is Logger => isLogger(value))
    this.logger = legacyLogger ?? defaultLogger
  }

  private setError(
    code: (typeof ADAPTER_ERROR)[keyof typeof ADAPTER_ERROR],
    details: string,
    cause?: unknown,
  ) {
    try {
      this.catalog.lastError.set(formatAdapterError(code, details, cause))
    } catch {}
  }

  async getOTP(data: OTPGetParams): Promise<string | undefined> {
    try {
      if (!this.transport.hasSendCatalog) throw new Error('passmanager transport not available')

      const res = (await this.transport.sendCatalog('passmanager:otp:generate', {
        otp_id: data.id,
        entry_id: data.entryId,
        ts: data.ts,
        digits: data.digits,
        period: data.period,
        ha: data.ha,
      })) as {ok: boolean; result: {otp: string}; error?: string}

      if (!res.ok) throw new Error(String(res.error || 'passmanager:otp:generate failed'))
      const code = res.result.otp

      this.logger.debug('[OTP] generated', {otpId: data.id, ok: Boolean(code)})
      return code
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      if (this.transport.isPostRuntimeImportWindow() && OTP_MISS_RE.test(message)) {
        const misses = this.transport.recordPostImportMiss('otp')
        this.logger.warn('[PassManager][saveRoot] post-import otp read miss', {
          otpId: data.id,
          entryId: data.entryId,
          misses,
          message,
        })
      }
      this.setError(ADAPTER_ERROR.OTP_GENERATE, 'Ошибка генерации OTP', e)
      return undefined
    }
  }

  async getOTPSeckey(_id: string): Promise<string | undefined> {
    // Legacy .otp.<label>.json file reading removed; backend manages secrets via domain IDs.
    return undefined
  }

  async removeOTP(id: string): Promise<boolean> {
    try {
      if (!this.transport.hasSendCatalog) throw new Error('passmanager transport not available')

      const res = (await this.transport.sendCatalog('passmanager:otp:removeSecret', {
        otp_id: id,
      })) as {ok: boolean; error?: string}

      if (!res.ok) throw new Error(String(res.error || 'passmanager:otp:removeSecret failed'))
      return true
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      this.logger.warn('[OTP] removeSecret failed', {otpId: id, message})
      this.setError(ADAPTER_ERROR.OTP_REMOVE, 'Ошибка удаления OTP секрета', e)
      return false
    }
  }

  async saveOTP(id: string, secret: string): Promise<boolean> {
    try {
      if (!this.transport.hasSendCatalog) throw new Error('passmanager transport not available')

      const res = (await this.transport.sendCatalog('passmanager:otp:setSecret', {
        otp_id: id,
        secret,
      })) as {ok: boolean; error?: string}

      if (!res.ok) throw new Error(String(res.error || 'passmanager:otp:setSecret failed'))

      this.logger.info('[OTP] setSecret ok', {otpId: id})
      return true
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      this.logger.warn('[OTP] setSecret failed', {otpId: id, message})
      this.setError(ADAPTER_ERROR.OTP_SAVE, 'Ошибка сохранения OTP секрета', e)
      return false
    }
  }
}
