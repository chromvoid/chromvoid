import {html, nothing} from 'lit'
import {i18n} from 'root/i18n'

import type {ActiveGrants, CapabilityPolicy} from '../gateway.model'

function formatTtl(expiresMs: number): string {
  const remaining = Math.max(0, expiresMs - Date.now())
  if (remaining <= 0) return i18n('gateway:policy:ttl-expired')
  const secs = Math.ceil(remaining / 1000)
  if (secs < 60) return i18n('gateway:policy:ttl-seconds', {count: String(secs)})
  const mins = Math.ceil(secs / 60)
  return i18n('gateway:policy:ttl-minutes', {count: String(mins)})
}

export const renderGatewayPolicySection = ({
  policy,
  grants,
  onClosePolicy,
  onToggleActionGrant,
  onToggleSiteGrant,
  onAddAllowlistOrigin,
  onRemoveAllowlistOrigin,
  onRevokeAllGrants,
}: {
  policy: CapabilityPolicy | null
  grants: ActiveGrants | null
  onClosePolicy: () => void
  onToggleActionGrant: () => void
  onToggleSiteGrant: () => void
  onAddAllowlistOrigin: (e: KeyboardEvent) => void
  onRemoveAllowlistOrigin: (origin: string) => void
  onRevokeAllGrants: () => void
}) => {
  if (!policy) return nothing

  const actionCount = grants?.action_grants.length ?? 0
  const siteCount = grants?.site_grants.length ?? 0
  const totalGrants = actionCount + siteCount
  const shortId =
    policy.extension_id.length > 16 ? policy.extension_id.slice(0, 16) + '...' : policy.extension_id

  return html`
    <section class="card">
      <div class="card-header">
        <div class="card-title">
          <div class="name">${i18n('gateway:policy:title')}</div>
          <div class="hint">${shortId}</div>
        </div>
        <cv-button size="small" variant="default" @click=${onClosePolicy}>${i18n('button:close')}</cv-button>
      </div>
      <div class="card-body">
        <div class="setting-row">
          <span class="setting-label">${i18n('gateway:policy:require-action')}</span>
          <label class="toggle">
            <input type="checkbox" .checked=${policy.require_action_grant} @change=${onToggleActionGrant} />
            <span class="toggle-track"></span>
          </label>
        </div>

        <div class="setting-row">
          <span class="setting-label">${i18n('gateway:policy:require-site')}</span>
          <label class="toggle">
            <input type="checkbox" .checked=${policy.require_site_grant} @change=${onToggleSiteGrant} />
            <span class="toggle-track"></span>
          </label>
        </div>

        <div class="policy-section">
          <div class="policy-section-title">${i18n('gateway:policy:site-allowlist')}</div>
          <div class="allowlist-editor">
            ${policy.site_allowlist.map(
              (origin) => html`
                <div class="allowlist-item">
                  <span>${origin}</span>
                  <cv-button size="small" variant="default" @click=${() => onRemoveAllowlistOrigin(origin)}>
                    ${i18n('gateway:policy:remove')}
                  </cv-button>
                </div>
              `,
            )}
            <div class="allowlist-row">
              <input
                class="allowlist-input"
                type="text"
                placeholder=${i18n('gateway:policy:allowlist-placeholder')}
                @keydown=${onAddAllowlistOrigin}
              />
            </div>
            ${policy.site_allowlist.length === 0
              ? html`<div class="empty-state empty-state-compact">${i18n('gateway:policy:all-origins')}</div>`
              : nothing}
          </div>
        </div>

        <div class="policy-section">
          <div class="setting-row">
            <span class="policy-section-title">${i18n('gateway:policy:active-grants', {count: String(totalGrants)})}</span>
            ${totalGrants > 0
              ? html`<cv-button size="small" variant="default" @click=${onRevokeAllGrants}
                  >${i18n('gateway:policy:revoke-all')}</cv-button
                >`
              : nothing}
          </div>
          ${siteCount > 0
            ? html`
                <div class="grant-list">
                  ${grants!.site_grants.map(
                    (g) => html`
                      <div class="grant-item">
                        <span class="grant-origin">${g.origin}</span>
                        <span class="grant-ttl">${formatTtl(g.expires_at_ms)}</span>
                      </div>
                    `,
                  )}
                </div>
              `
            : nothing}
          ${totalGrants === 0
            ? html`<div class="empty-state empty-state-compact">${i18n('gateway:policy:no-active-grants')}</div>`
            : nothing}
        </div>
      </div>
    </section>
  `
}
