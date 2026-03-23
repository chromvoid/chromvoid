import {beforeEach, afterEach, describe, expect, it, vi} from 'vitest'

import {CVInput, CVTextarea} from '@chromvoid/uikit'
import {PMEntryCreateBase} from '../../src/features/passmanager/components/card/entry-create/entry-create-base'
import {PMEntryCreateMobile} from '../../src/features/passmanager/components/card/entry-create/entry-create-mobile'

class TestEntryCreate extends PMEntryCreateBase {
  static define() {
    if (!customElements.get('test-entry-create')) {
      customElements.define('test-entry-create', this)
    }
  }

  onSubmitSpy = vi.fn()

  protected override onSubmit(e: Event) {
    e.preventDefault()
    this.onSubmitSpy()
  }
}

class TestEntryCreateMobileScroll extends PMEntryCreateMobile {
  static define() {
    if (!customElements.get('test-entry-create-mobile-scroll')) {
      customElements.define('test-entry-create-mobile-scroll', this)
    }
  }

  focusCalls: boolean[] = []

  protected override focusTitleInput(preventScroll = false) {
    this.focusCalls.push(preventScroll)
  }
}

const settle = async () => {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

describe('PMEntryCreateBase form submit behavior', () => {
  let previousPassmanager: typeof window.passmanager

  beforeEach(() => {
    vi.restoreAllMocks()
    previousPassmanager = window.passmanager
    window.passmanager = {
      isReadOnly: vi.fn(() => false),
    } as unknown as typeof window.passmanager
    CVInput.define()
    CVTextarea.define()
    TestEntryCreate.define()
    TestEntryCreateMobileScroll.define()
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback: FrameRequestCallback) => {
      callback(0)
      return 1
    })
  })

  afterEach(() => {
    document.body.innerHTML = ''
    window.passmanager = previousPassmanager
  })

  it('submits form when Enter is pressed inside cv-input', async () => {
    const component = document.createElement('test-entry-create') as TestEntryCreate
    document.body.append(component)
    await settle()

    const form = component.shadowRoot?.querySelector('form')
    expect(form).toBeInstanceOf(HTMLFormElement)

    const requestSubmitSpy = vi.spyOn(form!, 'requestSubmit').mockImplementation(() => {})

    const titleInput = component.shadowRoot?.querySelector('cv-input[name="title"]') as HTMLElement
    const nativeInput = titleInput.shadowRoot?.querySelector('input') as HTMLInputElement

    expect(nativeInput).not.toBeNull()

    const event = new KeyboardEvent('keydown', {key: 'Enter', bubbles: true, cancelable: true})
    nativeInput.dispatchEvent(event)
    await settle()

    expect(event.defaultPrevented).toBe(true)
    expect(requestSubmitSpy).toHaveBeenCalledTimes(1)
  })

  it('resets scroll position and focuses title without scrolling on mobile connect', async () => {
    const component = document.createElement('test-entry-create-mobile-scroll') as TestEntryCreateMobileScroll
    const scrollToSpy = vi.fn()

    Object.defineProperty(component, 'scrollTo', {
      value: scrollToSpy,
      configurable: true,
    })

    document.body.append(component)
    await settle()

    expect(scrollToSpy).toHaveBeenCalledWith({top: 0, left: 0})
    expect(component.focusCalls).toEqual([true])
  })

  it('disables native autofocus for the mobile title field', async () => {
    const component = document.createElement('test-entry-create-mobile-scroll') as TestEntryCreateMobileScroll
    document.body.append(component)
    await settle()

    const titleInput = component.shadowRoot?.querySelector('cv-input[name="title"]') as HTMLElement | null
    expect(titleInput).not.toBeNull()
    expect(titleInput?.hasAttribute('autofocus')).toBe(false)
  })

  it('keeps native autofocus for the base create title field', async () => {
    const component = document.createElement('test-entry-create') as TestEntryCreate
    document.body.append(component)
    await settle()

    const titleInput = component.shadowRoot?.querySelector('cv-input[name="title"]') as HTMLElement | null
    expect(titleInput).not.toBeNull()
    expect(titleInput?.hasAttribute('autofocus')).toBe(true)
  })

  it('does not submit when Enter is pressed inside note textarea', async () => {
    const component = document.createElement('test-entry-create') as TestEntryCreate
    document.body.append(component)
    await settle()

    const form = component.shadowRoot?.querySelector('form')
    expect(form).toBeInstanceOf(HTMLFormElement)

    const requestSubmitSpy = vi.fn()
    form!.requestSubmit = requestSubmitSpy as HTMLFormElement['requestSubmit']

    const textarea = component.shadowRoot?.querySelector('[name="note"]') as HTMLElement
    const textareaElement = textarea.shadowRoot?.querySelector('textarea') ?? textarea

    const event = new KeyboardEvent('keydown', {key: 'Enter', bubbles: true})
    textareaElement.dispatchEvent(event)
    await settle()

    expect(event.defaultPrevented).toBe(false)
    expect(requestSubmitSpy).not.toHaveBeenCalled()
  })
})
