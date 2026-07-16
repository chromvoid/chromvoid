import {CVInput, CVRadio, CVRadioGroup, CVTextarea} from '@chromvoid/uikit'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {navigationModel} from '../../src/app/navigation/navigation.model'
import type {NavigationBlocker, NavigationBlockerIntent} from '../../src/app/navigation/navigation.types'
import {PMEntryCreateMobile} from '../../src/features/passmanager/components/card/entry-create/entry-create-mobile'
import {setPassmanagerRoot} from '../../src/features/passmanager/models/pm-root.adapter'
import {transientBackModel, type TransientBackHandler} from '../../src/shared/services/transient-back.model'

function installRoot() {
  setPassmanagerRoot({
    id: 'root',
    name: 'Vault',
    entriesList: vi.fn(() => []),
    getEntry: vi.fn(() => undefined),
    getGroup: vi.fn(() => undefined),
    setShowElement: vi.fn(),
    showElement: vi.fn(() => 'createEntry'),
    isReadOnly: vi.fn(() => false),
  } as never)
}

async function settle(component: PMEntryCreateMobile): Promise<void> {
  await component.updateComplete
  await Promise.resolve()
  await component.updateComplete
}

const leaveCreateIntent: NavigationBlockerIntent = {
  kind: 'surface-change',
  current: {
    surface: 'passwords',
    passwords: {kind: 'create-entry'},
    overlay: {kind: 'none'},
  },
  next: {
    surface: 'files',
    files: {path: '/'},
    overlay: {kind: 'none'},
  },
  historyMode: 'push',
}

describe('PMEntryCreateMobile navigation guard', () => {
  let blocker: NavigationBlocker | undefined
  let transientBack: TransientBackHandler | undefined
  let unregisterBlocker: ReturnType<typeof vi.fn>
  let unregisterTransientBack: ReturnType<typeof vi.fn>

  beforeEach(() => {
    installRoot()
    CVInput.define()
    CVRadio.define()
    CVRadioGroup.define()
    CVTextarea.define()
    PMEntryCreateMobile.define()

    unregisterBlocker = vi.fn()
    unregisterTransientBack = vi.fn()
    vi.spyOn(navigationModel, 'registerNavigationBlocker').mockImplementation((callback) => {
      blocker = callback
      return unregisterBlocker
    })
    vi.spyOn(transientBackModel, 'register').mockImplementation((handler) => {
      transientBack = handler
      return unregisterTransientBack
    })
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback: FrameRequestCallback) => {
      callback(0)
      return 1
    })
  })

  afterEach(() => {
    document.body.innerHTML = ''
    setPassmanagerRoot(undefined)
    vi.restoreAllMocks()
    blocker = undefined
    transientBack = undefined
  })

  it('lets a clean draft leave and guards a dirty draft with Cancel and Discard', async () => {
    const component = document.createElement('pm-entry-create-mobile') as PMEntryCreateMobile
    document.body.append(component)
    await settle(component)
    const model = (component as PMEntryCreateMobile & {
      model: {
        title(): string
        dirty(): boolean
        discardSheetOpen(): boolean
        setTitle(value: string): void
        cancelDiscard(): void
        confirmDiscard(): void
      }
    }).model
    const resume = vi.fn()

    expect(blocker?.(leaveCreateIntent, resume)).toBe(false)

    model.setTitle('Unsaved login')
    expect(blocker?.(leaveCreateIntent, resume)).toBe(true)
    expect(model.discardSheetOpen()).toBe(true)

    model.cancelDiscard()
    expect(model.title()).toBe('Unsaved login')
    expect(model.dirty()).toBe(true)
    expect(resume).not.toHaveBeenCalled()

    expect(blocker?.(leaveCreateIntent, resume)).toBe(true)
    model.confirmDiscard()
    expect(resume).toHaveBeenCalledTimes(1)
    expect(model.dirty()).toBe(false)
  })

  it('does not guard navigation that remains on Create Entry', async () => {
    const component = document.createElement('pm-entry-create-mobile') as PMEntryCreateMobile
    document.body.append(component)
    await settle(component)
    const model = (component as PMEntryCreateMobile & {model: {setTitle(value: string): void}}).model
    model.setTitle('Draft')

    const sameCreateIntent: NavigationBlockerIntent = {
      ...leaveCreateIntent,
      next: {
        surface: 'passwords',
        passwords: {kind: 'create-entry', targetGroupPath: 'Work'},
        overlay: {kind: 'none'},
      },
    }
    expect(blocker?.(sameCreateIntent, vi.fn())).toBe(false)
  })

  it('consumes Back from a detail editor to the hub before closing the sheet', async () => {
    const component = document.createElement('pm-entry-create-mobile') as PMEntryCreateMobile
    document.body.append(component)
    await settle(component)
    const model = (component as PMEntryCreateMobile & {
      model: {
        detailsSheetOpen(): boolean
        detailsSheetView(): 'hub' | 'note'
        openDetailsSheet(): void
        openDetailsEditor(detail: 'note'): void
      }
    }).model

    model.openDetailsSheet()
    model.openDetailsEditor('note')
    expect(model.detailsSheetOpen()).toBe(true)
    expect(model.detailsSheetView()).toBe('note')

    expect(transientBack?.()).toBe(true)
    expect(model.detailsSheetOpen()).toBe(true)
    expect(model.detailsSheetView()).toBe('hub')

    expect(transientBack?.()).toBe(true)
    expect(model.detailsSheetOpen()).toBe(false)
    expect(transientBack?.()).toBe(false)
  })

  it('unregisters both navigation hooks on unmount', async () => {
    const component = document.createElement('pm-entry-create-mobile') as PMEntryCreateMobile
    document.body.append(component)
    await settle(component)

    component.remove()

    expect(unregisterBlocker).toHaveBeenCalledTimes(1)
    expect(unregisterTransientBack).toHaveBeenCalledTimes(1)
  })
})
