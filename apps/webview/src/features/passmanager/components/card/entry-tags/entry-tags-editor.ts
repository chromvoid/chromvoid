import {html} from '@chromvoid/uikit/reatom-lit'
import {nothing, type TemplateResult} from 'lit'

import {i18n} from '@project/passmanager/i18n'
import {
  credentialTagKey,
  normalizeCredentialTags,
  type CredentialTagKey,
  type CredentialTagOption,
} from '@project/passmanager/tags'

export type PMEntryTagsComboboxType = 'editable' | 'select-only'

export type PMEntryTagsEditorState = {
  tags: readonly string[]
  options: readonly CredentialTagOption[]
  comboboxType?: PMEntryTagsComboboxType
  disabled: boolean
  maxTagsVisible?: number
  placeholder?: string
}

export type PMEntryTagsEditorHandlers = {
  onSelectExistingTagIds(event: Event): void
  onManageTags(event: Event): void
}

export function getSelectedTagIdsFromEvent(event: Event): CredentialTagKey[] {
  const detail = (event as CustomEvent<{selectedIds?: unknown}>).detail
  const selectedIds = Array.isArray(detail?.selectedIds) ? detail.selectedIds : []
  return selectedIds.filter((id): id is string => typeof id === 'string').map(credentialTagKey).filter(Boolean)
}

function mergeTagOptions(tags: readonly string[], options: readonly CredentialTagOption[]): CredentialTagOption[] {
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
  const comboboxType = state.comboboxType ?? 'editable'
  const onSelectExistingTagIds = state.disabled ? undefined : handlers.onSelectExistingTagIds
  const onManageTags = state.disabled ? undefined : handlers.onManageTags

  return html`
    <div class="entry-tags-editor">
      <div class="entry-tags-picker">
        <cv-combobox
          class="entry-tags-combobox"
          multiple
          clearable
          type=${comboboxType === 'select-only' ? 'select-only' : nothing}
          max-tags-visible=${state.maxTagsVisible ?? 3}
          aria-label=${i18n('tags:title')}
          placeholder=${state.placeholder ?? i18n('tags:existing_placeholder')}
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
        <cv-button
          class="entry-tags-manage"
          type="button"
          size="small"
          variant="default"
          title=${i18n('tags:manage_open' as never)}
          aria-label=${i18n('tags:manage_open' as never)}
          ?disabled=${state.disabled}
          @click=${onManageTags}
        >
          <cv-icon name="sliders" aria-hidden="true"></cv-icon>
        </cv-button>
      </div>
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
