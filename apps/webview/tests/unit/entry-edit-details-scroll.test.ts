import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {html, type TemplateResult} from 'lit'

import {CVAccordion, CVAccordionItem} from '@chromvoid/uikit'
import {Entry, ManagerRoot} from '@project/passmanager'
import {PMEntryEditBase} from '../../src/features/passmanager/components/card/entry-edit/entry-edit-base'
import {PMEntryEditMobile} from '../../src/features/passmanager/components/card/entry-edit/entry-edit-mobile'

class TestEntryEdit extends PMEntryEditBase {
  static define() {
    if (!customElements.get('test-entry-edit-scroll')) {
      customElements.define('test-entry-edit-scroll', this)
    }
  }

  protected override renderFooterActions(): TemplateResult {
    return html`<footer class="edit-footer"></footer>`
  }
}

class TestEntryEditMobile extends PMEntryEditMobile {
  static define() {
    if (!customElements.get('test-entry-edit-mobile')) {
      customElements.define('test-entry-edit-mobile', this)
    }
  }

  openOtpCreate() {
    this.onAddOtp()
  }

  protected override shouldUseOtpSubScreen(): boolean {
    return true
  }
}

const settle = async (component: TestEntryEdit) => {
  await component.updateComplete
  await Promise.resolve()
  await component.updateComplete
  await Promise.resolve()
}

const createEntry = () => {
  const entry = new Entry(
    Object.create(ManagerRoot.prototype) as ManagerRoot,
    {
      id: 'entry-scroll-test',
      title: 'Entry Scroll Test',
      urls: [],
      username: 'user',
      createdTs: Date.now(),
      updatedTs: Date.now(),
      otps: [],
      sshKeys: [],
    } as any,
  )

  vi.spyOn(entry, 'password').mockResolvedValue('')
  vi.spyOn(entry, 'note').mockResolvedValue('')

  return entry
}

const getSectionsAccordion = (component: TestEntryEdit): CVAccordion => {
  const accordion = component.shadowRoot?.querySelector('.edit-sections-accordion') as CVAccordion | undefined
  expect(accordion).toBeInstanceOf(CVAccordion)
  return accordion!
}

const getAccordionItem = (accordion: CVAccordion, value: string): CVAccordionItem => {
  const item = accordion.querySelector(`cv-accordion-item[value="${value}"]`) as CVAccordionItem | undefined
  expect(item).toBeInstanceOf(CVAccordionItem)
  return item!
}

describe('PMEntryEditBase accordion sections', () => {
  let previousPassmanager: typeof window.passmanager
  let previousMatchMedia: typeof window.matchMedia

  beforeEach(() => {
    previousPassmanager = window.passmanager
    previousMatchMedia = window.matchMedia

    window.matchMedia = vi.fn().mockImplementation(() => ({
      matches: false,
      media: '',
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))

    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback: FrameRequestCallback) => {
      callback(0)
      return 1
    })

    CVAccordionItem.define()
    CVAccordion.define()
    TestEntryEdit.define()
    TestEntryEditMobile.define()
  })

  afterEach(() => {
    document.body.innerHTML = ''
    window.passmanager = previousPassmanager
    window.matchMedia = previousMatchMedia
    vi.restoreAllMocks()
  })

  it('renders OTP and SSH sections inside cv-accordion', async () => {
    const entry = createEntry()
    window.passmanager = {
      showElement: () => entry,
    } as unknown as typeof window.passmanager

    const component = document.createElement('test-entry-edit-scroll') as TestEntryEdit
    document.body.append(component)
    await settle(component)

    const accordion = getSectionsAccordion(component)
    const items = Array.from(accordion.querySelectorAll('cv-accordion-item'))

    expect(accordion.allowMultiple).toBe(true)
    expect(accordion.revealExpanded).toBe(true)
    expect(items.map((item) => item.getAttribute('value'))).toEqual(['otp', 'ssh'])
  })

  it('reveals ssh accordion item after user interaction', async () => {
    const entry = createEntry()
    window.passmanager = {
      showElement: () => entry,
    } as unknown as typeof window.passmanager

    const component = document.createElement('test-entry-edit-scroll') as TestEntryEdit
    document.body.append(component)
    await settle(component)

    const accordion = getSectionsAccordion(component)
    const sshItem = getAccordionItem(accordion, 'ssh')
    const scrollIntoViewSpy = vi.fn()

    Object.defineProperty(sshItem, 'scrollIntoView', {
      value: scrollIntoViewSpy,
      configurable: true,
    })

    const trigger = sshItem.shadowRoot?.querySelector('[part="trigger"]') as HTMLButtonElement | null
    expect(trigger).not.toBeNull()

    trigger!.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
    await settle(component)
    await Promise.resolve()

    expect(scrollIntoViewSpy).toHaveBeenCalledWith({block: 'nearest', inline: 'nearest'})
  })

  it('does not reveal items on programmatic accordion opening', async () => {
    const entry = createEntry()
    window.passmanager = {
      showElement: () => entry,
    } as unknown as typeof window.passmanager

    const component = document.createElement('test-entry-edit-scroll') as TestEntryEdit
    document.body.append(component)
    await settle(component)

    const accordion = getSectionsAccordion(component)
    const sshItem = getAccordionItem(accordion, 'ssh')
    const scrollIntoViewSpy = vi.fn()

    Object.defineProperty(sshItem, 'scrollIntoView', {
      value: scrollIntoViewSpy,
      configurable: true,
    })

    accordion.expandedValues = ['ssh']
    await settle(component)
    await Promise.resolve()

    expect(scrollIntoViewSpy).not.toHaveBeenCalled()
  })

  it('renders mobile OTP sub-screen with footer actions instead of header actions', async () => {
    const entry = createEntry()
    window.passmanager = {
      showElement: () => entry,
    } as unknown as typeof window.passmanager

    const component = document.createElement('test-entry-edit-mobile') as TestEntryEditMobile
    document.body.append(component)
    await settle(component)

    component.openOtpCreate()
    await settle(component)

    const screen = component.shadowRoot?.querySelector('.otp-create-screen') as HTMLElement | null
    const footer = component.shadowRoot?.querySelector('.otp-create-screen-footer') as HTMLElement | null
    const headerActions = component.shadowRoot?.querySelector('.otp-create-screen-actions')
    const form = component.shadowRoot?.querySelector('form')
    const editSections = component.shadowRoot?.querySelector('.edit-sections-accordion')

    expect(screen).not.toBeNull()
    expect(headerActions).toBeNull()
    expect(footer).not.toBeNull()
    expect(footer?.querySelectorAll('cv-button')).toHaveLength(2)
    expect(form).toBeNull()
    expect(editSections).toBeNull()
  })
})
