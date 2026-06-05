import {html, nothing, type TemplateResult} from 'lit'
import {i18n} from 'root/i18n'

import type {GatewayPairingInfo, PairingPhase} from '../gateway.model'

type GatewayCalloutVariant = 'info' | 'success' | 'warning' | 'danger' | 'neutral'

function formatSeconds(secs: number): string {
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

function renderPairingCallout({
  variant,
  title,
  text,
  role,
}: {
  variant: GatewayCalloutVariant
  title?: unknown
  text: unknown
  role?: 'alert' | 'status'
}): TemplateResult {
  const content = html`
    ${title ? html`<span class="gateway-callout-title">${title}</span>` : nothing}
    <span class="gateway-callout-text">${text}</span>
  `

  return role
    ? html`<cv-callout class="gateway-callout" variant=${variant} density="compact" role=${role}>${content}</cv-callout>`
    : html`<cv-callout class="gateway-callout" variant=${variant} density="compact">${content}</cv-callout>`
}

function renderPairingBadge(phase: PairingPhase) {
  switch (phase) {
    case 'active':
      return html`<span class="badge success">${i18n('gateway:pairing:badge:awaiting')}</span>`
    case 'locked_out':
      return html`<span class="badge danger">${i18n('gateway:pairing:badge:locked')}</span>`
    case 'pin_expired':
    case 'expired':
      return html`<span class="badge warning">${i18n('gateway:pairing:badge:expired')}</span>`
    case 'error':
      return html`<span class="badge danger">${i18n('gateway:pairing:badge:error')}</span>`
    case 'starting':
      return html`<span class="badge">${i18n('gateway:pairing:badge:starting')}</span>`
    default:
      return nothing
  }
}

function renderPairingIdle(onStartPairing: () => void) {
  return html`
    <div class="pairing-actions">
      <cv-guidance-anchor anchor-id="gateway.start-pairing" surface="gateway" owner="gateway">
        <cv-button variant="primary" @click=${onStartPairing}>${i18n('gateway:pairing:start')}</cv-button>
      </cv-guidance-anchor>
    </div>
  `
}

function renderPairingStarting() {
  return renderPairingCallout({
    variant: 'info',
    text: i18n('gateway:pairing:starting'),
  })
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

    <div class="countdown ${pinWarn ? 'warn' : ''}">
      ${i18n('gateway:pairing:pin-expires', {time: formatSeconds(pinSecondsLeft)})}
    </div>

    <div class="progress-bar">
      <div
        class="progress-bar-fill ${pinSecondsLeft <= 10 ? 'danger' : pinWarn ? 'warn' : ''}"
        data-progress=${pinPercent.toFixed(1)}
      ></div>
    </div>

    <div class="countdown">${i18n('gateway:pairing:session-expires', {time: formatSeconds(tokenSecondsLeft)})}</div>

    <div class="attempts">${i18n('gateway:pairing:attempts', {remaining: String(info.attempts_left), max: '5'})}</div>

    <div class="pairing-actions">
      <cv-button variant="default" @click=${onCancelPairing}>${i18n('button:cancel')}</cv-button>
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
    ${renderPairingCallout({
      variant: 'warning',
      title: i18n('gateway:pairing:pin-expired-title'),
      text: i18n('gateway:pairing:pin-expired-text', {time: formatSeconds(tokenSecondsLeft)}),
    })}
    <div class="pairing-actions">
      <cv-button variant="default" @click=${onCancelPairing}>${i18n('button:cancel')}</cv-button>
      <cv-guidance-anchor anchor-id="gateway.start-pairing" surface="gateway" owner="gateway">
        <cv-button variant="primary" @click=${onStartPairing}>${i18n('gateway:pairing:refresh-pin')}</cv-button>
      </cv-guidance-anchor>
    </div>
  `
}

function renderPairingLockedOut({secondsLeft}: {secondsLeft: number}) {
  return renderPairingCallout({
    variant: 'danger',
    title: i18n('gateway:pairing:too-many-attempts'),
    text: i18n('gateway:pairing:try-again-in', {time: formatSeconds(secondsLeft)}),
    role: 'alert',
  })
}

function renderPairingExpired(onStartPairing: () => void) {
  return html`
    ${renderPairingCallout({
      variant: 'warning',
      title: i18n('gateway:pairing:session-expired-title'),
      text: i18n('gateway:pairing:session-expired-text'),
    })}
    <div class="pairing-actions">
      <cv-guidance-anchor anchor-id="gateway.start-pairing" surface="gateway" owner="gateway">
        <cv-button variant="primary" @click=${onStartPairing}>${i18n('gateway:pairing:start-new')}</cv-button>
      </cv-guidance-anchor>
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
    ${renderPairingCallout({
      variant: 'danger',
      title: i18n('gateway:pairing:failed'),
      text: error || i18n('gateway:pairing:unknown-error'),
      role: 'alert',
    })}
    <div class="pairing-actions">
      <cv-button variant="default" @click=${onCancelPairing}>${i18n('button:cancel')}</cv-button>
      <cv-guidance-anchor anchor-id="gateway.start-pairing" surface="gateway" owner="gateway">
        <cv-button variant="primary" @click=${onStartPairing}>${i18n('button:retry')}</cv-button>
      </cv-guidance-anchor>
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
          <div class="name">${i18n('gateway:pairing:title')}</div>
          <div class="hint">${i18n('gateway:pairing:hint')}</div>
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
