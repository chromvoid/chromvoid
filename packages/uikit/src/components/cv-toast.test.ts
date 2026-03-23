import {afterEach, describe, expect, it, vi} from 'vitest'

import {CVToast} from './cv-toast'

CVToast.define()

const settle = async (element: CVToast) => {
  await element.updateComplete
  await Promise.resolve()
  await element.updateComplete
}

const createToast = async (attrs?: Partial<CVToast>) => {
  const el = document.createElement('cv-toast') as CVToast
  if (attrs) Object.assign(el, attrs)
  document.body.append(el)
  await settle(el)
  return el
}

const getBase = (el: CVToast) =>
  el.shadowRoot!.querySelector('[part="base"]') as HTMLElement

afterEach(() => {
  document.body.innerHTML = ''
})

describe('cv-toast', () => {
  it('renders the base structure with icon wrapper, content and dismiss button', async () => {
    const el = await createToast()

    expect(getBase(el)).not.toBeNull()
    expect(el.shadowRoot!.querySelector('[part="icon-wrap"]')).not.toBeNull()
    expect(el.shadowRoot!.querySelector('[part="content"]')).not.toBeNull()
    expect(el.shadowRoot!.querySelector('slot[name="icon"]')).not.toBeNull()
    expect(el.shadowRoot!.querySelector('[part="dismiss"]')).not.toBeNull()
  })

  it('omits the dismiss button when closable is false', async () => {
    const el = await createToast({closable: false})
    expect(el.shadowRoot!.querySelector('[part="dismiss"]')).toBeNull()
  })

  it('uses status for info/success and alert for warning/error', async () => {
    const info = await createToast({level: 'info'})
    expect(getBase(info).getAttribute('role')).toBe('status')

    const success = await createToast({level: 'success'})
    expect(getBase(success).getAttribute('role')).toBe('status')

    const warning = await createToast({level: 'warning'})
    expect(getBase(warning).getAttribute('role')).toBe('alert')

    const error = await createToast({level: 'error'})
    expect(getBase(error).getAttribute('role')).toBe('alert')
  })

  it('renders title and message props', async () => {
    const el = await createToast({title: 'Saved', message: 'Profile updated'})

    expect(el.shadowRoot!.querySelector('[part="title"]')?.textContent).toBe('Saved')
    expect(el.shadowRoot!.querySelector('[part="label"]')?.textContent?.trim()).toBe('Profile updated')
  })

  it('renders default slot content when message is empty', async () => {
    const el = document.createElement('cv-toast') as CVToast
    el.textContent = 'Fallback slot content'
    document.body.append(el)
    await settle(el)

    const slot = el.shadowRoot!.querySelector('slot:not([name])') as HTMLSlotElement
    const assignedText = slot
      .assignedNodes({flatten: true})
      .map((node) => node.textContent ?? '')
      .join('')

    expect(assignedText).toContain('Fallback slot content')
  })

  it('renders a spinner fallback for loading toasts', async () => {
    const el = await createToast({level: 'loading'})
    expect(el.shadowRoot!.querySelector('cv-spinner')).not.toBeNull()
  })

  it('renders a cv-icon fallback when iconName is provided', async () => {
    const el = await createToast({iconName: 'search'})
    const icon = el.shadowRoot!.querySelector('cv-icon')
    expect(icon).not.toBeNull()
    expect(icon?.getAttribute('name')).toBe('search')
  })

  it('renders action buttons and calls their handlers', async () => {
    const onClick = vi.fn()
    const el = await createToast({
      actions: [{label: 'Undo', onClick}],
    })

    const action = el.shadowRoot!.querySelector('[part="action"]') as HTMLButtonElement
    expect(action.textContent?.trim()).toBe('Undo')

    action.click()
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('renders a progress indicator and updates the duration custom property', async () => {
    const el = await createToast({
      progress: true,
      durationMs: 1500,
    })

    expect(el.shadowRoot!.querySelector('[part="progress"]')).not.toBeNull()
    expect(el.style.getPropertyValue('--cv-toast-progress-duration').trim()).toBe('1500ms')
  })

  it('dispatches a bubbling composed close event with the toast id', async () => {
    const el = await createToast({toastId: 'toast-1'})
    let closeEvent: CustomEvent<{id: string}> | null = null

    el.addEventListener('cv-close', (event) => {
      closeEvent = event as CustomEvent<{id: string}>
    })

    ;(el.shadowRoot!.querySelector('[part="dismiss"]') as HTMLButtonElement).click()
    await settle(el)

    expect(closeEvent?.detail.id).toBe('toast-1')
    expect(closeEvent?.bubbles).toBe(true)
    expect(closeEvent?.composed).toBe(true)
  })
})
