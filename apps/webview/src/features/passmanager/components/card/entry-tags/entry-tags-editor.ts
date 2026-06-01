import {html} from '@chromvoid/uikit/reatom-lit'
import {nothing, type TemplateResult} from 'lit'

import {i18n} from '@project/passmanager/i18n'
import {
  credentialTagKey,
  normalizeCredentialTags,
  type CredentialTagKey,
  type CredentialTagOption,
} from '@project/passmanager/tags'

export type PMEntryTagsEditorState = {
  tags: readonly string[]
  options: readonly CredentialTagOption[]
  inputValue: string
  disabled: boolean
  error?: string
  maxTagsVisible?: number
}

export type PMEntryTagsEditorHandlers = {
  onSelectExistingTagIds(event: Event): void
  onInputLabel(event: Event): void
  onAddTag(event: Event): void
}

export function getSelectedTagIdsFromEvent(event: Event): CredentialTagKey[] {
  const detail = (event as CustomEvent<{selectedIds?: unknown}>).detail
  const selectedIds = Array.isArray(detail?.selectedIds) ? detail.selectedIds : []
  return selectedIds.filter((id): id is string => typeof id === 'string').map(credentialTagKey).filter(Boolean)
}

export function getTagInputValueFromEvent(event: Event): string {
  const detailValue = (event as CustomEvent<{value?: string}>).detail?.value
  if (typeof detailValue === 'string') return detailValue

  const target = event.target as (HTMLInputElement & {value?: string}) | null
  return target?.value ?? ''
}

function mergeTagOptions(
  tags: readonly string[],
  options: readonly CredentialTagOption[],
): CredentialTagOption[] {
  const normalizedTags = normalizeCredentialTags(tags)
  const merged = new Map<string, CredentialTagOption>()

  for (const option of options) {
    merged.set(option.key, option)
  }

  for (const tag of normalizedTags) {
    const key = credentialTagKey(tag)
    if (!key || merged.has(key)) continue
    merged.set(key, {key, label: tag, count: 0})
  }

  return [...merged.values()]
}

export function renderEntryTagsEditor(
  state: PMEntryTagsEditorState,
  handlers: PMEntryTagsEditorHandlers,
): TemplateResult {
  const tags = normalizeCredentialTags(state.tags)
  const options = mergeTagOptions(tags, state.options)
  const value = tags.map(credentialTagKey).join(' ')
  const onSelectExistingTagIds = state.disabled ? undefined : handlers.onSelectExistingTagIds
  const onInputLabel = state.disabled ? undefined : handlers.onInputLabel
  const onAddTag = state.disabled ? undefined : handlers.onAddTag

  return html`
    <div class="entry-tags-editor">
      <cv-combobox
        class="entry-tags-combobox"
        multiple
        clearable
        max-tags-visible=${state.maxTagsVisible ?? 3}
        aria-label=${i18n('tags:title')}
        placeholder=${i18n('tags:existing_placeholder')}
        .value=${value}
        ?disabled=${state.disabled}
        aria-disabled=${state.disabled ? 'true' : nothing}
        @cv-change=${onSelectExistingTagIds}
      >
        ${options.map(
          (option) => html`
            <cv-combobox-option value=${option.key} ?disabled=${state.disabled}>
              ${option.count > 0 ? `${option.label} (${option.count})` : option.label}
            </cv-combobox-option>
          `,
        )}
      </cv-combobox>
      <form class="entry-tags-add" @submit=${onAddTag}>
        <cv-input
          type="text"
          size="small"
          name="entry-tag-input"
          autocomplete="off"
          placeholder=${i18n('tags:new_placeholder')}
          .value=${state.inputValue}
          ?disabled=${state.disabled}
          ?invalid=${Boolean(state.error)}
          @cv-input=${onInputLabel}
        >
          <span slot="label">${i18n('tags:title')}</span>
          ${state.error ? html`<span slot="help-text" class="field-error">${state.error}</span>` : nothing}
        </cv-input>
        <cv-button
          type="submit"
          size="small"
          variant="default"
          aria-label=${i18n('tags:add')}
          ?disabled=${state.disabled || !state.inputValue.trim()}
        >
          <cv-icon slot="prefix" name="plus" aria-hidden="true"></cv-icon>
          <span>${i18n('tags:add')}</span>
        </cv-button>
      </form>
    </div>
  `
}

export function renderEntryTagsReadOnly(tags: readonly string[]): TemplateResult | typeof nothing {
  const normalizedTags = normalizeCredentialTags(tags)
  if (!normalizedTags.length) return nothing

  return html`
    <div class="entry-tags-readonly" aria-label=${i18n('tags:title')}>
      ${normalizedTags.map(
        (tag) => html`
          <cv-badge class="entry-tags-chip" size="small" variant="neutral" title=${`${i18n('entry:badge:tag')}: ${tag}`}>
            <cv-icon name="tag" slot="prefix" size="xs" aria-hidden="true"></cv-icon>
            ${tag}
          </cv-badge>
        `,
      )}
    </div>
  `
}
