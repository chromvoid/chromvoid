import {nothing} from 'lit'
import {html} from '@chromvoid/uikit/reatom-lit'

import {i18n} from '@project/passmanager/i18n'

import type {PMEntryEditModel, PMEntryInlineField, PMEntryMobilePasswordCharset} from '../entry-edit.model'

export function renderHeaderTitleEditAction(onClick: () => void) {
  return html`
    <cv-button unstyled class="entry-title-edit-action edit-icon-action" type="button" @click=${onClick} aria-label=${i18n(
      'button:edit',
    )}>
      <cv-icon name="pencil-square" size="s" aria-hidden="true"></cv-icon>
    </cv-button>
  `
}

export function renderInlineEditAction(
  field: PMEntryInlineField,
  label: string,
  onClick: () => void,
) {
  return html`
    <cv-button unstyled
      class="inline-action edit-icon-action"
      type="button"
      data-inline-field=${field}
      @click=${onClick}
      aria-label=${label}
    >
      <cv-icon name="pencil-square" aria-hidden="true"></cv-icon>
    </cv-button>
  `
}

export function renderNoteEditAction(onClick: () => void) {
  return html`
    <cv-button unstyled class="inline-action edit-icon-action note-edit-action" type="button" @click=${onClick} aria-label=${i18n(
      'button:edit',
    )}>
      <cv-icon name="pencil-square" aria-hidden="true"></cv-icon>
    </cv-button>
  `
}

export function renderInlineEditButtons(options: {onCancel: () => void; onSave: () => void; saving: boolean}) {
  const {onCancel, onSave, saving} = options

  return html`
    <div class="inline-edit-actions">
      <cv-button class="inline-edit-cancel" type="button" variant="default" size="small" @click=${onCancel}>
        ${i18n('button:cancel')}
      </cv-button>
      <cv-button class="inline-edit-save" type="button" variant="primary" size="small" ?disabled=${saving} @click=${onSave}>
        ${i18n('button:save')}
      </cv-button>
    </div>
  `
}

export function renderInlineEditSubmitButtons(onCancel: () => void) {
  return html`
    <div class="inline-edit-actions">
      <cv-button class="inline-edit-cancel" type="button" variant="default" size="small" @click=${onCancel}>
        ${i18n('button:cancel')}
      </cv-button>
      <cv-button class="inline-edit-save" type="submit" variant="primary" size="small">${i18n('button:save')}</cv-button>
    </div>
  `
}

export function renderInlinePasswordStrength(model: PMEntryEditModel) {
  const score = model.inlinePasswordStrengthScore()
  if (score === null) return nothing

  return html`
    <div class="inline-password-strength" aria-label=${i18n('password:strength_indicator')}>
      <div class="strength-bar">
        <div class="strength-track">
          <div class="strength-fill strength-${score}"></div>
        </div>
        <span class="strength-label strength-${score}">${model.inlinePasswordStrengthLabel()}</span>
      </div>
    </div>
  `
}

function renderInlinePasswordCharsetButton(
  charset: PMEntryMobilePasswordCharset,
  label: string,
  pressed: boolean,
  onToggle: () => void,
) {
  return html`
    <cv-button unstyled
      class="generator-option"
      type="button"
      data-charset=${charset}
      aria-pressed=${String(pressed)}
      @click=${onToggle}
    >
      ${label}
    </cv-button>
  `
}

export function renderInlinePasswordGeneratorPanel(
  model: PMEntryEditModel,
  onLengthInput: (event: Event) => void,
) {
  if (!model.inlinePasswordGeneratorOpen()) return nothing

  return html`
    <div class="password-generator-panel">
      <cv-input
        class="generator-length-input"
        type="number"
        min="4"
        max="128"
        step="1"
        .value=${String(model.inlinePasswordGenLength())}
        @cv-input=${onLengthInput}
        size="small"
      >
        <span slot="label">${i18n('password:length')}</span>
      </cv-input>
      <div class="generator-options" role="group" aria-label=${i18n('password:generator_settings')}>
        ${renderInlinePasswordCharsetButton('lowercase', 'a-z', model.inlinePasswordGenLowercase(), () =>
          model.toggleInlinePasswordCharset('lowercase'))}
        ${renderInlinePasswordCharsetButton('uppercase', 'A-Z', model.inlinePasswordGenUppercase(), () =>
          model.toggleInlinePasswordCharset('uppercase'))}
        ${renderInlinePasswordCharsetButton('digits', '0-9', model.inlinePasswordGenDigits(), () =>
          model.toggleInlinePasswordCharset('digits'))}
        ${renderInlinePasswordCharsetButton('symbols', '!@#', model.inlinePasswordGenSymbols(), () =>
          model.toggleInlinePasswordCharset('symbols'))}
      </div>
    </div>
  `
}

export function renderSectionSnippetButtons(options: {
  onCancel: () => void
  onSave: () => void
  saving: boolean
}) {
  const {onCancel, onSave, saving} = options

  return html`
    <div class="inline-edit-actions">
      <cv-button class="inline-edit-cancel" type="button" variant="default" size="small" @click=${onCancel}>
        ${i18n('button:cancel')}
      </cv-button>
      <cv-button class="inline-edit-save" type="button" variant="primary" size="small" ?disabled=${saving} @click=${onSave}>
        ${i18n('button:save')}
      </cv-button>
    </div>
  `
}

export function renderNoteSubmitButtons(options: {onCancel: () => void; saving: boolean}) {
  const {onCancel, saving} = options

  return html`
    <div class="inline-edit-actions">
      <cv-button class="inline-edit-cancel" type="button" variant="default" size="small" @click=${onCancel}>
        ${i18n('button:cancel')}
      </cv-button>
      <cv-button class="inline-edit-save" type="submit" variant="primary" size="small" ?disabled=${saving}>
        ${i18n('button:save')}
      </cv-button>
    </div>
  `
}
