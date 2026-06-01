import {nothing} from 'lit'
import {html} from '@chromvoid/uikit/reatom-lit'

import {Entry} from '@project/passmanager/core'
import {i18n} from '@project/passmanager/i18n'

import type {PMEntryEditData} from '../entry-edit.model'
import type {PMEntryMobileRenderContext} from './context'

export function renderHeaderBadges(data: PMEntryEditData) {
  return html`
    <div class="entry-meta-badges">
      <cv-badge size="small" variant="neutral">
        <cv-icon name="lock" slot="prefix" size="xs"></cv-icon>
        ${i18n('entry:badge:encrypted')}
      </cv-badge>
      ${data.entryType === 'payment_card'
        ? html`
            <cv-badge size="small" variant="primary">
              <cv-icon name="credit-card" slot="prefix" size="xs"></cv-icon>
              ${data.paymentCardBrandLabel}
            </cv-badge>
            ${data.paymentCardLast4
              ? html`
                  <cv-badge size="small" variant="neutral">
                    <cv-icon name="123" slot="prefix" size="xs"></cv-icon>
                    •••• ${data.paymentCardLast4}
                  </cv-badge>
                `
              : nothing}
          `
        : nothing}
      ${data.entryType === 'login' && data.hasOtps
        ? html`
            <cv-badge size="small" variant="success">
              <cv-icon name="shield-check" slot="prefix" size="xs"></cv-icon>
              ${i18n('entry:badge:two_factor_enabled')}
            </cv-badge>
          `
        : nothing}
      ${data.entryType === 'login' && data.hasSshKeys
        ? html`
            <cv-badge size="small" variant="warning">
              <cv-icon name="key" slot="prefix" size="xs"></cv-icon>
              ${i18n('ssh:short')}
            </cv-badge>
          `
        : nothing}
      ${data.entryType === 'login' && data.websiteCount > 1
        ? html`
            <cv-badge size="small" variant="neutral">
              <cv-icon name="globe" slot="prefix" size="xs"></cv-icon>
              ${data.websiteCount}
            </cv-badge>
          `
        : nothing}
    </div>
  `
}

export function renderHeaderMeta(card: Entry) {
  const hasUpdated = card.updatedFormatted.trim() !== ''
  const hasCreated = card.createdFormatted.trim() !== ''

  if (!hasUpdated && !hasCreated) return nothing

  return html`
    <div class="entry-meta-inline">
      ${hasUpdated
        ? html`
            <div class="entry-meta-item">
              <span class="entry-meta-label">${i18n('ts:modified')}</span>
              <time class="entry-meta-value" datetime=${String(card.updatedTs)}>${card.updatedFormatted}</time>
            </div>
          `
        : nothing}
      ${hasCreated
        ? html`
            <div class="entry-meta-item">
              <span class="entry-meta-label">${i18n('ts:created')}</span>
              <time class="entry-meta-value" datetime=${String(card.createdTs)}>${card.createdFormatted}</time>
            </div>
          `
        : nothing}
    </div>
  `
}

export function renderHeaderIdentity(context: PMEntryMobileRenderContext) {
  const {card, data, model, ui} = context
  const canEditIdentity = data.canEditFields && data.isEditingEntry
  const canEditAvatar = canEditIdentity
  const inlineError = model.inlineError()

  return html`
    <div class="entry-header-identity">
      ${canEditAvatar
        ? html`
            <cv-button unstyled
              class="entry-header-avatar-trigger"
              type="button"
              @click=${ui.handleHeaderAvatarAction}
              aria-label=${i18n('button:edit')}
            >
              ${renderHeaderAvatar(card, data, canEditIdentity ? model.inlineIconRef() : undefined, true)}
            </cv-button>
          `
        : html`<div class="entry-header-avatar-static">${renderHeaderAvatar(card, data, undefined, false)}</div>`}
      ${canEditAvatar
        ? html`
            <pm-icon-picker-mobile
              class="entry-header-avatar-picker-dialog"
              data-inline-picker="header-avatar"
              dialog-only
              .iconRef=${canEditIdentity ? model.inlineIconRef() : card.iconRef}
              @pm-icon-change=${ui.handleInlineIconChange}
            ></pm-icon-picker-mobile>
          `
        : nothing}
      <div class="entry-title-block ${canEditIdentity ? 'entry-title-block-editing' : ''}">
        ${canEditIdentity
          ? html`
              <cv-input
                class="inline-field-input entry-title-input"
                name="inline-title"
                data-inline-field="title"
                .value=${model.inlineTitle()}
                placeholder=${i18n('title_or_url:placeholder')}
                aria-label=${i18n('title')}
                @cv-input=${ui.handleInlineEditInput}
                @keydown=${ui.handleInlineEditorKeyDown}
                ?data-has-error=${!!inlineError && !model.inlineTitle().trim()}
                size="small"
              ></cv-input>
            `
          : html`
            <div
              class="entry-title-row ${data.canEditFields ? 'entry-title-gesture-target' : ''}"
              data-entry-title-edit-field=${data.canEditFields ? 'title' : nothing}
              @pointerdown=${data.canEditFields ? ui.handleTitleEntryTapStart : undefined}
              @pointermove=${data.canEditFields ? ui.handleTitleEntryTapMove : undefined}
              @pointerup=${data.canEditFields ? ui.handleTitleEntryTapEnd : undefined}
              @pointercancel=${data.canEditFields ? ui.handleTitleEntryTapCancel : undefined}
              @dblclick=${data.canEditFields ? ui.handleTitleEntryDoubleTap : undefined}
            >
              <h1 class="entry-title">${data.title}</h1>
            </div>
          `}
        <div class="entry-header-aside">${renderHeaderBadges(data)}</div>
        ${renderHeaderMeta(card)}
      </div>
    </div>
  `
}

function renderHeaderAvatar(card: Entry, data: PMEntryEditData, iconRef: string | undefined, editable: boolean) {
  return html`
    <div class="entry-header-avatar-wrap">
      <pm-avatar-icon
        class="entry-header-avatar"
        .item=${card}
        .letter=${data.entryAvatarLetter}
        .iconRef=${iconRef}
        .fallbackBg=${data.avatarBg}
      ></pm-avatar-icon>
      ${editable
        ? html`
            <span class="entry-header-avatar-decoration" aria-hidden="true">
              <cv-icon name="pencil-square" size="s"></cv-icon>
            </span>
          `
        : nothing}
    </div>
  `
}
