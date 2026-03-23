import {XLitElement} from '@statx/lit'
import {html, nothing, type TemplateResult} from 'lit'

import {isTauriRuntime} from 'root/core/runtime/runtime'
import {getRuntimeCapabilities} from 'root/core/runtime/runtime-capabilities'

import {renderWelcomeHero} from './sections/hero'
import {renderWelcomeVaultContent} from './sections/steps'
import {renderWelcomePrintKit} from './sections/tools'
import {WelcomeModel} from './welcome.model'

export type WelcomeToolsSectionOptions = {
  isDesktopRuntime: boolean
  busy: boolean
  restoreInProgress: boolean
  restoreCancelling: boolean
  isPrivacyMode: boolean
  storePath: string
  onBackupClick: () => void
  onRestoreClick: () => void
  onCancelRestore: () => void
  onEraseClick: () => void
  onTogglePrivacy: () => void
  onChangeStorePath: () => void
  onUseDefaultStorePath: () => void
  onPrintKit: () => void
}

export abstract class WelcomePageLayoutBase extends XLitElement {
  static elementName = 'welcome-page'

  static define() {
    const elementName = (this as typeof WelcomePageLayoutBase).elementName
    if (!customElements.get(elementName)) {
      customElements.define(elementName, this as unknown as CustomElementConstructor)
    }
  }

  protected readonly model = new WelcomeModel()

  connectedCallback(): void {
    super.connectedCallback()
    this.model.connect()
  }

  disconnectedCallback(): void {
    this.model.disconnect()
    super.disconnectedCallback()
  }

  protected renderToolsSection(_options: WelcomeToolsSectionOptions): TemplateResult | typeof nothing {
    return nothing
  }

  protected handleCreateMasterSubmit(event: Event): void {
    event.preventDefault()
    this.model.submitMasterSetup()
  }

  protected render() {
    const caps = getRuntimeCapabilities()
    const isTauri = isTauriRuntime()
    const isDesktopRuntime = isTauri && caps.desktop
    const isDesktopRemoteSupported = isDesktopRuntime && caps.supports_network_remote

    const isNeedInit = this.model.isNeedInit
    const setupStep = this.model.setupStep()
    const title = this.model.getHeroTitle(isNeedInit)
    const description = this.model.getHeroDesc(isNeedInit)

    this.model.ensureSetupStep()

    return html`
      <div class="container">
        <div class="main-card">
          ${renderWelcomeHero({
            shakeError: this.model.shakeError(),
            isNeedInit,
            setupStep,
            title,
            description,
          })}
          ${this.model.errorText()
            ? html`<cv-callout variant="danger" class="${this.model.shakeError() ? 'animate-shake' : ''}">
                ${this.model.errorText()}
              </cv-callout>`
            : nothing}
          ${renderWelcomeVaultContent({
            isNeedInit,
            busy: this.model.busy(),
            setupStep,
            creationP1: this.model.creationState().p1,
            creationP2: this.model.creationState().p2,
            passwordStrength: this.model.passwordStrength(),
            isDesktopRemoteSupported,
            remotePeers: this.model.remote.peers(),
            remoteLoadingPeers: this.model.remote.loadingPeers(),
            remoteRemovingPeerId: this.model.remote.removingPeerId(),
            remoteActivePeerId: this.model.remote.activePeerId(),
            remoteStatusText: this.model.remote.statusText(),
            remoteErrorText: this.model.remote.errorText(),
            remoteConnectedPeerLabel:
              this.model.remote.connectedPeer()?.label ??
              this.model.remote.connectedPeer()?.peer_id ??
              'iPhone vault',
            remotePairPhase: this.model.remote.pairModel.phase(),
            remotePairError: this.model.remote.pairModel.error(),
            remotePairOffer: this.model.remote.pairModel.offerInput(),
            remotePairPin: this.model.remote.pairModel.pinInput(),
            remotePairDeviceLabel: this.model.remote.pairModel.deviceLabel(),
            onUnlock: this.model.onUnlock,
            onSelectLocalMode: this.model.onSelectLocalMode,
            onSelectRemoteMode: this.model.onSelectRemoteMode,
            onBackToModeSelect: this.model.onBackToModeSelect,
            onOpenRemotePair: this.model.onOpenRemotePair,
            onBackFromRemoteConnect: this.model.onBackFromRemoteConnect,
            onBackFromRemotePair: this.model.onBackFromRemotePair,
            onBackFromRemoteWait: this.model.onBackFromRemoteWait,
            onMasterPasswordInput: this.model.handleMasterPasswordInput,
            onMasterPasswordConfirmInput: this.model.handleMasterPasswordConfirmInput,
            onCreateMasterSubmit: this.handleCreateMasterSubmit,
            onRefreshRemotePeers: this.model.onRefreshRemotePeers,
            onConnectRemotePeer: this.model.onConnectRemotePeer,
            onRemoveRemotePeer: this.model.onRemoveRemotePeer,
            onRemoteOfferInput: this.model.onRemoteOfferInput,
            onRemotePinInput: this.model.onRemotePinInput,
            onRemoteDeviceLabelInput: this.model.onRemoteDeviceLabelInput,
            onSubmitRemotePair: this.model.onSubmitRemotePair,
          })}
        </div>

        ${this.renderToolsSection({
          isDesktopRuntime,
          busy: this.model.busy(),
          restoreInProgress: this.model.restoreInProgress(),
          restoreCancelling: this.model.restoreCancelling(),
          isPrivacyMode: this.model.isPrivacyMode(),
          storePath: this.model.storePath,
          onBackupClick: this.model.onBackupClick,
          onRestoreClick: this.model.onRestoreClick,
          onCancelRestore: this.model.cancelRestore,
          onEraseClick: this.model.onEraseClick,
          onTogglePrivacy: this.model.togglePrivacy,
          onChangeStorePath: this.model.onChangeStorePath,
          onUseDefaultStorePath: this.model.onUseDefaultStorePath,
          onPrintKit: this.model.onPrintKit,
        })}
      </div>

      ${renderWelcomePrintKit({storePath: this.model.storePath})}
    `
  }
}
