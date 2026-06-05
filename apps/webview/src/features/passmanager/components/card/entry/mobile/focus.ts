import type {AfterRenderScheduler} from '@chromvoid/uikit/reatom-lit'

import type {PMEntryEditFocusField, PMEntryInlineField, PMEntrySectionSnippet} from '../entry-edit.model'

type ShadowRootGetter = () => ShadowRoot | null

type FocusableElement = HTMLElement & {
  focus(options?: FocusOptions): void
}

const EDIT_FIELD_SCROLL_OPTIONS: ScrollIntoViewOptions = {
  behavior: 'smooth',
  block: 'center',
  inline: 'nearest',
}

type AvatarPickerHost = {
  readonly updateComplete: Promise<unknown>
  readonly shadowRoot: ShadowRoot | null
}

function scrollFocusedElement(element: HTMLElement, options?: ScrollIntoViewOptions): void {
  try {
    element.scrollIntoView?.(options ?? {block: 'nearest', inline: 'nearest'})
  } catch {}
}

function focusElement(getShadowRoot: ShadowRootGetter, selector: string, options?: ScrollIntoViewOptions): void {
  const field = getShadowRoot()?.querySelector<FocusableElement>(selector)
  if (!field) {
    return
  }

  try {
    field.focus({preventScroll: true})
  } catch {
    field.focus()
  }

  scrollFocusedElement(field, options)
}

export function scheduleInlineEditorFocus(
  scheduler: AfterRenderScheduler,
  getShadowRoot: ShadowRootGetter,
  inlineField: PMEntryInlineField | null,
): void {
  if (inlineField !== 'username' && inlineField !== 'password' && inlineField !== 'website') {
    return
  }

  scheduler.schedule(() => {
    focusElement(getShadowRoot, `cv-input[name="inline-${inlineField}"]`)
  })
}

export function scheduleEntryEditFieldFocus(
  scheduler: AfterRenderScheduler,
  getShadowRoot: ShadowRootGetter,
  field: PMEntryEditFocusField,
): void {
  scheduler.schedule(() => {
    focusElement(
      getShadowRoot,
      field === 'note' ? 'cv-textarea[name="inline-note"]' : `cv-input[name="inline-${field}"]`,
      EDIT_FIELD_SCROLL_OPTIONS,
    )
  })
}

export function scheduleSectionSnippetFocus(
  scheduler: AfterRenderScheduler,
  getShadowRoot: ShadowRootGetter,
  sectionSnippet: PMEntrySectionSnippet | null,
): void {
  if (sectionSnippet !== 'note' && sectionSnippet !== 'payment-card' && sectionSnippet !== 'otp' && sectionSnippet !== 'tags') {
    return
  }

  scheduler.schedule(() => {
    if (sectionSnippet === 'otp') {
      return
    }

    if (sectionSnippet === 'tags') {
      focusElement(getShadowRoot, 'cv-combobox.entry-tags-combobox', EDIT_FIELD_SCROLL_OPTIONS)
      return
    }

    focusElement(
      getShadowRoot,
      sectionSnippet === 'payment-card' ? 'input[name="payment-card-title"]' : 'cv-textarea[name="inline-note"]',
      EDIT_FIELD_SCROLL_OPTIONS,
    )
  })
}

export function openHeaderAvatarPickerAfterUpdate(host: AvatarPickerHost): void {
  void host.updateComplete.then(() => {
    const picker = host.shadowRoot?.querySelector(
      'pm-icon-picker-mobile[data-inline-picker="header-avatar"]',
    ) as (HTMLElement & {openChooser?: () => void}) | null
    picker?.openChooser?.()
  })
}
