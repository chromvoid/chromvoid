import {WelcomeSetupModel, type PasswordFeedback, type WelcomeSetupStep} from './welcome-setup.model'
import {WelcomeSharedModel} from './welcome-shared.model'
import {WelcomeToolsModel} from './welcome-tools.model'

export class WelcomeModel {
  readonly shared = new WelcomeSharedModel()
  readonly setup = new WelcomeSetupModel({shared: this.shared})
  readonly tools = new WelcomeToolsModel(this.shared, {
    desktopStatusItems: () => {
      if (!this.isRemoteSetupStep(this.setup.effectiveStep())) {
        return []
      }

      return this.setup.remote.welcomeFlowSummaryItems()
    },
  })
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

  private isRemoteSetupStep(step: WelcomeSetupStep): boolean {
    return step === 'remote-connect' || step === 'remote-pair' || step === 'remote-wait'
  }
}

export {WelcomeSetupModel, WelcomeToolsModel, WelcomeSharedModel}
export type {PasswordFeedback, WelcomeSetupStep}
export {RpcError, mapVaultUnlockError, tauriRpc} from './welcome-rpc'
