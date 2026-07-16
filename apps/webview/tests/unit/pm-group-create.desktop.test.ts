import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {PMGroupCreateDesktop} from '../../src/features/passmanager/components/group/group-create'
import {passmanagerNavigationController} from '../../src/features/passmanager/passmanager-navigation.controller'

let defined = false

function ensureDefined() {
  if (defined) return
  PMGroupCreateDesktop.define()
  defined = true
}

async function settle(element: PMGroupCreateDesktop) {
  await element.updateComplete
  await Promise.resolve()
  await new Promise((resolve) => window.setTimeout(resolve, 0))
  await element.updateComplete
  await Promise.resolve()
}

describe('PMGroupCreate desktop', () => {
  let previousPassmanager: typeof window.passmanager

  beforeEach(() => {
    previousPassmanager = window.passmanager
    passmanagerNavigationController.reset()
    ensureDefined()
  })

  afterEach(() => {
    document.body.innerHTML = ''
    window.passmanager = previousPassmanager
    vi.restoreAllMocks()
  })

  it('keeps create available and focuses the title when the required name is missing', async () => {
    const createGroup = vi.fn()
    window.passmanager = {
      createGroup,
      showElement: () => null,
    } as unknown as typeof window.passmanager

    const element = document.createElement('pm-group-create-desktop') as PMGroupCreateDesktop
    document.body.append(element)
    await settle(element)

    const submit = element.shadowRoot?.querySelector('cv-button[type="submit"]') as HTMLElement | null
    expect(submit?.hasAttribute('disabled')).toBe(false)

    element.shadowRoot
      ?.querySelector('form')
      ?.dispatchEvent(new Event('submit', {bubbles: true, cancelable: true}))
    await settle(element)

    const header = element.shadowRoot?.querySelector('pm-workspace-header') as HTMLElement | null
    const titleInput = header?.shadowRoot?.querySelector('cv-input.title-input') as
      | (HTMLElement & {shadowRoot?: ShadowRoot})
      | null
    const nativeInput = titleInput?.shadowRoot?.querySelector('input')
    expect(createGroup).not.toHaveBeenCalled()
    expect(header?.shadowRoot?.querySelector('.title-error')?.textContent).not.toBe('')
    expect(titleInput?.shadowRoot?.activeElement).toBe(nativeInput)
  })

  it('renders the workspace header flow and submits an empty group', async () => {
    const createGroup = vi.fn()
    window.passmanager = {
      createGroup,
      showElement: () => null,
    } as unknown as typeof window.passmanager

    const element = document.createElement('pm-group-create-desktop') as PMGroupCreateDesktop
    document.body.append(element)
    await settle(element)

    expect(element.shadowRoot?.querySelector('cv-select')).toBeNull()
    expect(element.shadowRoot?.querySelector('.workspace-meta-item')).toBeNull()

    const header = element.shadowRoot?.querySelector('pm-workspace-header') as HTMLElement | null
    expect(header).not.toBeNull()
    const breadcrumbs = header?.shadowRoot?.querySelectorAll('cv-breadcrumb-item')
    expect(breadcrumbs?.length).toBe(1)
    expect(breadcrumbs?.[0]?.textContent?.trim()).toBe('Root')

    header?.dispatchEvent(
      new CustomEvent('pm-workspace-header-title-input', {
        detail: {value: 'Ops Vault'},
        bubbles: true,
        composed: true,
      }),
    )
    await settle(element)

    expect(element.shadowRoot?.querySelector('.icon-section')).toBeNull()

    const picker = header?.shadowRoot?.querySelector('pm-icon-picker') as (HTMLElement & {shadowRoot?: ShadowRoot}) | null
    const avatar = picker?.shadowRoot?.querySelector('pm-avatar-icon') as {icon?: string} | null
    expect(avatar?.icon).toBe('camera')

    const descriptionField = element.shadowRoot?.querySelector('cv-textarea[name="description"]') as HTMLElement | null
    descriptionField?.dispatchEvent(
      new CustomEvent('cv-input', {
        detail: {value: 'For runbooks and ops links'},
        bubbles: true,
        composed: true,
      }),
    )
    await settle(element)

    const form = element.shadowRoot?.querySelector('form') as HTMLFormElement | null
    const submitEvent = new Event('submit', {bubbles: true, cancelable: true})
    form?.dispatchEvent(submitEvent)
    await settle(element)

    expect(createGroup).toHaveBeenCalledWith({
      name: 'Ops Vault',
      description: 'For runbooks and ops links',
      iconRef: undefined,
      entries: [],
    })
  })
})
