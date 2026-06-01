import {nothing} from 'lit'
import {html} from '@chromvoid/uikit/reatom-lit'

import {i18n} from '@project/passmanager/i18n'

import type {PMEntryMobileRenderContext} from './context'

export function renderQuickActions(context: PMEntryMobileRenderContext) {
  const {card, data, model, ui} = context
  const passwordResource = model.state.passwordResource()
  const canCopyUsername = card.username.trim().length > 0
  const canCopyPassword = passwordResource.status === 'ready'
  const canOpenWebsite = data.visibleUrls.some((url) => url.openable)

  return html`
    <section class="quick-actions" aria-label=${i18n('entry:quick_actions')}>
      <cv-button unstyled
        class="quick-action"
        type="button"
        ?disabled=${!canCopyUsername}
        @click=${ui.handleQuickCopyUsername}
      >
        <cv-icon slot="prefix" name="person-circle" aria-hidden="true"></cv-icon>
        <span>${i18n('button:copy-username')}</span>
      </cv-button>
      <cv-button unstyled
        class="quick-action"
        type="button"
        ?disabled=${!canCopyPassword}
        @click=${ui.handleQuickCopyPassword}
      >
        <cv-icon slot="prefix" name="key" aria-hidden="true"></cv-icon>
        <span>${i18n('button:copy-password')}</span>
      </cv-button>
      <cv-button unstyled
        class="quick-action"
        type="button"
        ?disabled=${!canOpenWebsite}
        @click=${ui.handleOpenFirstUrl}
      >
        <cv-icon slot="prefix" name="globe" aria-hidden="true"></cv-icon>
        <span>${i18n('entry:quick_action_open_website')}</span>
      </cv-button>
    </section>
  `
}

export function renderEntryViewAddActions(context: PMEntryMobileRenderContext) {
  const {data, model, ui} = context
  if (data.isEditingEntry) return nothing
  if (!data.canAddMissingOtpInEntryView && !data.canAddMissingSshInEntryView) return nothing

  return html`
    <section class="entry-view-add-actions" aria-label=${i18n('entry:additional_information')}>
      ${data.canAddMissingOtpInEntryView
        ? html`
            <cv-button
              unstyled
              class="entry-view-add-action"
              type="button"
              data-entry-view-add-action="otp"
              ?disabled=${model.otpSaving()}
              @click=${ui.handleAddMissingOtpInEntryView}
            >
              <cv-icon slot="prefix" name="shield-check" aria-hidden="true"></cv-icon>
              <span>${i18n('otp:add')}</span>
            </cv-button>
          `
        : nothing}
      ${data.canAddMissingSshInEntryView
        ? html`
            <cv-button
              unstyled
              class="entry-view-add-action"
              type="button"
              data-entry-view-add-action="ssh"
              ?disabled=${model.sshGenerating()}
              @click=${ui.handleAddMissingSshInEntryView}
            >
              <cv-icon slot="prefix" name="key" aria-hidden="true"></cv-icon>
              <span>${i18n('ssh:add')}</span>
            </cv-button>
          `
        : nothing}
    </section>
  `
}
