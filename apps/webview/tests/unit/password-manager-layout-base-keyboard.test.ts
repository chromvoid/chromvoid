import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {CVTextarea} from '@chromvoid/uikit'
import {resetRuntimeCapabilities, setRuntimeCapabilities} from '../../src/core/runtime/runtime-capabilities'
import {PMLayoutBase} from '../../src/features/passmanager/components/password-manager-layout/password-manager-layout-base'
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

function createKeyboardEvent(
  key: string,
  target: EventTarget,
  path: EventTarget[],
  options: Partial<Pick<KeyboardEvent, 'code' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey'>> = {},
): KeyboardEvent {
  return {
    key,
    code: options.code ?? '',
    ctrlKey: options.ctrlKey ?? false,
    metaKey: options.metaKey ?? false,
    shiftKey: options.shiftKey ?? false,
    altKey: options.altKey ?? false,
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
    resetRuntimeCapabilities()
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

  it('executes the platform create-entry shortcut through the layout action boundary', async () => {
    setRuntimeCapabilities({platform: 'macos', desktop: true})
    const layout = document.createElement('test-pm-layout') as TestPMLayout
    const createEntrySpy = vi.spyOn(pmModel, 'onCreateEntry').mockImplementation(() => {})

    const nonInteractive = document.createElement('div')
    const event = createKeyboardEvent(
      'n',
      nonInteractive,
      [nonInteractive, layout, document.body, document, window],
      {
        code: 'KeyN',
        metaKey: true,
      },
    )

    await layout.triggerGlobalKeyDown(event)

    expect(event.preventDefault).toHaveBeenCalledTimes(1)
    expect(createEntrySpy).toHaveBeenCalledTimes(1)
  })

  it('does not execute the create-entry shortcut when the target is blocked', async () => {
    setRuntimeCapabilities({platform: 'windows', desktop: true})
    const layout = document.createElement('test-pm-layout') as TestPMLayout
    const createEntrySpy = vi.spyOn(pmModel, 'onCreateEntry').mockImplementation(() => {})

    const button = document.createElement('button')
    const event = createKeyboardEvent('n', button, [button, layout, document.body, document, window], {
      code: 'KeyN',
      ctrlKey: true,
    })

    await layout.triggerGlobalKeyDown(event)

    expect(event.preventDefault).not.toHaveBeenCalled()
    expect(createEntrySpy).not.toHaveBeenCalled()
  })
})
