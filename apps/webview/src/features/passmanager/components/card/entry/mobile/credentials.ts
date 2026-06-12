import {nothing} from 'lit'
import {html} from '@chromvoid/uikit/reatom-lit'

import {i18n} from '@project/passmanager/i18n'

import type {PMEntryMobileRenderContext} from './context'
import {renderPaymentCardFace} from '../payment-card-face'
import {renderInlineEditSubmitButtons, renderInlinePasswordGeneratorPanel, renderInlinePasswordStrength} from './shared'
import {renderPMCopyButton} from '../../../pm-copy-button'

export function renderPaymentCardPrimarySection(context: PMEntryMobileRenderContext) {
  const {card, data, model, ui} = context
  const cardPanResource = model.state.cardPanResource()
  const cardCvvResource = model.state.cardCvvResource()
  const isEditing = model.sectionSnippet() === 'payment-card'
  const draftExpiryLabel =
    model.paymentCardExpMonthDraft() && model.paymentCardExpYearDraft()
      ? `${model.paymentCardExpMonthDraft().padStart(2, '0')}/${model.paymentCardExpYearDraft().slice(-2)}`
      : data.paymentCardExpiryLabel

  if (isEditing) {
    return html`
      <form
        class="payment-card-form-stack"
        @submit=${(event: Event) => {
          event.preventDefault()
          ui.handleSavePaymentCard()
        }}
      >
        <section
          class="section-block section-block-primary payment-card-surface"
          aria-label=${i18n('entry:type:payment_card')}
          @keydown=${ui.handleSectionSnippetKeyDown}
        >
          ${renderPaymentCardFace({
            title: card.title,
            brandLabel: data.paymentCardBrandLabel,
            cardholderName: model.paymentCardholderNameDraft(),
            expiryLabel: draftExpiryLabel,
            cardNumberResource: {
              status: model.paymentCardNumberDraft().trim() ? 'ready' : 'missing',
              value: model.paymentCardNumberDraft(),
            },
            cardCvvResource: {
              status: model.paymentCardCvvDraft().trim() ? 'ready' : 'missing',
              value: model.paymentCardCvvDraft(),
            },
            isCvvRevealed: model.state.isCardCvvRevealed(),
            edit: {
              title: model.paymentCardTitleDraft(),
              cardholderName: model.paymentCardholderNameDraft(),
              cardNumber: model.paymentCardNumberDraft(),
              expMonth: model.paymentCardExpMonthDraft(),
              expYear: model.paymentCardExpYearDraft(),
              cardCvv: model.paymentCardCvvDraft(),
              onInput: ui.handlePaymentCardInput,
              onKeyDown: ui.handleSectionSnippetKeyDown,
            },
            onToggleCvv: () => ui.handleToggleCardCvv(),
          })}
        </section>
        ${model.paymentCardError() ? html`<div class="error-text">${model.paymentCardError()}</div>` : null}
        ${renderInlineEditSubmitButtons(() => model.closeSectionSnippet())}
      </form>
    `
  }

  return html`
    <section class="section-block section-block-primary payment-card-surface" aria-label=${i18n('entry:type:payment_card')}>
      ${renderPaymentCardFace({
        title: card.title,
        brandLabel: data.paymentCardBrandLabel,
        cardholderName: data.paymentCardholderName,
        expiryLabel: data.paymentCardExpiryLabel,
        cardNumberResource: cardPanResource,
        cardCvvResource,
        isCvvRevealed: model.state.isCardCvvRevealed(),
        onEdit: data.canEditPaymentCard ? () => model.beginPaymentCardEdit(card) : undefined,
        copyCardNumberValue: cardPanResource.status === 'ready' ? cardPanResource.value : undefined,
        copyCardCvvValue:
          cardCvvResource.status === 'ready' && cardCvvResource.value ? cardCvvResource.value : undefined,
        onToggleCvv: () => ui.handleToggleCardCvv(),
      })}
    </section>
  `
}

export function renderMobileUsernameField(context: PMEntryMobileRenderContext) {
  if (context.card.entryType === 'payment_card') {
    return html``
  }

  const {card, data, model, ui} = context

  return html`
    <div class="credential-field">
      ${data.canEditFields && data.isEditingEntry
        ? html`
            <div class="field-content inline-editor">
              <cv-input
                class="inline-field-input"
                name="inline-username"
                data-inline-field="username"
                .value=${model.inlineUsername()}
                @cv-input=${ui.handleInlineEditInput}
                @keydown=${ui.handleInlineEditorKeyDown}
                size="small"
              >
                <span slot="label">${i18n('username')}</span>
              </cv-input>
            </div>
          `
        : html`
            <div
              class="field-content ${data.canEditFields ? 'credential-edit-gesture-target' : ''}"
              data-credential-edit-field=${data.canEditFields ? 'username' : nothing}
              @pointerdown=${data.canEditFields
                ? (event: PointerEvent) => ui.handleCredentialTapStart(event, 'username')
                : undefined}
              @pointermove=${data.canEditFields ? ui.handleCredentialTapMove : undefined}
              @pointerup=${data.canEditFields ? ui.handleCredentialTapEnd : undefined}
              @pointercancel=${data.canEditFields ? ui.handleCredentialTapCancel : undefined}
              @dblclick=${data.canEditFields
                ? (event: MouseEvent) => ui.handleCredentialDoubleTap(event, 'username')
                : undefined}
            >
              <span class="field-label">${i18n('username')}</span>
              <span
                class="field-value ${card.username ? '' : 'empty'}"
                data-credential-edit-value=${data.canEditFields ? 'username' : nothing}
              >
                ${data.username}
              </span>
            </div>
            <div class="field-actions">
              ${card.username ? renderPMCopyButton({value: card.username, size: 'small'}) : null}
            </div>
          `}
    </div>
  `
}

export function renderMobilePasswordField(context: PMEntryMobileRenderContext) {
  if (context.card.entryType === 'payment_card') {
    return html``
  }

  const {card, data, model, ui} = context
  const passwordResource = model.state.passwordResource()
  const isLoading = passwordResource.status === 'idle' || passwordResource.status === 'loading'
  const isReady = passwordResource.status === 'ready'

  return html`
    <div class="credential-field credential-field-primary">
      ${data.canEditFields && data.isEditingEntry
        ? html`
            <div class="field-content inline-editor">
              <div class="password-inline-stack">
                <cv-input
                  class="inline-field-input"
                  type="password"
                  password-toggle
                  name="inline-password"
                  data-inline-field="password"
                  .value=${model.inlinePassword()}
                  @cv-input=${ui.handleInlineEditInput}
                  @keydown=${ui.handleInlineEditorKeyDown}
                  size="small"
                >
                  <span slot="label">${i18n('password')}</span>
                </cv-input>
                <div class="password-inline-tools">
                  <cv-button unstyled
                    class="generator-toggle-button"
                    type="button"
                    aria-label=${i18n('password:generator_settings')}
                    aria-pressed=${String(model.inlinePasswordGeneratorOpen())}
                    title=${i18n('password:generator_settings')}
                    @click=${() => model.toggleInlinePasswordGenerator()}
                  >
                    <cv-icon name="gear" aria-hidden="true"></cv-icon>
                  </cv-button>
                  <cv-button
                    class="generate-action-button"
                    type="button"
                    variant="primary"
                    size="small"
                    @click=${() => model.generateInlinePassword()}
                  >
                    <cv-icon slot="prefix" name="arrow-clockwise" aria-hidden="true"></cv-icon>
                    <span>${i18n('button:generate')}</span>
                  </cv-button>
                </div>
                ${renderInlinePasswordStrength(model)}
                ${renderInlinePasswordGeneratorPanel(model, ui.handleInlinePasswordLengthInput)}
              </div>
            </div>
          `
        : html`
            <div
              class="field-content ${data.canEditFields ? 'credential-edit-gesture-target' : ''}"
              data-credential-edit-field=${data.canEditFields ? 'password' : nothing}
              @pointerdown=${data.canEditFields
                ? (event: PointerEvent) => ui.handleCredentialTapStart(event, 'password')
                : undefined}
              @pointermove=${data.canEditFields ? ui.handleCredentialTapMove : undefined}
              @pointerup=${data.canEditFields ? ui.handleCredentialTapEnd : undefined}
              @pointercancel=${data.canEditFields ? ui.handleCredentialTapCancel : undefined}
              @dblclick=${data.canEditFields
                ? (event: MouseEvent) => ui.handleCredentialDoubleTap(event, 'password')
                : undefined}
            >
              <span class="field-label">${i18n('password')}</span>
              ${isLoading
                ? html`
                    <div class="note-skeleton secret-skeleton" role="status" aria-label=${i18n('loading')}>
                      <div class="skeleton-line"></div>
                    </div>
                  `
                : isReady
                  ? html`
                      <cv-input
                        class="password-input"
                        type="password"
                        password-toggle
                        readonly
                        data-credential-edit-value=${data.canEditFields ? 'password' : nothing}
                        .value=${passwordResource.value}
                        size="small"
                      ></cv-input>
                    `
                  : html`
                      <span
                        class="field-value ${passwordResource.status === 'error' ? 'error' : 'empty'}"
                        data-credential-edit-value=${data.canEditFields ? 'password' : nothing}
                      >
                        ${passwordResource.status === 'error' ? i18n('entry:secret:unavailable') : '—'}
                      </span>
                    `}
            </div>
            <div class="field-actions">
              ${isReady ? renderPMCopyButton({value: passwordResource.value, size: 'small'}) : null}
            </div>
          `}
    </div>
  `
}

export function renderEditEntryAction(context: PMEntryMobileRenderContext) {
  const {data, model, ui} = context
  if (data.isReadOnly) {
    return html``
  }

  if (data.isEditingEntry) {
    return html`
      <mobile-bottom-action-footer
        class="entry-action-footer"
        columns="2"
        ?has-message=${Boolean(model.inlineError())}
      >
        ${model.inlineError()
          ? html`<div class="entry-edit-error" slot="message" role="alert">${model.inlineError()}</div>`
          : null}
        <cv-button
          unstyled
          class="entry-edit-cancel-action"
          type="button"
          variant="default"
          size="large"
          @click=${ui.handleCancelEntryEdit}
        >
          ${i18n('button:cancel')}
        </cv-button>
        <cv-button
          unstyled
          class="entry-edit-save-action"
          type="button"
          variant="default"
          size="large"
          preset="action-primary-subtle"
          ?disabled=${model.inlineSaving()}
          .loading=${model.inlineSaving()}
          @click=${ui.handleSaveEntryEdit}
        >
          ${i18n('button:save')}
        </cv-button>
      </mobile-bottom-action-footer>
    `
  }

  if (data.hasActiveEditorSurface) {
    return html``
  }

  return html`
    <mobile-bottom-action-footer class="entry-action-footer">
      <cv-button
        unstyled
        class="entry-edit-entry-action"
        type="button"
        variant="default"
        size="large"
        preset="action-primary-subtle"
        @click=${ui.handleStartEdit}
      >
        <cv-icon slot="prefix" name="pencil-square" aria-hidden="true"></cv-icon>
        <span>${i18n('entry:edit_entry')}</span>
      </cv-button>
    </mobile-bottom-action-footer>
  `
}
