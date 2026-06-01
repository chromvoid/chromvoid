import {html} from '@chromvoid/uikit/reatom-lit'
import {nothing, type TemplateResult} from 'lit'

import {i18n} from '@project/passmanager/i18n'
import type {PMEntrySecretResource} from './entry-session.model'
import {renderPMCopyButton} from '../../pm-copy-button'

type PaymentCardFaceEditField = 'title' | 'cardholderName' | 'cardNumber' | 'expMonth' | 'expYear' | 'cardCvv'

type PaymentCardFaceEditOptions = {
  title?: string
  cardholderName: string
  cardNumber: string
  expMonth: string
  expYear: string
  cardCvv: string
  onInput: (event: Event) => void
  onKeyDown?: (event: KeyboardEvent) => void
  errors?: Partial<Record<PaymentCardFaceEditField, string>>
}

export type PaymentCardFaceOptions = {
  title: string
  caption?: string
  brandLabel: string
  cardholderName: string
  expiryLabel: string
  cardNumberResource: PMEntrySecretResource
  cardCvvResource: PMEntrySecretResource
  isCvvRevealed: boolean
  edit?: PaymentCardFaceEditOptions
  onEdit?: () => void
  copyCardNumberValue?: string | (() => Promise<string>)
  copyCardCvvValue?: string | (() => Promise<string>)
  onToggleCvv?: () => void
}

function formatCardNumber(value: string): string {
  const digits = value.replace(/\D+/g, '')
  if (!digits) return '•••• •••• •••• ••••'
  return digits.replace(/(.{4})/g, '$1 ').trim()
}

function formatCardholder(value: string): string {
  const normalized = value.trim()
  return normalized ? normalized.toUpperCase() : i18n('payment-card:cardholder-placeholder')
}

function renderFaceActionButton(options: {className: string; label: string; icon: string; onClick?: () => void}) {
  const {className, label, icon, onClick} = options
  if (typeof onClick !== 'function') return nothing

  return html`
    <cv-button unstyled class="${className}" type="button" @click=${onClick} aria-label=${label} title=${label}>
      <cv-icon name=${icon} aria-hidden="true"></cv-icon>
    </cv-button>
  `
}

function renderCardSecretValue(
  resource: PMEntrySecretResource,
  options: {
    className: string
    placeholder: string
    mask?: boolean
    formatter?: (value: string) => string
  },
): TemplateResult {
  if (resource.status === 'idle' || resource.status === 'loading') {
    return html`<span class="${options.className} is-loading" aria-hidden="true"></span>`
  }

  if (resource.status === 'ready' && resource.value) {
    const maskedValue = '•'.repeat(Math.max(resource.value.length, 3))
    return html`
      <span class="${options.className}${options.mask ? ' is-masked' : ''}">
        ${options.mask ? maskedValue : (options.formatter ? options.formatter(resource.value) : resource.value)}
      </span>
    `
  }

  return html`<span class="${options.className} is-placeholder">${options.placeholder}</span>`
}

function renderEditableCardInput(options: {
  field: PaymentCardFaceEditField
  name: string
  className: string
  value: string
  placeholder: string
  onInput: (event: Event) => void
  onKeyDown?: (event: KeyboardEvent) => void
  type?: 'text' | 'password'
  inputMode?: 'text' | 'numeric'
  autoComplete?: string
  maxLength?: number
  error?: string
}): TemplateResult {
  const {
    field,
    name,
    className,
    value,
    placeholder,
    onInput,
    onKeyDown,
    type = 'text',
    inputMode = 'text',
    autoComplete = 'off',
    maxLength,
    error,
  } = options

  return html`
    <input
      class="${className}${error ? ' is-invalid' : ''}"
      name=${name}
      data-payment-card-field=${field}
      .value=${value}
      placeholder=${placeholder}
      type=${type}
      inputmode=${inputMode}
      autocomplete=${autoComplete}
      aria-invalid=${error ? 'true' : nothing}
      ?spellcheck=${false}
      maxlength=${maxLength ?? nothing}
      @input=${onInput}
      @keydown=${onKeyDown}
    />
  `
}

export function renderPaymentCardFace(options: PaymentCardFaceOptions): TemplateResult {
  const {
    title,
    caption = i18n('payment-card:stored-card'),
    brandLabel,
    cardholderName,
    expiryLabel,
    cardNumberResource,
    cardCvvResource,
    isCvvRevealed,
    edit,
    onEdit,
    copyCardNumberValue,
    copyCardCvvValue,
    onToggleCvv,
  } = options
  const isEditing = !!edit
  const canToggleCvv = cardCvvResource.status === 'ready' && !!cardCvvResource.value && typeof onToggleCvv === 'function'
  const canCopyCvv = !isEditing && copyCardCvvValue !== undefined
  const canCopyCardNumber = !isEditing && copyCardNumberValue !== undefined
  const titleEdit = edit?.title

  return html`
    <div class="payment-card-face">
      <div class="payment-card-face-top">
        <div class="payment-card-issuer-block">
          <span class="payment-card-caption">${caption}</span>
          ${titleEdit !== undefined && edit
            ? renderEditableCardInput({
                field: 'title',
                name: 'payment-card-title',
                className: 'payment-card-inline-input payment-card-inline-input-title',
                value: titleEdit,
                placeholder: i18n('payment-card:untitled'),
                onInput: edit.onInput,
                onKeyDown: edit.onKeyDown,
                error: edit.errors?.title,
              })
            : html`<span class="payment-card-issuer">${title || i18n('payment-card:untitled')}</span>`}
        </div>
        <div class="payment-card-brand-cluster">
          <div class="payment-card-brand">${brandLabel}</div>
          ${!isEditing
            ? renderFaceActionButton({
                className: 'payment-card-inline-action payment-card-inline-action-edit',
                label: i18n('button:edit'),
                icon: 'pencil-square',
                onClick: onEdit,
              })
            : nothing}
        </div>
      </div>

      <div class="payment-card-chip-row">
        <div class="payment-card-chip" aria-hidden="true">
          <span class="payment-card-chip-line"></span>
          <span class="payment-card-chip-line"></span>
          <span class="payment-card-chip-line short"></span>
        </div>
        <div class="payment-card-cvv-badge">
          <div class="payment-card-cvv-head">
            <span class="payment-card-caption">CVV</span>
            <div class="payment-card-cvv-actions">
              ${canCopyCvv
                ? renderPMCopyButton({
                    className: 'payment-card-inline-copy payment-card-inline-copy-cvv',
                    appearance: 'plain',
                    size: 'small',
                    value: copyCardCvvValue,
                  })
                : nothing}
              ${canToggleCvv
                ? html`
                    <cv-button unstyled
                      class="payment-card-cvv-toggle"
                      type="button"
                      @click=${onToggleCvv}
                      aria-label=${isCvvRevealed ? i18n('button:hide') : i18n('button:show')}
                      aria-pressed=${String(isCvvRevealed)}
                      title=${isCvvRevealed ? i18n('button:hide') : i18n('button:show')}
                    >
                      <cv-icon name=${isCvvRevealed ? 'eye-off' : 'eye'} aria-hidden="true"></cv-icon>
                    </cv-button>
                  `
                : nothing}
            </div>
          </div>
          ${isEditing && edit
            ? renderEditableCardInput({
                field: 'cardCvv',
                name: 'payment-card-cvv',
                className: 'payment-card-inline-input payment-card-inline-input-cvv payment-card-cvv-value',
                value: edit.cardCvv,
                placeholder: '•••',
                type: isCvvRevealed ? 'text' : 'password',
                inputMode: 'numeric',
                autoComplete: 'cc-csc',
                maxLength: 4,
                onInput: edit.onInput,
                onKeyDown: edit.onKeyDown,
                error: edit.errors?.cardCvv,
              })
            : renderCardSecretValue(cardCvvResource, {
                className: 'payment-card-cvv-value',
                placeholder: '•••',
                mask: !isCvvRevealed,
              })}
        </div>
      </div>

      <div class="payment-card-number-block">
        <div class="payment-card-number-head">
          <span class="payment-card-caption">${i18n('payment-card:number')}</span>
          ${canCopyCardNumber
            ? renderPMCopyButton({
                className: 'payment-card-inline-copy payment-card-number-copy',
                appearance: 'plain',
                size: 'small',
                value: copyCardNumberValue,
              })
            : nothing}
        </div>
        ${isEditing && edit
          ? renderEditableCardInput({
              field: 'cardNumber',
              name: 'payment-card-number',
              className: 'payment-card-inline-input payment-card-inline-input-number payment-card-number',
              value: edit.cardNumber,
              placeholder: '0000 0000 0000 0000',
              inputMode: 'numeric',
              autoComplete: 'cc-number',
              maxLength: 23,
              onInput: edit.onInput,
              onKeyDown: edit.onKeyDown,
              error: edit.errors?.cardNumber,
            })
          : renderCardSecretValue(cardNumberResource, {
              className: 'payment-card-number',
              placeholder: '•••• •••• •••• ••••',
              formatter: formatCardNumber,
            })}
      </div>

      <div class="payment-card-face-bottom">
        <div class="payment-card-meta-block">
          <span class="payment-card-caption">${i18n('payment-card:cardholder')}</span>
          ${isEditing && edit
            ? renderEditableCardInput({
                field: 'cardholderName',
                name: 'payment-card-cardholder',
                className: 'payment-card-inline-input payment-card-inline-input-meta payment-card-meta-value',
                value: edit.cardholderName,
                placeholder: i18n('payment-card:cardholder-placeholder'),
                autoComplete: 'cc-name',
                onInput: edit.onInput,
                onKeyDown: edit.onKeyDown,
                error: edit.errors?.cardholderName,
              })
            : html`<span class="payment-card-meta-value">${formatCardholder(cardholderName)}</span>`}
        </div>
        <div class="payment-card-meta-block payment-card-meta-block-compact">
          <span class="payment-card-caption">${i18n('payment-card:expires')}</span>
          ${isEditing && edit
            ? html`
                <div class="payment-card-expiry-inputs">
                  ${renderEditableCardInput({
                    field: 'expMonth',
                    name: 'payment-card-exp-month',
                    className: 'payment-card-inline-input payment-card-inline-input-expiry payment-card-meta-value',
                    value: edit.expMonth,
                    placeholder: 'MM',
                    inputMode: 'numeric',
                    autoComplete: 'cc-exp-month',
                    maxLength: 2,
                    onInput: edit.onInput,
                    onKeyDown: edit.onKeyDown,
                    error: edit.errors?.expMonth,
                  })}
                  <span class="payment-card-expiry-separator">/</span>
                  ${renderEditableCardInput({
                    field: 'expYear',
                    name: 'payment-card-exp-year',
                    className: 'payment-card-inline-input payment-card-inline-input-expiry payment-card-meta-value',
                    value: edit.expYear,
                    placeholder: 'YYYY',
                    inputMode: 'numeric',
                    autoComplete: 'cc-exp-year',
                    maxLength: 4,
                    onInput: edit.onInput,
                    onKeyDown: edit.onKeyDown,
                    error: edit.errors?.expYear,
                  })}
                </div>
              `
            : html`<span class="payment-card-meta-value">${expiryLabel || 'MM/YY'}</span>`}
        </div>
      </div>
    </div>
  `
}
