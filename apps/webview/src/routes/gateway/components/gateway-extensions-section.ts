import {html, nothing} from 'lit'
import {i18n} from 'root/i18n'

import type {PairedExtension} from '../gateway.model'

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, {month: 'short', day: 'numeric', year: 'numeric'})
}

function formatRelativeTime(ms: number): string {
  const diff = Date.now() - ms
  if (diff < 60_000) return i18n('gateway:time:just-now')
  if (diff < 3_600_000)
    return i18n('gateway:time:minutes-ago', {count: String(Math.floor(diff / 60_000))})
  if (diff < 86_400_000)
    return i18n('gateway:time:hours-ago', {count: String(Math.floor(diff / 3_600_000))})
  return formatDate(ms)
}

function renderGatewayExtensionItem({
  ext,
  onShowPolicy,
  onRevoke,
}: {
  ext: PairedExtension
  onShowPolicy: (id: string) => void
  onRevoke: (id: string) => void
}) {
  const label = ext.label || ext.id
  const shortId = ext.id.length > 16 ? ext.id.slice(0, 16) + '...' : ext.id

  return html`
    <div class="ext-item">
      <div class="ext-info">
        <div class="ext-id" title=${ext.id}>${label === ext.id ? shortId : label}</div>
        <div class="ext-meta">
          ${i18n('gateway:extensions:created')}
          : ${formatDate(ext.created_at_ms)}
          ${ext.last_active_ms != null
            ? html` &middot; ${i18n('gateway:extensions:last-active')}: ${formatRelativeTime(
                ext.last_active_ms,
              )}`
            : nothing}
        </div>
      </div>
      <div class="ext-actions">
            <cv-button size="small" variant="default" @click=${() => onShowPolicy(ext.id)}>
              ${i18n('gateway:extensions:settings')}
            </cv-button>
            <cv-button size="small" variant="default" @click=${() => onRevoke(ext.id)}>
              ${i18n('gateway:extensions:revoke')}
            </cv-button>
          </div>
        </div>
  `
}

export const renderGatewayExtensionsSection = ({
  extensions,
  onShowPolicy,
  onRevoke,
}: {
  extensions: PairedExtension[]
  onShowPolicy: (id: string) => void
  onRevoke: (id: string) => void
}) => {
  return html`
    <section class="card">
      <div class="card-header">
        <div class="card-title">
          <div class="name">${i18n('gateway:extensions:title')}</div>
          <div class="hint">${i18n('gateway:extensions:hint')}</div>
        </div>
        ${extensions.length > 0
          ? html`<span class="badge">${i18n('gateway:extensions:paired', {count: String(extensions.length)})}</span>`
          : nothing}
      </div>
      <div class="card-body">
        ${extensions.length > 0
          ? html`<div class="ext-list">
              ${extensions.map((e) => renderGatewayExtensionItem({ext: e, onShowPolicy, onRevoke}))}
            </div>`
          : html`<div class="empty-state">${i18n('gateway:extensions:empty')}</div>`}
      </div>
    </section>
  `
}
