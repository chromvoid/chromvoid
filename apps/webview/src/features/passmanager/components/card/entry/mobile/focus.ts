import type {AfterRenderScheduler} from '@chromvoid/uikit/reatom-lit'

import {markMobileKeyboardProgrammaticScroll} from 'root/shared/services/mobile-keyboard-scroll-intent'
import {releaseMobileKeyboardHold} from 'root/app/bootstrap/mobile-keyboard'
import {pmMobileDebug} from 'root/features/passmanager/models/pm-mobile-debug'
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

function roundDebugNumber(value: number): number {
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : value
}

function readElementDebug(element: HTMLElement | null): Record<string, unknown> | null {
  if (!element) return null

  const rect = element.getBoundingClientRect()
  const className = typeof element.className === 'string' ? element.className : ''

  return {
    tag: element.localName,
    name: element.getAttribute('name') ?? undefined,
    inlineField: element.getAttribute('data-inline-field') ?? undefined,
    className: className ? className.slice(0, 120) : undefined,
    top: roundDebugNumber(rect.top),
    bottom: roundDebugNumber(rect.bottom),
    height: roundDebugNumber(rect.height),
  }
}

function readViewportDebug(): Record<string, unknown> {
  const visualViewport = window.visualViewport
  const root = document.documentElement

  return {
    innerHeight: roundDebugNumber(window.innerHeight),
    rootClientHeight: roundDebugNumber(root.clientHeight),
    vvHeight: visualViewport ? roundDebugNumber(visualViewport.height) : undefined,
    vvOffsetTop: visualViewport ? roundDebugNumber(visualViewport.offsetTop) : undefined,
    keyboardExpanded: root.hasAttribute('data-mobile-keyboard-expanded'),
    documentScrollTop: roundDebugNumber((document.scrollingElement as HTMLElement | null)?.scrollTop ?? 0),
  }
}

function entryFocusDebug(event: string, details?: Record<string, unknown>): void {
  pmMobileDebug('entryFocus', event, {
    ...details,
    viewport: readViewportDebug(),
  })
}

function scrollFocusedElement(element: HTMLElement, options?: ScrollIntoViewOptions): void {
  const beforeDocumentScrollTop = (document.scrollingElement as HTMLElement | null)?.scrollTop ?? 0
  try {
    markMobileKeyboardProgrammaticScroll('entry-focus-scroll-into-view')
    element.scrollIntoView?.(options ?? {block: 'nearest', inline: 'nearest'})
    entryFocusDebug('scrollIntoView', {
      target: readElementDebug(element),
      options: options ?? {block: 'nearest', inline: 'nearest'},
      beforeDocumentScrollTop: roundDebugNumber(beforeDocumentScrollTop),
      afterDocumentScrollTop: roundDebugNumber(
        (document.scrollingElement as HTMLElement | null)?.scrollTop ?? 0,
      ),
    })
  } catch (error) {
    entryFocusDebug('scrollIntoView.error', {
      target: readElementDebug(element),
      message: error instanceof Error ? error.message : String(error),
    })
  }
}

function getViewportBlockBounds(): {top: number; bottom: number} {
  const visualViewport = window.visualViewport
  const top =
    visualViewport && Number.isFinite(visualViewport.offsetTop)
      ? Math.max(0, visualViewport.offsetTop)
      : 0
  const height =
    visualViewport && Number.isFinite(visualViewport.height) && visualViewport.height > 0
      ? visualViewport.height
      : window.innerHeight || document.documentElement.clientHeight

  return {top, bottom: top + Math.max(0, height)}
}

function isElementFullyInViewport(element: HTMLElement): boolean {
  const viewport = getViewportBlockBounds()
  if (viewport.bottom <= viewport.top) return false

  const rect = element.getBoundingClientRect()
  return rect.top >= viewport.top && rect.bottom <= viewport.bottom
}

function isFocusWithinElement(root: ShadowRoot, element: HTMLElement): boolean {
  if (root.activeElement === element) return true

  try {
    return element.matches(':focus-within')
  } catch {
    return false
  }
}

function focusElement(getShadowRoot: ShadowRootGetter, selector: string, options?: ScrollIntoViewOptions): void {
  const root = getShadowRoot()
  if (!root) {
    releaseMobileKeyboardHold('focus.missing-root')
    return
  }

  const field = root.querySelector<FocusableElement>(selector)
  if (!field) {
    entryFocusDebug('skip.missingField', {selector})
    releaseMobileKeyboardHold('focus.missing-field')
    return
  }

  const focusWithin = isFocusWithinElement(root, field)
  const fullyVisible = isElementFullyInViewport(field)
  if (focusWithin && fullyVisible) {
    entryFocusDebug('skip.alreadyFocusedVisible', {
      selector,
      field: readElementDebug(field),
    })
    releaseMobileKeyboardHold('focus.already-focused')
    return
  }

  try {
    field.focus({preventScroll: true})
    entryFocusDebug('focus.preventScroll', {
      selector,
      focusWithin,
      fullyVisible,
      field: readElementDebug(field),
    })
  } catch {
    field.focus()
    entryFocusDebug('focus.fallback', {
      selector,
      focusWithin,
      fullyVisible,
      field: readElementDebug(field),
    })
  }

  // The editor took focus from the keeper (or never needed it) — drop the
  // fallback timer so it cannot blur anything later.
  releaseMobileKeyboardHold('focus.applied')
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
