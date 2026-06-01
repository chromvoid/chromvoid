import {afterEach, describe, expect, it, vi} from 'vitest'
import {atom} from '@reatom/core'

import {PMIconPicker} from '../../src/features/passmanager/components/pm-icon-picker'
import {PMIconPickerMobile} from '../../src/features/passmanager/components/pm-icon-picker.mobile'
import {PMIconPickerModel} from '../../src/features/passmanager/components/pm-icon-picker.model'
import {pmIconStore} from '../../src/features/passmanager/models/pm-icon-store'
import {clearAppContext, createMockAppContext, initAppContext} from '../../src/shared/services/app-context'

let desktopDefined = false
let mobileDefined = false

function ensureDesktopDefined() {
  if (desktopDefined) return
  PMIconPicker.define()
  desktopDefined = true
}

function ensureMobileDefined() {
  if (mobileDefined) return
  PMIconPickerMobile.define()
  mobileDefined = true
}

function setupLayout(mode: 'mobile' | 'desktop') {
  initAppContext(
    createMockAppContext({
      store: {
        layoutMode: atom<'mobile' | 'desktop'>(mode),
      } as any,
    }),
  )
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve
    reject = promiseReject
  })
  return {promise, resolve, reject}
}

describe('PMIconPicker', () => {
  afterEach(() => {
    document.querySelectorAll('pm-icon-picker').forEach((el) => el.remove())
    document.querySelectorAll('pm-icon-picker-mobile').forEach((el) => el.remove())
    clearAppContext()
    vi.restoreAllMocks()
  })

  it('renders saved icons and emits pm-icon-change on selection', async () => {
    setupLayout('desktop')
    ensureDesktopDefined()
    const iconRef = `sha256:${'a'.repeat(64)}`
    const listIconsSpy = vi.spyOn(pmIconStore, 'listIcons').mockResolvedValue([
      {
        iconRef,
        mimeType: 'image/png',
        width: 64,
        height: 64,
        bytes: 1024,
        createdAt: 1,
        updatedAt: 2,
      },
    ])

    const picker = document.createElement(PMIconPicker.elementName) as PMIconPicker
    const onChange = vi.fn()
    picker.addEventListener('pm-icon-change', onChange as EventListener)
    document.body.appendChild(picker)

    await Promise.resolve()
    await picker.updateComplete
    await Promise.resolve()
    await picker.updateComplete

    expect(listIconsSpy).toHaveBeenCalledTimes(1)

    expect(picker.shadowRoot?.querySelector('.icon-row')).toBeNull()

    const trigger = picker.shadowRoot?.querySelector('.icon-trigger') as HTMLButtonElement | null
    expect(trigger).not.toBeNull()
    expect(trigger?.classList.contains('icon-trigger--with-label')).toBe(false)
    expect(picker.shadowRoot?.querySelector('.icon-trigger-label')).toBeNull()

    trigger?.click()
    await Promise.resolve()
    await picker.updateComplete
    await Promise.resolve()
    await picker.updateComplete

    const surface = picker.shadowRoot?.querySelector('adaptive-modal-surface') as {open?: boolean} | null
    expect(surface?.open).toBe(true)
    expect(
      (surface as HTMLElement & {shadowRoot?: ShadowRoot})?.shadowRoot?.querySelector('cv-dialog'),
    ).not.toBeNull()

    const selectButton = picker.shadowRoot?.querySelector('.dialog-library-item') as HTMLButtonElement | null
    expect(selectButton).not.toBeNull()

    selectButton?.click()

    expect(onChange).toHaveBeenCalledTimes(1)
    const event = onChange.mock.calls[0]?.[0] as CustomEvent<{iconRef: string | undefined}>
    expect(event.detail.iconRef).toBe(iconRef)
  })

  it('renders an optional trigger label in the mobile picker without changing chooser behavior', async () => {
    setupLayout('mobile')
    ensureMobileDefined()
    const iconRef = `sha256:${'e'.repeat(64)}`
    vi.spyOn(pmIconStore, 'listIcons').mockResolvedValue([
      {
        iconRef,
        mimeType: 'image/png',
        width: 64,
        height: 64,
        bytes: 1024,
        createdAt: 1,
        updatedAt: 2,
      },
    ])

    const picker = document.createElement(PMIconPickerMobile.elementName) as PMIconPickerMobile
    picker.triggerLabel = ' Choose image '

    const onChange = vi.fn()
    picker.addEventListener('pm-icon-change', onChange as EventListener)
    document.body.appendChild(picker)

    await Promise.resolve()
    await picker.updateComplete
    await Promise.resolve()
    await picker.updateComplete

    const trigger = picker.shadowRoot?.querySelector('.icon-trigger') as HTMLButtonElement | null
    expect(trigger).not.toBeNull()
    expect(trigger?.classList.contains('icon-trigger--with-label')).toBe(true)
    expect(picker.shadowRoot?.querySelector('.icon-trigger-label')?.textContent).toBe('Choose image')

    trigger?.click()
    await Promise.resolve()
    await picker.updateComplete
    await Promise.resolve()
    await picker.updateComplete

    const surface = picker.shadowRoot?.querySelector('adaptive-modal-surface') as {open?: boolean} | null
    expect(surface?.open).toBe(true)
    expect(
      (surface as HTMLElement & {shadowRoot?: ShadowRoot})?.shadowRoot?.querySelector('cv-bottom-sheet'),
    ).not.toBeNull()

    const selectButton = picker.shadowRoot?.querySelector('.dialog-library-item') as HTMLButtonElement | null
    expect(selectButton).not.toBeNull()

    selectButton?.click()

    expect(onChange).toHaveBeenCalledTimes(1)
    const event = onChange.mock.calls[0]?.[0] as CustomEvent<{iconRef: string | undefined}>
    expect(event.detail.iconRef).toBe(iconRef)
  })

  it('supports dialog-only mode in the mobile picker and opens the chooser programmatically', async () => {
    setupLayout('mobile')
    ensureMobileDefined()
    const iconRef = `sha256:${'b'.repeat(64)}`
    vi.spyOn(pmIconStore, 'listIcons').mockResolvedValue([
      {
        iconRef,
        mimeType: 'image/png',
        width: 64,
        height: 64,
        bytes: 1024,
        createdAt: 1,
        updatedAt: 2,
      },
    ])

    const picker = document.createElement(PMIconPickerMobile.elementName) as PMIconPickerMobile
    picker.dialogOnly = true

    const onChange = vi.fn()
    picker.addEventListener('pm-icon-change', onChange as EventListener)
    document.body.appendChild(picker)

    await Promise.resolve()
    await picker.updateComplete
    await Promise.resolve()
    await picker.updateComplete

    expect(picker.shadowRoot?.querySelector('.icon-trigger')).toBeNull()

    picker.openChooser()
    await Promise.resolve()
    await picker.updateComplete
    await Promise.resolve()
    await picker.updateComplete

    const surface = picker.shadowRoot?.querySelector('adaptive-modal-surface') as {open?: boolean} | null
    expect(surface?.open).toBe(true)
    expect(
      (surface as HTMLElement & {shadowRoot?: ShadowRoot})?.shadowRoot?.querySelector('cv-bottom-sheet'),
    ).not.toBeNull()

    const selectButton = picker.shadowRoot?.querySelector('.dialog-library-item') as HTMLButtonElement | null
    expect(selectButton).not.toBeNull()

    selectButton?.click()

    expect(onChange).toHaveBeenCalledTimes(1)
    const event = onChange.mock.calls[0]?.[0] as CustomEvent<{iconRef: string | undefined}>
    expect(event.detail.iconRef).toBe(iconRef)
  })

  it('keeps mobile dialog-only reset behavior when a current icon is present', async () => {
    setupLayout('mobile')
    ensureMobileDefined()
    const iconRef = `sha256:${'f'.repeat(64)}`
    vi.spyOn(pmIconStore, 'listIcons').mockResolvedValue([
      {
        iconRef,
        mimeType: 'image/png',
        width: 64,
        height: 64,
        bytes: 1024,
        createdAt: 1,
        updatedAt: 2,
      },
    ])

    const picker = document.createElement(PMIconPickerMobile.elementName) as PMIconPickerMobile
    picker.dialogOnly = true
    picker.iconRef = iconRef

    const onChange = vi.fn()
    picker.addEventListener('pm-icon-change', onChange as EventListener)
    document.body.appendChild(picker)

    await Promise.resolve()
    await picker.updateComplete
    await Promise.resolve()
    await picker.updateComplete

    expect(picker.shadowRoot?.querySelector('.icon-trigger')).toBeNull()

    picker.openChooser()
    await Promise.resolve()
    await picker.updateComplete
    await Promise.resolve()
    await picker.updateComplete

    const resetButton = picker.shadowRoot?.querySelectorAll('.dialog-actions cv-button').item(1) as HTMLElement | null
    expect(resetButton).not.toBeNull()

    resetButton?.click()
    await Promise.resolve()
    await picker.updateComplete

    expect(onChange).toHaveBeenCalledTimes(1)
    const event = onChange.mock.calls[0]?.[0] as CustomEvent<{iconRef: string | undefined}>
    expect(event.detail.iconRef).toBeUndefined()
    const surface = picker.shadowRoot?.querySelector('adaptive-modal-surface') as {open?: boolean} | null
    expect(surface?.open).toBe(false)
  })

  it('does not mutate the icon source directly when an icon is selected', async () => {
    ensureDesktopDefined()
    const iconRef = `sha256:${'c'.repeat(64)}`
    vi.spyOn(pmIconStore, 'listIcons').mockResolvedValue([
      {
        iconRef,
        mimeType: 'image/png',
        width: 64,
        height: 64,
        bytes: 1024,
        createdAt: 1,
        updatedAt: 2,
      },
    ])

    const externalIconRef = atom<string | undefined>(undefined)
    const picker = document.createElement(PMIconPicker.elementName) as PMIconPicker
    picker.iconRef = externalIconRef

    const onChange = vi.fn()
    picker.addEventListener('pm-icon-change', onChange as EventListener)
    document.body.appendChild(picker)

    await Promise.resolve()
    await picker.updateComplete
    await Promise.resolve()
    await picker.updateComplete

    const trigger = picker.shadowRoot?.querySelector('.icon-trigger') as HTMLButtonElement | null
    trigger?.click()
    await Promise.resolve()
    await picker.updateComplete

    const selectButton = picker.shadowRoot?.querySelector('.dialog-library-item') as HTMLButtonElement | null
    selectButton?.click()

    expect(externalIconRef()).toBeUndefined()
    expect(onChange).toHaveBeenCalledTimes(1)
    const event = onChange.mock.calls[0]?.[0] as CustomEvent<{iconRef: string | undefined}>
    expect(event.detail.iconRef).toBe(iconRef)
  })

  it('shows upload progress while a custom icon upload is pending', async () => {
    setupLayout('mobile')
    ensureMobileDefined()
    const deferred = createDeferred<string>()
    const iconRef = `sha256:${'d'.repeat(64)}`
    vi.spyOn(pmIconStore, 'listIcons').mockResolvedValue([])
    vi.spyOn(pmIconStore, 'uploadIcon').mockImplementation(async (_file, options) => {
      options?.onPhase?.('uploading')
      return deferred.promise
    })

    const picker = document.createElement(PMIconPickerMobile.elementName) as PMIconPickerMobile
    picker.dialogOnly = true
    document.body.appendChild(picker)

    await Promise.resolve()
    await picker.updateComplete
    await Promise.resolve()
    await picker.updateComplete

    picker.openChooser()
    await Promise.resolve()
    await picker.updateComplete

    const input = picker.shadowRoot?.querySelector('#icon-file') as HTMLInputElement | null
    expect(input).not.toBeNull()
    Object.defineProperty(input, 'files', {
      configurable: true,
      value: [new File(['icon'], 'vault-icon.png', {type: 'image/png'})],
    })
    input!.dispatchEvent(new Event('change', {bubbles: true}))

    await Promise.resolve()
    await picker.updateComplete

    expect(picker.shadowRoot?.querySelector('.dialog-upload-progress')).not.toBeNull()
    expect(picker.shadowRoot?.querySelector('.dialog-body')?.getAttribute('aria-busy')).toBe('true')
    expect(picker.shadowRoot?.querySelector('cv-button[loading]')).not.toBeNull()

    deferred.resolve(iconRef)
    await new Promise((resolve) => window.setTimeout(resolve, 0))
    await Promise.resolve()
    await picker.updateComplete

    expect(picker.shadowRoot?.querySelector('.dialog-upload-progress')).toBeNull()
    expect(picker.shadowRoot?.querySelector('.dialog-body')?.getAttribute('aria-busy')).toBe('false')
  })

  it('ignores stale saved-icon loads after disconnect', async () => {
    const deferred = createDeferred<Awaited<ReturnType<typeof pmIconStore.listIcons>>>()
    const listIconsSpy = vi.spyOn(pmIconStore, 'listIcons').mockReturnValue(deferred.promise)
    const model = new PMIconPickerModel()

    model.connect()
    expect(listIconsSpy).toHaveBeenCalledTimes(1)
    expect(model.isLoadingIcons()).toBe(true)

    model.disconnect()
    deferred.resolve([
      {
        iconRef: `sha256:${'f'.repeat(64)}`,
        mimeType: 'image/png',
        width: 64,
        height: 64,
        bytes: 1024,
        createdAt: 1,
        updatedAt: 2,
      },
    ])
    await Promise.resolve()
    await Promise.resolve()

    expect(model.isLoadingIcons()).toBe(false)
    expect(model.storedIcons()).toEqual([])
  })
})
