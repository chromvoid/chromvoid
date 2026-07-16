import type {OTPGetParams, OTPPreviewParams, OTPPreviewResult, OTPSaveSettings} from '../service/types'

/**Port to work with OTP and PassManager record secrets
Isolates catalog/transport details from the UI layer.
*/
export interface OTPSecretsGateway {
  getOTP(data: OTPGetParams): Promise<string | undefined>
  previewOTP(data: OTPPreviewParams): Promise<OTPPreviewResult>
  getOTPSeckey(id: string): Promise<string | undefined>
  removeOTP(id: string): Promise<boolean>
  saveOTP(id: string, secret: string, settings?: OTPSaveSettings): Promise<boolean>
  renameOTPLabel?(id: string, previousLabel: string, nextLabel: string): Promise<boolean>
}
