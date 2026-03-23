import {html, nothing} from 'lit'

import type {GatewayPairingInfo, PairingPhase} from '../gateway.model'

function formatSeconds(secs: number): string {
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

function renderPairingBadge(phase: PairingPhase) {
  switch (phase) {
    case 'active':
      return html`<span class="badge success">Awaiting connection</span>`
    case 'locked_out':
      return html`<span class="badge danger">Locked</span>`
    case 'pin_expired':
    case 'expired':
      return html`<span class="badge warning">Expired</span>`
    case 'error':
      return html`<span class="badge danger">Error</span>`
    case 'starting':
      return html`<span class="badge">Starting...</span>`
    default:
      return nothing
  }
}

function renderPairingIdle(onStartPairing: () => void) {
  return html`
    <div class="pairing-actions">
      <cv-button variant="primary" @click=${onStartPairing}>Start Pairing</cv-button>
    </div>
  `
}

function renderPairingStarting() {
  return html`
    <div class="hint-block info">
      <div class="hint-text">Starting pairing session...</div>
    </div>
  `
}

function renderPairingActive({
  info,
  pinSecondsLeft,
  tokenSecondsLeft,
  onCancelPairing,
}: {
  info: GatewayPairingInfo
  pinSecondsLeft: number
  tokenSecondsLeft: number
  onCancelPairing: () => void
}) {
  const pinWarn = pinSecondsLeft <= 30
  const pinTotal =
    info.pin_expires_at_ms -
    (info.pairing_expires_at_ms - (info.pairing_expires_at_ms - info.pin_expires_at_ms))
  const pinElapsed = pinTotal > 0 ? pinTotal - pinSecondsLeft * 1000 : 0
  const pinPercent = pinTotal > 0 ? Math.max(0, Math.min(100, ((pinTotal - pinElapsed) / pinTotal) * 100)) : 0

  return html`
    <div class="pin-display">${info.pin.split('').map((d) => html`<div class="pin-digit">${d}</div>`)}</div>

    <div class="countdown ${pinWarn ? 'warn' : ''}">PIN expires in ${formatSeconds(pinSecondsLeft)}</div>

    <div class="progress-bar">
      <div
        class="progress-bar-fill ${pinSecondsLeft <= 10 ? 'danger' : pinWarn ? 'warn' : ''}"
        style="width: ${pinPercent}%"
      ></div>
    </div>

    <div class="countdown">Session expires in ${formatSeconds(tokenSecondsLeft)}</div>

    <div class="attempts">Attempts: ${info.attempts_left}/5 remaining</div>

    <div class="pairing-actions">
      <cv-button variant="default" @click=${onCancelPairing}>Cancel Pairing</cv-button>
    </div>
  `
}

function renderPairingPinExpired({
  tokenSecondsLeft,
  onCancelPairing,
  onStartPairing,
}: {
  tokenSecondsLeft: number
  onCancelPairing: () => void
  onStartPairing: () => void
}) {
  return html`
    <div class="hint-block">
      <div class="hint-title">PIN expired</div>
      <div class="hint-text">
        The PIN has expired. Session still active for ${formatSeconds(tokenSecondsLeft)}.
      </div>
    </div>
    <div class="pairing-actions">
      <cv-button variant="default" @click=${onCancelPairing}>Cancel</cv-button>
      <cv-button variant="primary" @click=${onStartPairing}>Refresh PIN</cv-button>
    </div>
  `
}

function renderPairingLockedOut({secondsLeft}: {secondsLeft: number}) {
  return html`
    <div class="hint-block danger">
      <div class="hint-title">Too many failed attempts</div>
      <div class="hint-text">Try again in ${formatSeconds(secondsLeft)}</div>
    </div>
  `
}

function renderPairingExpired(onStartPairing: () => void) {
  return html`
    <div class="hint-block">
      <div class="hint-title">Pairing session expired</div>
      <div class="hint-text">The pairing session has ended. Start a new one to continue.</div>
    </div>
    <div class="pairing-actions">
      <cv-button variant="primary" @click=${onStartPairing}>Start New Pairing</cv-button>
    </div>
  `
}

function renderPairingError({
  error,
  onCancelPairing,
  onStartPairing,
}: {
  error: string | null
  onCancelPairing: () => void
  onStartPairing: () => void
}) {
  return html`
    <div class="hint-block danger">
      <div class="hint-title">Pairing failed</div>
      <div class="hint-text">${error || 'Unknown error'}</div>
    </div>
    <div class="pairing-actions">
      <cv-button variant="default" @click=${onCancelPairing}>Dismiss</cv-button>
      <cv-button variant="primary" @click=${onStartPairing}>Retry</cv-button>
    </div>
  `
}

function renderPairingContent({
  phase,
  info,
  pinSecondsLeft,
  tokenSecondsLeft,
  error,
  onStartPairing,
  onCancelPairing,
}: {
  phase: PairingPhase
  info: GatewayPairingInfo | null
  pinSecondsLeft: number
  tokenSecondsLeft: number
  error: string | null
  onStartPairing: () => void
  onCancelPairing: () => void
}) {
  switch (phase) {
    case 'idle':
      return renderPairingIdle(onStartPairing)
    case 'starting':
      return renderPairingStarting()
    case 'active':
      return info ? renderPairingActive({info, pinSecondsLeft, tokenSecondsLeft, onCancelPairing}) : nothing
    case 'pin_expired':
      return renderPairingPinExpired({tokenSecondsLeft, onCancelPairing, onStartPairing})
    case 'locked_out':
      return renderPairingLockedOut({secondsLeft: pinSecondsLeft})
    case 'expired':
      return renderPairingExpired(onStartPairing)
    case 'error':
      return renderPairingError({error, onCancelPairing, onStartPairing})
    default:
      return nothing
  }
}

export const renderGatewayPairingSection = ({
  phase,
  info,
  pinSecondsLeft,
  tokenSecondsLeft,
  error,
  onStartPairing,
  onCancelPairing,
}: {
  phase: PairingPhase
  info: GatewayPairingInfo | null
  pinSecondsLeft: number
  tokenSecondsLeft: number
  error: string | null
  onStartPairing: () => void
  onCancelPairing: () => void
}) => {
  return html`
    <section class="card">
      <div class="card-header">
        <div class="card-title">
          <div class="name">Pair New Extension</div>
          <div class="hint">Connect a browser extension to this vault</div>
        </div>
        ${renderPairingBadge(phase)}
      </div>
      <div class="card-body">
        ${renderPairingContent({
          phase,
          info,
          pinSecondsLeft,
          tokenSecondsLeft,
          error,
          onStartPairing,
          onCancelPairing,
        })}
      </div>
    </section>
  `
}
