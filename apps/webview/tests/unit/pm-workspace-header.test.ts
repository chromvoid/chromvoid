import {afterEach, beforeEach, describe, expect, it} from 'vitest'

import {PMWorkspaceHeader} from '../../src/features/passmanager/components/card/pm-workspace-header'

let defined = false

function ensureDefined() {
  if (defined) return
  PMWorkspaceHeader.define()
  defined = true
}

async function settle(element: PMWorkspaceHeader) {
  await element.updateComplete
  await Promise.resolve()
  await new Promise((resolve) => window.setTimeout(resolve, 0))
  await element.updateComplete
  await Promise.resolve()
}

function createHeader() {
  const element = document.createElement('pm-workspace-header') as PMWorkspaceHeader
  element.contextLabel = 'Parent / Work'
  element.title = 'Secure Record'
  element.supportText = 'Visible children and entries inside the selected branch.'
  element.avatarLetter = 'S'
  element.item = {id: 'item-1'}
  return element
}

describe('PMWorkspaceHeader', () => {
  beforeEach(() => {
    ensureDefined()
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('renders context, title, support text, and named slots in the correct regions', async () => {
    const element = createHeader()
    element.updatedFormatted = '2026-03-29 20:00'
    element.createdFormatted = '2026-03-28 10:00'
    element.innerHTML = `
      <span slot="context-end" class="summary">2 groups · 5 entries</span>
      <button slot="lead" type="button">Back</button>
      <div slot="actions">Actions</div>
    `

    document.body.append(element)
    await settle(element)

    const shadow = element.shadowRoot
    const breadcrumbItems = Array.from(shadow?.querySelectorAll('cv-breadcrumb-item') ?? [])
    expect(breadcrumbItems.map((item) => item.textContent?.trim() ?? '')).toEqual(['Parent / Work'])
    expect(shadow?.querySelector('.title-text')?.textContent).toContain('Secure Record')
    expect(shadow?.querySelector('.title-summary')?.textContent).toContain(
      'Visible children and entries inside the selected branch.',
    )
    expect(shadow?.querySelector('.workspace-context-end')?.hasAttribute('hidden')).toBe(false)
    expect(shadow?.querySelector('.workspace-head-actions')?.hasAttribute('hidden')).toBe(false)
    expect(shadow?.querySelector('.workspace-side')?.hasAttribute('hidden')).toBe(false)
    expect(shadow?.querySelectorAll('.workspace-meta-item').length).toBe(2)
    expect(shadow?.querySelector('.workspace-meta')?.textContent).toContain('2026-03-29 20:00')
    expect(shadow?.querySelector('.workspace-meta')?.textContent).toContain('2026-03-28 10:00')
  })

  it('hides optional subtitle and meta regions when they are absent', async () => {
    const element = createHeader()
    element.supportText = ''
    element.contextItems = [
      {label: 'Parent', value: 'Parent'},
      {label: 'Work', value: 'Parent/Work'},
      {label: 'Security', value: 'Parent/Work/Security', current: true},
    ]

    document.body.append(element)
    await settle(element)

    const shadow = element.shadowRoot
    const breadcrumbItems = Array.from(shadow?.querySelectorAll('cv-breadcrumb-item') ?? [])
    expect(shadow?.querySelector('.title-summary')).toBeNull()
    expect(breadcrumbItems.map((item) => item.textContent?.trim() ?? '')).toEqual([
      'Parent',
      'Work',
      'Security',
    ])
    expect(shadow?.querySelector('.workspace-context-end')?.hasAttribute('hidden')).toBe(true)
    expect(shadow?.querySelector('.workspace-head-actions')?.hasAttribute('hidden')).toBe(true)
    expect(shadow?.querySelector('.workspace-side')?.hasAttribute('hidden')).toBe(true)
  })

  it('dispatches navigate for non-current breadcrumb item clicks', async () => {
    const element = createHeader()
    element.contextItems = [
      {label: 'Root', value: ''},
      {label: 'Work', value: 'Work'},
      {label: 'Security', value: 'Work/Security', current: true},
    ]

    document.body.append(element)
    await settle(element)

    let navigatedValue = '__unset__'
    element.addEventListener('pm-workspace-header-navigate', (event) => {
      navigatedValue = (event as CustomEvent<{value: string}>).detail.value
    })

    const item = element.shadowRoot?.querySelectorAll('cv-breadcrumb-item')[1] as HTMLElement | undefined
    const link = item?.shadowRoot?.querySelector('[part="link"]') as HTMLAnchorElement | null
    const clickEvent = new MouseEvent('click', {bubbles: true, cancelable: true, composed: true})

    link?.dispatchEvent(clickEvent)

    expect(clickEvent.defaultPrevented).toBe(true)
    expect(navigatedValue).toBe('Work')
  })

  it('dispatches navigate with empty value for the root breadcrumb item', async () => {
    const element = createHeader()
    element.contextItems = [
      {label: 'Root', value: ''},
      {label: 'Work', value: 'Work'},
      {label: 'Security', value: 'Work/Security', current: true},
    ]

    document.body.append(element)
    await settle(element)

    let navigatedValue = '__unset__'
    element.addEventListener('pm-workspace-header-navigate', (event) => {
      navigatedValue = (event as CustomEvent<{value: string}>).detail.value
    })

    const item = element.shadowRoot?.querySelectorAll('cv-breadcrumb-item')[0] as HTMLElement | undefined
    const link = item?.shadowRoot?.querySelector('[part="link"]') as HTMLAnchorElement | null
    const clickEvent = new MouseEvent('click', {bubbles: true, cancelable: true, composed: true})

    link?.dispatchEvent(clickEvent)

    expect(clickEvent.defaultPrevented).toBe(true)
    expect(navigatedValue).toBe('')
  })

  it('prevents default and does not dispatch navigate for current breadcrumb item', async () => {
    const element = createHeader()
    element.contextItems = [{label: 'Root', value: '', current: true}]

    document.body.append(element)
    await settle(element)

    let navigateCount = 0
    element.addEventListener('pm-workspace-header-navigate', () => {
      navigateCount += 1
    })

    const item = element.shadowRoot?.querySelector('cv-breadcrumb-item') as HTMLElement | null
    const link = item?.shadowRoot?.querySelector('[part="link"]') as HTMLAnchorElement | null
    const clickEvent = new MouseEvent('click', {bubbles: true, cancelable: true, composed: true})

    link?.dispatchEvent(clickEvent)

    expect(clickEvent.defaultPrevented).toBe(true)
    expect(navigateCount).toBe(0)
  })

  it('renders an editable title input and emits title input events when enabled', async () => {
    const element = createHeader()
    element.editableTitle = true
    element.titlePlaceholder = 'Create a group'

    document.body.append(element)
    await settle(element)

    let currentValue = ''
    element.addEventListener('pm-workspace-header-title-input', (event) => {
      currentValue = (event as CustomEvent<{value: string}>).detail.value
    })

    const input = element.shadowRoot?.querySelector('cv-input.title-input') as HTMLElement | null
    expect(input).not.toBeNull()

    input?.dispatchEvent(
      new CustomEvent('cv-input', {
        detail: {value: 'New group'},
        bubbles: true,
        composed: true,
      }),
    )

    expect(currentValue).toBe('New group')
  })

  it('renders an interactive avatar picker when the avatar is interactive', async () => {
    const element = createHeader()
    element.avatarInteractive = true
    element.avatarIcon = 'camera'

    document.body.append(element)
    await settle(element)

    const picker = element.shadowRoot?.querySelector('pm-icon-picker') as HTMLElement | null
    expect(picker).not.toBeNull()

    const trigger = (
      picker as HTMLElement & {shadowRoot?: ShadowRoot}
    )?.shadowRoot?.querySelector('.icon-trigger') as HTMLButtonElement | null
    expect(trigger).not.toBeNull()

    trigger?.click()
    await settle(element)

    const dialog = (picker as HTMLElement & {shadowRoot?: ShadowRoot})?.shadowRoot?.querySelector('adaptive-modal-surface') as
      | {open?: boolean}
      | null
    expect(dialog?.open).toBe(true)
  })

  it('hides the context band completely when no breadcrumb data or context-end slot is present', async () => {
    const element = createHeader()
    element.contextLabel = ''
    element.contextItems = []

    document.body.append(element)
    await settle(element)

    expect(element.shadowRoot?.querySelector('.workspace-context-band')).toBeNull()
  })

  it('renders the context band when explicitly enabled', async () => {
    const element = createHeader()
    element.hasContextBand = true

    document.body.append(element)
    await settle(element)

    expect(element.shadowRoot?.querySelector('.workspace-context-band')).not.toBeNull()
  })

  it('renders title-end and support slots inline when provided', async () => {
    const element = createHeader()
    element.supportText = 'Fallback text'
    element.innerHTML = `
      <button slot="title-end" type="button">Edit</button>
      <div slot="support">Inline support editor</div>
    `

    document.body.append(element)
    await settle(element)

    const shadow = element.shadowRoot
    const titleEndSlot = shadow?.querySelector('slot[name="title-end"]') as HTMLSlotElement | null
    const supportSlot = shadow?.querySelector('slot[name="support"]') as HTMLSlotElement | null

    expect(shadow?.querySelector('.title-end')?.hasAttribute('hidden')).toBe(false)
    expect(titleEndSlot?.assignedElements({flatten: true})[0]?.textContent).toContain('Edit')
    expect(supportSlot?.assignedElements({flatten: true})[0]?.textContent).toContain('Inline support editor')
    expect(shadow?.querySelector('.title-summary')).toBeNull()
  })
})
