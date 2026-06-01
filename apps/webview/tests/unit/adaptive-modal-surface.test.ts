import {atom} from '@reatom/core'
import type {CVBottomSheet} from '@chromvoid/uikit/components/cv-bottom-sheet'
import type {CVDialog} from '@chromvoid/uikit/components/cv-dialog'
import {afterEach, describe, expect, it, vi} from 'vitest'

import {AdaptiveModalSurface} from '../../src/shared/ui/adaptive-modal-surface'
import {clearAppContext, createMockAppContext, initAppContext} from '../../src/shared/services/app-context'

let layoutMode: ReturnType<typeof atom<'mobile' | 'desktop'>>

function stylesToText(styles: unknown): string {
  const values = Array.isArray(styles) ? styles : [styles]
  return values
    .map((value) => {
      if (value == null) return ''
      return typeof value === 'object' && 'cssText' in (value as object)
        ? String((value as {cssText: string}).cssText)
        : String(value)
    })
    .join('\n')
}

function setupContext(mode: 'mobile' | 'desktop') {
  layoutMode = atom<'mobile' | 'desktop'>(mode)
  initAppContext(
    createMockAppContext({
      store: {
        layoutMode,
      } as any,
    }),
  )
}

async function settle(element: AdaptiveModalSurface): Promise<void> {
  await element.updateComplete
  await Promise.resolve()
  await element.updateComplete
}

async function createSurface(mode: 'mobile' | 'desktop', props?: Partial<AdaptiveModalSurface>) {
  setupContext(mode)
  AdaptiveModalSurface.define()
  const element = document.createElement('adaptive-modal-surface') as AdaptiveModalSurface
  Object.assign(element, props)
  document.body.append(element)
  await settle(element)
  return element
}

afterEach(() => {
  document.body.innerHTML = ''
  clearAppContext()
  vi.clearAllMocks()
})

describe('adaptive-modal-surface', () => {
  it('owns app-level dialog and bottom sheet defaults', () => {
    const cssText = stylesToText(AdaptiveModalSurface.styles)

    expect(cssText).toContain('--adaptive-modal-z-index: calc(var(--cv-z-overlay, 300) + 20);')
    expect(cssText).toContain('--adaptive-modal-overlay-color: var(--cv-color-overlay);')
    expect(cssText).toContain('--adaptive-modal-width: min(720px, calc(100vw - 32px));')
    expect(cssText).toContain('--adaptive-modal-max-height: min(720px, calc(100dvh - 32px));')
    expect(cssText).toContain('--adaptive-modal-sheet-width: 100%;')
    expect(cssText).toContain('--adaptive-modal-sheet-max-width: 100%;')
    expect(cssText).toContain('--adaptive-modal-sheet-max-height: min(82dvh, calc(100dvh - 32px));')
    expect(cssText).toContain(
      '--adaptive-modal-sheet-border-radius: var(--cv-radius-4) var(--cv-radius-4) 0 0;',
    )
    expect(cssText).toContain('--adaptive-modal-sheet-grabber-color: var(--cv-color-border-strong);')
    expect(cssText).toContain('--cv-dialog-width: var(--adaptive-modal-width);')
    expect(cssText).toContain('--cv-bottom-sheet-max-width: var(--adaptive-modal-sheet-max-width);')
  })

  it('renders a bottom sheet on mobile and forwards sheet props and slots', async () => {
    const element = await createSurface('mobile', {
      open: true,
      noHeader: true,
      showHandle: false,
      dragToClose: false,
      detents: 'middle expanded',
      detent: 'middle',
      handleLabel: 'Resize picker',
      closable: false,
      initialFocusId: 'primary-action',
      ariaLabel: 'Audio player',
    })
    const body = document.createElement('p')
    body.textContent = 'Body'
    element.append(body)
    await settle(element)

    const sheet = element.shadowRoot?.querySelector('cv-bottom-sheet') as CVBottomSheet | null

    expect(sheet).not.toBeNull()
    expect(element.shadowRoot?.querySelector('cv-dialog')).toBeNull()
    expect(sheet?.open).toBe(true)
    expect(sheet?.noHeader).toBe(true)
    expect(sheet?.closable).toBe(false)
    expect(sheet?.showHandle).toBe(false)
    expect(sheet?.dragToClose).toBe(false)
    expect(sheet?.detents).toBe('middle expanded')
    expect(sheet?.detent).toBe('middle')
    expect(sheet?.handleLabel).toBe('Resize picker')
    expect(sheet?.initialFocusId).toBe('primary-action')
    expect(sheet?.querySelector('slot[name="title"][slot="title"]')?.textContent).toBe('Audio player')
    expect(sheet?.querySelector('slot:not([name])')).not.toBeNull()
  })

  it('keeps user-driven sheet detent changes as the surface rerenders', async () => {
    const element = await createSurface('mobile', {
      open: true,
      detents: 'middle expanded',
      detent: 'middle',
    })
    const sheet = element.shadowRoot?.querySelector('cv-bottom-sheet') as CVBottomSheet

    sheet.dispatchEvent(
      new CustomEvent('cv-change', {
        detail: {open: true, detent: 'expanded'},
        bubbles: true,
        composed: true,
      }),
    )
    await settle(element)

    expect(element.detent).toBe('expanded')
    expect(sheet.detent).toBe('expanded')
  })

  it('renders a dialog on desktop and forwards dialog props', async () => {
    const element = await createSurface('desktop', {
      open: true,
      type: 'alertdialog',
      closeOnEscape: false,
      closeOnOutsidePointer: false,
      closeOnOutsideFocus: false,
      closable: false,
      noHeader: true,
    })

    const dialog = element.shadowRoot?.querySelector('cv-dialog') as CVDialog | null

    expect(dialog).not.toBeNull()
    expect(element.shadowRoot?.querySelector('cv-bottom-sheet')).toBeNull()
    expect(dialog?.open).toBe(true)
    expect(dialog?.type).toBe('alertdialog')
    expect(dialog?.closeOnEscape).toBe(false)
    expect(dialog?.closeOnOutsidePointer).toBe(false)
    expect(dialog?.closeOnOutsideFocus).toBe(false)
    expect(dialog?.closable).toBe(false)
    expect(dialog?.noHeader).toBe(true)
  })

  it('falls back to desktop dialog when app context is not initialized', async () => {
    AdaptiveModalSurface.define()
    const element = document.createElement('adaptive-modal-surface') as AdaptiveModalSurface
    element.open = true
    document.body.append(element)
    await settle(element)

    expect(element.shadowRoot?.querySelector('cv-dialog')).not.toBeNull()
    expect(element.shadowRoot?.querySelector('cv-bottom-sheet')).toBeNull()
  })

  it('emits close only when the underlying surface commits closed state', async () => {
    const element = await createSurface('mobile', {open: true})
    const close = vi.fn()
    const sheet = element.shadowRoot?.querySelector('cv-bottom-sheet') as CVBottomSheet
    element.addEventListener('close', close)

    sheet.dispatchEvent(new CustomEvent('cv-change', {detail: {open: true}, bubbles: true, composed: true}))
    sheet.dispatchEvent(new CustomEvent('cv-change', {detail: {value: 42}, bubbles: true, composed: true}))
    sheet.dispatchEvent(new CustomEvent('cv-change', {detail: {open: false}, bubbles: true, composed: true}))

    expect(close).toHaveBeenCalledTimes(1)
  })

  it('reacts to layout mode changes from the app context store', async () => {
    const element = await createSurface('mobile', {open: true})

    expect(element.shadowRoot?.querySelector('cv-bottom-sheet')).not.toBeNull()

    layoutMode.set('desktop')
    await settle(element)

    expect(element.shadowRoot?.querySelector('cv-dialog')).not.toBeNull()
    expect(element.shadowRoot?.querySelector('cv-bottom-sheet')).toBeNull()
  })
})
