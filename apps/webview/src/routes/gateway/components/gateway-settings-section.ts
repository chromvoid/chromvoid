import {html, nothing} from 'lit'

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
          <div class="name">Gateway Settings</div>
          <div class="hint">Control browser extension access</div>
        </div>
        <span class="badge ${enabled ? 'success' : ''}">${enabled ? 'Active' : 'Disabled'}</span>
      </div>
      <div class="card-body">
        <div class="setting-row">
          <span class="setting-label">Enable Gateway</span>
          <label class="toggle">
            <input type="checkbox" .checked=${enabled} @change=${onToggleEnabled} />
            <span class="toggle-track"></span>
          </label>
        </div>

        <div class="setting-row">
          <span class="setting-label">Access Duration</span>
          <select class="setting-select" .value=${duration} @change=${onAccessDurationChange}>
            <option value="until_vault_locked" ?selected=${duration === 'until_vault_locked'}>
              Until vault locked
            </option>
            <option value="hour_1" ?selected=${duration === 'hour_1'}>1 hour</option>
            <option value="hour_24" ?selected=${duration === 'hour_24'}>24 hours</option>
          </select>
        </div>

        <div class="setting-row">
          <span class="setting-label">Session Max Duration</span>
          <select class="setting-select" @change=${onSessionDurationChange}>
            <option value="15" ?selected=${sessionMins === 15}>15 min</option>
            <option value="30" ?selected=${sessionMins === 30}>30 min</option>
            <option value="60" ?selected=${sessionMins === 60}>60 min</option>
            <option value="120" ?selected=${sessionMins === 120}>2 hours</option>
            <option value="240" ?selected=${sessionMins === 240}>4 hours</option>
          </select>
        </div>
      </div>
    </section>
  `
}
