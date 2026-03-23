import {html} from 'lit'
import {i18n} from 'root/i18n'

import type {NetworkPairPhase} from 'root/routes/network-pair/network-pair.model'
import type {NetworkPairedPeer} from 'root/routes/remote/remote.model'

import type {PasswordFeedback, WelcomeSetupStep} from '../welcome.model'

function renderEntropyMeter(passwordStrength: PasswordFeedback) {
  const {score, feedback} = passwordStrength
  if (!passwordStrength) return ''

  const scoreText = ['Very Weak', 'Weak', 'Fair', 'Good', 'Strong'][score]

  return html`
    <div class="entropy-meter score-${score}">
      <div class="entropy-bar">
        <div class="entropy-segment"></div>
        <div class="entropy-segment"></div>
        <div class="entropy-segment"></div>
        <div class="entropy-segment"></div>
      </div>
      <div class="entropy-text">
        <span class="entropy-score">${scoreText}</span>
        ${feedback.warning
          ? html`<span class="entropy-warning"> — ${feedback.warning}</span>`
          : ''}
      </div>
    </div>
  `
}

function renderModeIcon(kind: 'local' | 'remote') {
  if (kind === 'local') {
    return html`
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <rect x="3" y="4" width="18" height="12" rx="2"></rect>
        <path d="M8 20h8"></path>
        <path d="M12 16v4"></path>
      </svg>
    `
  }

  return html`
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <rect x="7" y="2" width="10" height="20" rx="3"></rect>
      <path d="M11 18h2"></path>
      <path d="M4 8h2"></path>
      <path d="M18 8h2"></path>
    </svg>
  `
}

function renderRemotePeerItem({
  peer,
  activePeerId,
  removingPeerId,
  onConnectRemotePeer,
  onRemoveRemotePeer,
}: {
  peer: NetworkPairedPeer
  activePeerId: string | null
  removingPeerId: string | null
  onConnectRemotePeer: (peerId: string) => void
  onRemoveRemotePeer: (peer: NetworkPairedPeer) => void
}) {
  const platformLabel = peer.platform === 'ios' ? 'iPhone Host' : 'Network Peer'
  const statusLabel = peer.platform === 'ios' ? peer.status ?? 'offline' : null
  const statusClass =
    statusLabel === 'ready' ? 'success' : statusLabel === 'waking' ? 'warning' : statusLabel === 'offline' ? 'danger' : ''
  const isActive = activePeerId === peer.peer_id
  const isRemoving = removingPeerId === peer.peer_id
  const actionLabel =
    isActive ? 'Connecting…' : peer.platform === 'ios' && statusLabel !== 'ready' ? 'Wake & Connect' : 'Connect'

  return html`
    <div class="remote-peer">
      <div class="remote-peer-main">
        <div class="remote-peer-title">${peer.label || peer.peer_id}</div>
        <div class="remote-peer-meta">${peer.peer_id}</div>
      </div>
      <div class="remote-peer-badges">
        <span class="mode-badge">${platformLabel}</span>
        ${statusLabel ? html`<span class="mode-badge status-${statusClass || 'neutral'}">${statusLabel}</span>` : ''}
      </div>
      <div class="remote-peer-actions">
        <cv-button variant="primary" ?disabled=${isActive || isRemoving} .loading=${isActive} @click=${() => onConnectRemotePeer(peer.peer_id)}>
          ${actionLabel}
        </cv-button>
        <cv-button variant="danger" ?disabled=${isActive || isRemoving} .loading=${isRemoving} @click=${() => onRemoveRemotePeer(peer)}>
          Remove
        </cv-button>
      </div>
    </div>
  `
}

function renderRemoteConnectStep({
  isNeedInit,
  remoteLoadingPeers,
  remotePeers,
  remoteRemovingPeerId,
  remoteActivePeerId,
  remoteStatusText,
  remoteErrorText,
  onRefreshRemotePeers,
  onOpenRemotePair,
  onBackFromRemoteConnect,
  onConnectRemotePeer,
  onRemoveRemotePeer,
}: {
  isNeedInit: boolean
  remoteLoadingPeers: boolean
  remotePeers: NetworkPairedPeer[]
  remoteRemovingPeerId: string | null
  remoteActivePeerId: string | null
  remoteStatusText: string | null
  remoteErrorText: string | null
  onRefreshRemotePeers: () => void
  onOpenRemotePair: () => void
  onBackFromRemoteConnect: () => void
  onConnectRemotePeer: (peerId: string) => void
  onRemoveRemotePeer: (peer: NetworkPairedPeer) => void
}) {
  return html`
    <div class="back-link" @click=${onBackFromRemoteConnect}>
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="M19 12H5M12 19l-7-7 7-7" />
      </svg>
      ${isNeedInit ? 'Back to mode selection' : 'Back to unlock screen'}
    </div>

    <div class="step active">
      <div class="step-title">Paired Remote Hosts</div>
      <div class="step-desc">Choose a paired iPhone host or pair a new one before entering the dashboard.</div>

      ${remoteStatusText ? html`<cv-callout variant="info">${remoteStatusText}</cv-callout>` : ''}
      ${remoteErrorText ? html`<cv-callout variant="danger">${remoteErrorText}</cv-callout>` : ''}

      <div class="remote-actions">
        <cv-button variant="primary" ?disabled=${remoteLoadingPeers} @click=${onRefreshRemotePeers}>
          ${remoteLoadingPeers ? 'Refreshing…' : 'Refresh Hosts'}
        </cv-button>
        <cv-button variant="ghost" @click=${onOpenRemotePair}>Pair iPhone</cv-button>
      </div>

      ${remotePeers.length > 0
        ? html`<div class="remote-peer-list">
            ${remotePeers.map((peer) =>
              renderRemotePeerItem({
                peer,
                activePeerId: remoteActivePeerId,
                removingPeerId: remoteRemovingPeerId,
                onConnectRemotePeer,
                onRemoveRemotePeer,
              }),
            )}
          </div>`
        : html`
            <div class="empty-remote-state">
              <div class="step-title">No paired iPhone hosts</div>
              <div class="step-desc">
                Pair your iPhone first, then come back here to connect once its vault is open locally.
              </div>
              <cv-button variant="primary" @click=${onOpenRemotePair}>Pair iPhone</cv-button>
            </div>
          `}
    </div>
  `
}

function renderRemotePairStep({
  remotePairPhase,
  remotePairError,
  remotePairOffer,
  remotePairPin,
  remotePairDeviceLabel,
  onBackFromRemotePair,
  onRemoteOfferInput,
  onRemotePinInput,
  onRemoteDeviceLabelInput,
  onSubmitRemotePair,
}: {
  remotePairPhase: NetworkPairPhase
  remotePairError: string | null
  remotePairOffer: string
  remotePairPin: string
  remotePairDeviceLabel: string
  onBackFromRemotePair: () => void
  onRemoteOfferInput: (event: Event) => void
  onRemotePinInput: (event: Event) => void
  onRemoteDeviceLabelInput: (event: Event) => void
  onSubmitRemotePair: () => void
}) {
  const pairBusy = remotePairPhase === 'connecting' || remotePairPhase === 'starting'

  return html`
    <div class="back-link" @click=${onBackFromRemotePair}>
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="M19 12H5M12 19l-7-7 7-7" />
      </svg>
      Back to remote hosts
    </div>

    <div class="step active">
      <div class="step-title">Pair With iPhone</div>
      <div class="step-desc">Paste the pairing offer from your iPhone and enter the PIN shown on the phone.</div>

      ${remotePairError ? html`<cv-callout variant="danger">${remotePairError}</cv-callout>` : ''}

      <div class="remote-form-grid">
        <label class="remote-field">
          <span class="remote-field-label">Pairing Offer</span>
          <cv-textarea
            class="remote-textarea"
            placeholder="chromvoid://pair-ios?session_id=..."
            .value=${remotePairOffer}
            @cv-input=${onRemoteOfferInput}
          ></cv-textarea>
        </label>

        <label class="remote-field">
          <span class="remote-field-label">PIN</span>
          <cv-input
            type="text"
            inputmode="numeric"
            placeholder="123456"
            .value=${remotePairPin}
            @cv-input=${onRemotePinInput}
          ></cv-input>
        </label>

        <label class="remote-field">
          <span class="remote-field-label">Desktop Label</span>
          <cv-input
            type="text"
            placeholder="ChromVoid Desktop"
            .value=${remotePairDeviceLabel}
            @cv-input=${onRemoteDeviceLabelInput}
          ></cv-input>
        </label>
      </div>
    </div>

    <div class="remote-actions">
      <cv-button variant="primary" ?disabled=${pairBusy} .loading=${pairBusy} @click=${onSubmitRemotePair}>
        Pair iPhone
      </cv-button>
      <cv-button variant="ghost" @click=${onBackFromRemotePair}>Cancel</cv-button>
    </div>
  `
}

function renderRemoteWaitStep({
  remoteConnectedPeerLabel,
  remoteStatusText,
  remoteErrorText,
  onBackFromRemoteWait,
}: {
  remoteConnectedPeerLabel: string
  remoteStatusText: string | null
  remoteErrorText: string | null
  onBackFromRemoteWait: () => void
}) {
  return html`
    <div class="back-link" @click=${onBackFromRemoteWait}>
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="M19 12H5M12 19l-7-7 7-7" />
      </svg>
      Disconnect remote transport
    </div>

    <div class="step active">
      <div class="step-title">Waiting For ${remoteConnectedPeerLabel}</div>
      <div class="step-desc">
        The transport is already connected. Open the vault directly on your iPhone to continue into the remote dashboard.
      </div>

      ${remoteStatusText ? html`<cv-callout variant="info">${remoteStatusText}</cv-callout>` : ''}
      ${remoteErrorText ? html`<cv-callout variant="danger">${remoteErrorText}</cv-callout>` : ''}

      <div class="hint-block">
        <div class="hint-text">This desktop cannot unlock the host vault remotely. Access appears here automatically after the host opens it locally.</div>
      </div>
    </div>

    <div class="remote-actions">
      <cv-button variant="ghost" @click=${onBackFromRemoteWait}>Disconnect</cv-button>
    </div>
  `
}

export function renderWelcomeVaultContent({
  isNeedInit,
  busy,
  setupStep,
  creationP1,
  creationP2,
  passwordStrength,
  isDesktopRemoteSupported,
  remotePeers,
  remoteLoadingPeers,
  remoteRemovingPeerId,
  remoteActivePeerId,
  remoteStatusText,
  remoteErrorText,
  remoteConnectedPeerLabel,
  remotePairPhase,
  remotePairError,
  remotePairOffer,
  remotePairPin,
  remotePairDeviceLabel,
  onUnlock,
  onSelectLocalMode,
  onSelectRemoteMode,
  onBackToModeSelect,
  onOpenRemotePair,
  onBackFromRemoteConnect,
  onBackFromRemotePair,
  onBackFromRemoteWait,
  onMasterPasswordInput,
  onMasterPasswordConfirmInput,
  onCreateMasterSubmit,
  onRefreshRemotePeers,
  onConnectRemotePeer,
  onRemoveRemotePeer,
  onRemoteOfferInput,
  onRemotePinInput,
  onRemoteDeviceLabelInput,
  onSubmitRemotePair,
}: {
  isNeedInit: boolean
  busy: boolean
  setupStep: WelcomeSetupStep
  creationP1: string
  creationP2: string
  passwordStrength: PasswordFeedback
  isDesktopRemoteSupported: boolean
  remotePeers: NetworkPairedPeer[]
  remoteLoadingPeers: boolean
  remoteRemovingPeerId: string | null
  remoteActivePeerId: string | null
  remoteStatusText: string | null
  remoteErrorText: string | null
  remoteConnectedPeerLabel: string
  remotePairPhase: NetworkPairPhase
  remotePairError: string | null
  remotePairOffer: string
  remotePairPin: string
  remotePairDeviceLabel: string
  onUnlock: () => void
  onSelectLocalMode: () => void
  onSelectRemoteMode: () => void
  onBackToModeSelect: () => void
  onOpenRemotePair: () => void
  onBackFromRemoteConnect: () => void
  onBackFromRemotePair: () => void
  onBackFromRemoteWait: () => void
  onMasterPasswordInput: (event: Event) => void
  onMasterPasswordConfirmInput: (event: Event) => void
  onCreateMasterSubmit: (event: Event) => void
  onRefreshRemotePeers: () => void
  onConnectRemotePeer: (peerId: string) => void
  onRemoveRemotePeer: (peer: NetworkPairedPeer) => void
  onRemoteOfferInput: (event: Event) => void
  onRemotePinInput: (event: Event) => void
  onRemoteDeviceLabelInput: (event: Event) => void
  onSubmitRemotePair: () => void
}) {
  if (setupStep === 'remote-connect') {
    return renderRemoteConnectStep({
      isNeedInit,
      remoteLoadingPeers,
      remotePeers,
      remoteRemovingPeerId,
      remoteActivePeerId,
      remoteStatusText,
      remoteErrorText,
      onRefreshRemotePeers,
      onOpenRemotePair,
      onBackFromRemoteConnect,
      onConnectRemotePeer,
      onRemoveRemotePeer,
    })
  }

  if (setupStep === 'remote-pair') {
    return renderRemotePairStep({
      remotePairPhase,
      remotePairError,
      remotePairOffer,
      remotePairPin,
      remotePairDeviceLabel,
      onBackFromRemotePair,
      onRemoteOfferInput,
      onRemotePinInput,
      onRemoteDeviceLabelInput,
      onSubmitRemotePair,
    })
  }

  if (setupStep === 'remote-wait') {
    return renderRemoteWaitStep({
      remoteConnectedPeerLabel,
      remoteStatusText,
      remoteErrorText,
      onBackFromRemoteWait,
    })
  }

  if (!isNeedInit) {
    return html`
      <div class="welcome-actions">
        <cv-button variant="primary" ?disabled=${busy} .loading=${busy} @click=${onUnlock}>Unlock Vault</cv-button>
        ${isDesktopRemoteSupported
          ? html`<cv-button variant="ghost" ?disabled=${busy} @click=${onSelectRemoteMode}>Connect Remote</cv-button>`
          : ''}
      </div>
    `
  }

  if (setupStep === 'mode-select' || setupStep === null) {
    return html`
      <div class="mode-cards">
        <div class="mode-card mode-card-local" @click=${onSelectLocalMode}>
          <div class="mode-icon">${renderModeIcon('local')}</div>
          <div class="mode-content">
            <div class="mode-title">Local Storage</div>
            <div class="mode-desc">Data stored on this device</div>
            <div class="mode-badge">On-device only</div>
          </div>
        </div>
        <div class="mode-card mode-card-remote ${isDesktopRemoteSupported ? '' : 'disabled'}" @click=${onSelectRemoteMode}>
          <div class="mode-icon">${renderModeIcon('remote')}</div>
          <div class="mode-content">
            <div class="mode-title">Connect Remote</div>
            <div class="mode-desc">Connect to a paired iPhone whose vault is already open</div>
            <div class="mode-badge">${isDesktopRemoteSupported ? 'Paired host' : 'Desktop only'}</div>
          </div>
        </div>
      </div>
      <cv-callout variant="info">Mode can be changed later in Settings</cv-callout>
    `
  }

  return html`
    <div class="back-link" @click=${onBackToModeSelect}>
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="M19 12H5M12 19l-7-7 7-7" />
      </svg>
      Back to mode selection
    </div>

    <div class="step">
      <div class="step-title">${i18n('onboard:step:master:title')}</div>
      <div class="step-desc">${i18n('onboard:step:master:desc')}</div>

      <form class="password-form-grid" @submit=${onCreateMasterSubmit}>
        <div>
          <cv-input
            type="password"
            placeholder="Create password"
            password-toggle
            .value=${creationP1}
            @cv-input=${onMasterPasswordInput}
          ></cv-input>
          ${creationP1 ? renderEntropyMeter(passwordStrength) : ''}
        </div>

        <cv-input
          type="password"
          password-toggle
          placeholder="Confirm password"
          enterkeyhint="done"
          .value=${creationP2}
          @cv-input=${onMasterPasswordConfirmInput}
        ></cv-input>

        <cv-button variant="primary" type="submit" ?disabled=${busy} .loading=${busy}
          >Create Storage</cv-button
        >
      </form>
    </div>

    <div class="step-footer">
      <cv-callout class="master-warning" variant="warning">${i18n('onboard:master:warning')}</cv-callout>
    </div>
  `
}
