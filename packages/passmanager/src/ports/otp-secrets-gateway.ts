import type {OTPGetParams} from '../service/types'

/**
 * Порт для работы с OTP и секретами записей PassManager.
 * Изолирует детали каталога/транспорта от слоя UI.
 */
export interface OTPSecretsGateway {
  getOTP(data: OTPGetParams): Promise<string | undefined>
  getOTPSeckey(id: string): Promise<string | undefined>
  removeOTP(id: string): Promise<boolean>
  saveOTP(id: string, secret: string): Promise<boolean>
}
