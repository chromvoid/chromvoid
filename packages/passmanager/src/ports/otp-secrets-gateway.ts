import type {OTPGetParams} from '../service/types'

/**Port to work with OTP and PassManager record secrets
Isolates catalog/transport details from the UI layer.
*/
export interface OTPSecretsGateway {
  getOTP(data: OTPGetParams): Promise<string | undefined>
  getOTPSeckey(id: string): Promise<string | undefined>
  removeOTP(id: string): Promise<boolean>
  saveOTP(id: string, secret: string): Promise<boolean>
  renameOTPLabel?(id: string, previousLabel: string, nextLabel: string): Promise<boolean>
}
