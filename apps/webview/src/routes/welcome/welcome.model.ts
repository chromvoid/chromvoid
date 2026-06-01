import {WelcomeSetupModel, type PasswordFeedback, type WelcomeSetupStep} from './welcome-setup.model'
import {WelcomeSharedModel} from './welcome-shared.model'
import {WelcomeToolsModel} from './welcome-tools.model'

export class WelcomeModel {
  readonly shared = new WelcomeSharedModel()
  readonly setup = new WelcomeSetupModel({shared: this.shared})
  readonly tools = new WelcomeToolsModel(this.shared)
  readonly busy = this.shared.busy
  readonly errorText = this.shared.errorText
  readonly shakeError = this.shared.shakeError

  connect(): void {
    this.setup.connect()
  }

  disconnect(): void {
    this.tools.disconnect()
    this.setup.disconnect()
  }
}

export {WelcomeSetupModel, WelcomeToolsModel, WelcomeSharedModel}
export type {PasswordFeedback, WelcomeSetupStep}
export {RpcError, mapVaultUnlockError, tauriRpc} from './welcome-rpc'
