import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {CVTextarea} from '@chromvoid/uikit'
import {PMLayoutBase} from '../../src/features/passmanager/components/password-manager-layout-base'
import {pmModel} from '../../src/features/passmanager/password-manager.model'

class TestPMLayout extends PMLayoutBase {
  static define() {
    if (!customElements.get('test-pm-layout')) {
      customElements.define('test-pm-layout', this)
    }
  }

  protected getSearchElement() {
    return null
  }

  triggerGlobalKeyDown(event: KeyboardEvent) {
    return this.onGlobalKeyDown(event)
  }
}

type PassmanagerStub = {
  showElement: () => unknown
  searched: () => unknown[]
}

function createKeyboardEvent(key: string, target: EventTarget, path: EventTarget[]): KeyboardEvent {
  return {
    key,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    target,
    composedPath: () => path,
    preventDefault: vi.fn(),
  } as unknown as KeyboardEvent
}

describe('PMLayoutBase keyboard guards', () => {
  let previousPassmanager: typeof window.passmanager

  beforeEach(() => {
    CVTextarea.define()
    TestPMLayout.define()
    previousPassmanager = window.passmanager
  })

  afterEach(() => {
    vi.restoreAllMocks()
    window.passmanager = previousPassmanager
    document.querySelectorAll('test-pm-layout').forEach((el) => el.remove())
  })

  it('ignores Enter shortcut when focus is on interactive control', async () => {
    const layout = document.createElement('test-pm-layout') as TestPMLayout
    const openItemSpy = vi.spyOn(pmModel, 'openItem').mockImplementation(() => {})

    const firstItem = {id: 'first-entry'}
    const passmanagerStub: PassmanagerStub = {
      showElement: () => ({id: 'current-entry'}),
      searched: () => [firstItem],
    }
    window.passmanager = passmanagerStub as unknown as typeof window.passmanager

    const button = document.createElement('button')
    const event = createKeyboardEvent('Enter', button, [button, layout, document.body, document, window])

    await layout.triggerGlobalKeyDown(event)

    expect(openItemSpy).not.toHaveBeenCalled()
  })

  it('ignores Enter shortcut when focus is on cv-input host', async () => {
    const layout = document.createElement('test-pm-layout') as TestPMLayout
    const openItemSpy = vi.spyOn(pmModel, 'openItem').mockImplementation(() => {})

    const firstItem = {id: 'first-entry'}
    const passmanagerStub: PassmanagerStub = {
      showElement: () => ({id: 'current-entry'}),
      searched: () => [firstItem],
    }
    window.passmanager = passmanagerStub as unknown as typeof window.passmanager

    const cvInput = document.createElement('cv-input')
    const event = createKeyboardEvent('Enter', cvInput, [cvInput, layout, document.body, document, window])

    await layout.triggerGlobalKeyDown(event)

    expect(openItemSpy).not.toHaveBeenCalled()
  })

  it('ignores Enter shortcut when focus is on cv-textarea host', async () => {
    const layout = document.createElement('test-pm-layout') as TestPMLayout
    const openItemSpy = vi.spyOn(pmModel, 'openItem').mockImplementation(() => {})

    const firstItem = {id: 'first-entry'}
    const passmanagerStub: PassmanagerStub = {
      showElement: () => ({id: 'current-entry'}),
      searched: () => [firstItem],
    }
    window.passmanager = passmanagerStub as unknown as typeof window.passmanager

    const cvTextarea = document.createElement('cv-textarea')
    const event = createKeyboardEvent('Enter', cvTextarea, [
      cvTextarea,
      layout,
      document.body,
      document,
      window,
    ])

    await layout.triggerGlobalKeyDown(event)

    expect(openItemSpy).not.toHaveBeenCalled()
  })

  it('keeps Enter shortcut for non-interactive targets', async () => {
    const layout = document.createElement('test-pm-layout') as TestPMLayout
    const openItemSpy = vi.spyOn(pmModel, 'openItem').mockImplementation(() => {})

    const firstItem = {id: 'first-entry'}
    const passmanagerStub: PassmanagerStub = {
      showElement: () => ({id: 'current-entry'}),
      searched: () => [firstItem],
    }
    window.passmanager = passmanagerStub as unknown as typeof window.passmanager

    const nonInteractive = document.createElement('div')
    const event = createKeyboardEvent('Enter', nonInteractive, [
      nonInteractive,
      layout,
      document.body,
      document,
      window,
    ])

    await layout.triggerGlobalKeyDown(event)

    expect(openItemSpy).toHaveBeenCalledTimes(1)
    expect(openItemSpy).toHaveBeenCalledWith(firstItem)
  })
})
