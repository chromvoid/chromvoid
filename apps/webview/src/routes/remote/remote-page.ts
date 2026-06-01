import {ReatomLitElement} from '@chromvoid/uikit/reatom-lit'
import type {PropertyValues} from 'lit'

import {
  formatLastSyncTime,
  getConnectedPeerName,
  getModeLabel,
  isRemoteMode,
} from './remote.model'
import {renderRemotePage} from './remote-page.render'
import {RemotePageModel} from './remote-page.model'
import {remotePageStyles} from './remote-page.styles'

export class RemotePage extends ReatomLitElement {
  static define() {
    if (!customElements.get('remote-page')) {
      customElements.define('remote-page', this)
    }
  }

  static properties = {
    hideBackLink: {type: Boolean, attribute: 'hide-back-link'},
  }

  declare hideBackLink: boolean

  constructor() {
    super()
    this.hideBackLink = false
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
    return renderRemotePage({
      hideBackLink: this.hideBackLink,
      connectionState: model.connectionState,
      remoteStatus: model.remoteStatus,
      devices: model.devices,
      pairedDevices: model.pairedDevices,
      acting: model.acting,
      scanning: model.scanning,
      formatDate: model.formatDate,
      formatRelativeTime: model.formatRelativeTime,
      getConnectionBadgeClass: model.getConnectionBadgeClass,
      getConnectionLabel: model.getConnectionLabel,
      onBack: model.goBack,
      onDisconnect: model.disconnectDevice,
      onScan: model.scan,
      onConnect: model.connectDevice,
      onPair: model.pair,
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
      isMobileRuntime: model.remoteHosts.isMobileHostRuntime,
      remoteHostsModel: model.remoteHosts,
      remoteHostsActions: {
        onRefreshPeers: model.refreshRemotePeers,
        onOpenPairIos: model.openPairIos,
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
      // Sync context (Task 13)
      syncSnapshot: model.syncSnapshot,
      formatLastSyncTime,
      onSyncRetry: model.syncRetry,
      onRequestWriteLock: model.requestWriteLock,
      onReleaseWriteLock: model.releaseWriteLock,
    })
  }
}

RemotePage.define()
