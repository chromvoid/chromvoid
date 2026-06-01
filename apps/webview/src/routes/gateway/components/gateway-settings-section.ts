import {html, nothing} from 'lit'
import {i18n} from 'root/i18n'

import type {GatewayConfig} from '../gateway.model'

export const renderGatewaySettingsSection = ({
  cfg,
  onToggleEnabled,
  onAccessDurationChange,
  onSessionDurationChange,
}: {
  cfg: GatewayConfig | null
  onToggleEnabled: () => void
  onAccessDurationChange: (event: Event) => void
  onSessionDurationChange: (event: Event) => void
}) => {
  if (!cfg) return nothing

  const enabled = cfg.enabled
  const duration = cfg.access_duration
  const sessionMins = cfg.session_max_duration_mins

  return html`
    <section class="card">
        <div class="card-header">
          <div class="card-title">
            <div class="name">${i18n('gateway:settings:title')}</div>
            <div class="hint">${i18n('gateway:settings:hint')}</div>
          </div>
            <span class="badge ${enabled ? 'success' : ''}"
              >${enabled ? i18n('gateway:status:active') : i18n('gateway:status:disabled')}</span
            >
        </div>
        <div class="card-body">
          <div class="setting-row">
          <span class="setting-label">${i18n('gateway:settings:enable')}</span>
          <label class="toggle">
            <input type="checkbox" .checked=${enabled} @change=${onToggleEnabled} />
            <span class="toggle-track"></span>
          </label>
        </div>

          <div class="setting-row">
          <span class="setting-label">${i18n('gateway:settings:access-duration')}</span>
          <select class="setting-select" .value=${duration} @change=${onAccessDurationChange}>
            <option value="until_vault_locked" ?selected=${duration === 'until_vault_locked'}>
              ${i18n('gateway:settings:duration:until-vault-locked')}
            </option>
            <option value="hour_1" ?selected=${duration === 'hour_1'}>
              ${i18n('gateway:settings:duration:hours', {value: '1'})}
            </option>
            <option value="hour_24" ?selected=${duration === 'hour_24'}>
              ${i18n('gateway:settings:duration:hours', {value: '24'})}
            </option>
          </select>
        </div>

        <div class="setting-row">
          <span class="setting-label">${i18n('gateway:settings:session-duration')}</span>
          <select class="setting-select" @change=${onSessionDurationChange}>
            <option value="15" ?selected=${sessionMins === 15}>
              ${i18n('gateway:settings:duration:minutes', {value: '15'})}
            </option>
            <option value="30" ?selected=${sessionMins === 30}>
              ${i18n('gateway:settings:duration:minutes', {value: '30'})}
            </option>
            <option value="60" ?selected=${sessionMins === 60}>
              ${i18n('gateway:settings:duration:minutes', {value: '60'})}
            </option>
            <option value="120" ?selected=${sessionMins === 120}>
              ${i18n('gateway:settings:duration:minutes', {value: '120'})}
            </option>
            <option value="240" ?selected=${sessionMins === 240}>
              ${i18n('gateway:settings:duration:minutes', {value: '240'})}
            </option>
          </select>
        </div>
      </div>
    </section>
  `
}
