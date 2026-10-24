import {ReatomLitElement} from '@chromvoid/uikit/reatom-lit'
import type {PropertyValues} from 'lit'

import {formatLastSyncTime, getConnectedPeerName, getModeLabel, isRemoteMode} from './remote.model'
import {renderMobileRemoteHostPage} from './remote-mobile-host-page.render'
import {renderRemotePage} from './remote-page.render'
import {RemotePageModel} from './remote-page.model'
import {remotePageStyles} from './remote-page.styles'

export class RemotePage extends ReatomLitElement {
  static define() {
    if (!customElements.get('remote-page')) {
      customElements.define('remote-page', this)
    }
  }

  static styles = [...remotePageStyles]

  private readonly model = new RemotePageModel()

  connectedCallback(): void {
    super.connectedCallback()
    this.model.connect()
  }

  disconnectedCallback(): void {
    super.disconnectedCallback()
    this.model.disconnect()
  }

  protected updated(changedProperties: PropertyValues<this>): void {
    super.updated(changedProperties)
    this.model.syncRemoteHostsPanel()
  }

  protected render() {
    const model = this.model
    if (model.remoteHosts.isMobileHostRuntime()) {
      return renderMobileRemoteHostPage({
        model: model.remoteHosts,
        canShareOffer: model.canShareMobileHostOffer(),
        onStart: this.handleStartMobileHost,
        onRetry: this.handleRetryMobileHost,
        onStop: this.handleStopMobileHost,
        onCopyOffer: this.handleCopyMobileHostOffer,
        onShareOffer: this.handleShareMobileHostOffer,
        onDeviceLabelInput: this.handleMobileHostDeviceLabelInput,
        onRefreshPairedComputers: this.handleRefreshPairedComputers,
        onRevokePairedComputer: this.handleRevokePairedComputer,
      })
    }

    return renderRemotePage({
      connectionState: model.connectionState,
      remoteStatus: model.remoteStatus,
      // Mode context
      currentMode: model.currentMode,
      transportType: model.transportType,
      modeSwitching: model.modeSwitching,
      connectionPhase: model.connectionPhase,
      syncPhase: model.syncPhase,
      modeError: model.modeError,
      getModeLabel,
      getModeBadgeClass: model.getModeBadgeClass,
      getConnectedPeerName,
      isRemoteMode,
      onSwitchToLocal: model.switchToLocal,
      remoteHostsModel: model.remoteHosts,
      remoteHostsActions: {
        onRefreshPeers: model.refreshRemotePeers,
        onOpenPairIos: model.openPairIos,
        onOpenUsbMobile: model.openUsbMobile,
        onBackToHosts: model.backToHosts,
        onConnectPeer: model.connectRemotePeer,
        onRemovePeer: model.removeRemotePeer,
        onOfferInput: model.remoteOfferInput,
        onPinInput: model.remotePinInput,
        onDeviceLabelInput: model.remoteDeviceLabelInput,
        onSubmitPairing: model.submitRemotePairing,
        onRefreshPresence: model.refreshRemotePresence,
        onDisconnectTransport: model.disconnectRemoteTransport,
      },
      remoteHostsUi: {
        waitReason: model.remoteWaitReason(),
      },
      desktopUsbSession: model.desktopUsbSessionPresentation,
      onReconnectUsb: model.openUsbMobile,
      onRetryUsb: model.retryUsbSession,
      onForgetUsb: model.forgetUsbSessionPhone,
      // Sync context (Task 13)
      syncSnapshot: model.syncSnapshot,
      formatLastSyncTime,
      onSyncRetry: model.syncRetry,
      onRequestWriteLock: model.requestWriteLock,
      onReleaseWriteLock: model.releaseWriteLock,
    })
  }

  private handleStartMobileHost() {
    void this.model.remoteHosts.startMobileHost()
  }

  private handleRetryMobileHost() {
    void this.model.remoteHosts.retryMobileHost()
  }

  private handleStopMobileHost() {
    void this.model.remoteHosts.stopMobileHost()
  }

  private handleCopyMobileHostOffer() {
    void this.model.copyMobileHostOffer()
  }

  private handleShareMobileHostOffer() {
    void this.model.shareMobileHostOffer()
  }

  private handleMobileHostDeviceLabelInput(event: Event) {
    this.model.remoteDeviceLabelInput(event)
  }

  private handleRefreshPairedComputers() {
    void this.model.remoteHosts.pairedComputers.refresh()
  }

  private async handleRevokePairedComputer(event: Event) {
    const peerId = (event.currentTarget as HTMLElement).dataset['mobileHostRevokePeerId']
    if (!peerId) return
    const result = await this.model.remoteHosts.pairedComputers.revoke(peerId)
    if (!result) return
    await this.updateComplete
    this.shadowRoot?.querySelector<HTMLElement>('#mobile-host-peers-title')?.focus({preventScroll: true})
  }
}

RemotePage.define()
