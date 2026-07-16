import {html} from '@chromvoid/uikit/reatom-lit'
import {nothing, type TemplateResult} from 'lit'

import {i18n} from 'root/i18n'

type CredentialProviderCapabilityModel = {
  showsMacosOtpCapabilities(): boolean
  macosOneTimeCodeAutofillStatusState(): 'selected' | 'missing' | 'unknown'
  macosOneTimeCodeAutofillStatusLabel(): string
  macosVerificationCodeSetupStatus(): 'available' | 'unverified'
  macosVerificationCodeSetupStatusLabel(): string
}

export function renderMacosCredentialProviderCapabilities(
  model: CredentialProviderCapabilityModel,
  statusClass: 'provider-status-pill' | 'status-pill',
): TemplateResult | typeof nothing {
  if (!model.showsMacosOtpCapabilities()) return nothing

  return html`
    <div class="provider-capabilities" role="list">
      <div class="provider-capability" role="listitem">
        <p class="provider-capability-title">${i18n('settings:provider-otp-title')}</p>
        <span class=${statusClass} data-state=${model.macosOneTimeCodeAutofillStatusState()} role="status">
          <span class="provider-status-dot status-dot" aria-hidden="true"></span>
          ${model.macosOneTimeCodeAutofillStatusLabel()}
        </span>
      </div>
      <div class="provider-capability" role="listitem">
        <p class="provider-capability-title">${i18n('settings:provider-setup-title')}</p>
        <span
          class=${statusClass}
          data-state=${model.macosVerificationCodeSetupStatus() === 'available' ? 'selected' : 'unknown'}
          role="status"
        >
          <span class="provider-status-dot status-dot" aria-hidden="true"></span>
          ${model.macosVerificationCodeSetupStatusLabel()}
        </span>
      </div>
    </div>
    <p class="provider-note">${i18n('settings:provider-macos-multi-provider-note')}</p>
  `
}
