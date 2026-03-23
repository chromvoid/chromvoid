import {afterEach, describe, expect, it, vi} from 'vitest'

import {MobileTopToolbar} from '../../src/features/shell/components/mobile-top-toolbar'

let defined = false

function ensureDefined() {
  if (defined) return
  MobileTopToolbar.define()
  defined = true
}

describe('MobileTopToolbar', () => {
  afterEach(() => {
    document.querySelectorAll('mobile-top-toolbar').forEach((el) => el.remove())
    vi.restoreAllMocks()
  })

  it('renders title with menu leading and command, dispatching toolbar events', async () => {
    ensureDefined()
    const toolbar = document.createElement('mobile-top-toolbar') as MobileTopToolbar
    toolbar.title = 'Files'
    toolbar.leading = 'menu'
    toolbar.showCommand = true

    const onLeading = vi.fn()
    const onCommand = vi.fn()
    toolbar.addEventListener('mobile-toolbar-leading', onLeading as EventListener)
    toolbar.addEventListener('mobile-toolbar-command', onCommand as EventListener)

    document.body.appendChild(toolbar)
    await toolbar.updateComplete

    const title = toolbar.shadowRoot?.querySelector('.title')?.textContent?.trim()
    expect(title).toBe('Files')
    let leadingButton = toolbar.shadowRoot?.querySelector('[data-action="mobile-leading"]') as HTMLButtonElement | null
    let leadingIcon = leadingButton?.querySelector('cv-icon')
    expect(leadingButton).toBeTruthy()
    expect(leadingButton?.getAttribute('aria-label')).toBe('Open menu')
    expect(leadingIcon?.getAttribute('name')).toBe('list')
    expect(toolbar.shadowRoot?.querySelector('[data-action="mobile-command"]')).toBeTruthy()

    toolbar.menuOpen = true
    await toolbar.updateComplete
    leadingButton = toolbar.shadowRoot?.querySelector('[data-action="mobile-leading"]') as HTMLButtonElement | null
    leadingIcon = leadingButton?.querySelector('cv-icon')
    expect(leadingButton?.getAttribute('aria-label')).toBe('Close menu')
    expect(leadingIcon?.getAttribute('name')).toBe('x')

    leadingButton?.click()
    ;(toolbar.shadowRoot?.querySelector('[data-action="mobile-command"]') as HTMLElement | null)?.click()

    expect(onLeading).toHaveBeenCalledTimes(1)
    expect((onLeading.mock.calls[0]?.[0] as CustomEvent).detail).toEqual({mode: 'menu'})
    expect(onCommand).toHaveBeenCalledTimes(1)
  })

  it('hides optional controls and blocks back event when disabled', async () => {
    ensureDefined()
    const toolbar = document.createElement('mobile-top-toolbar') as MobileTopToolbar
    toolbar.title = 'Storage'
    toolbar.leading = 'back'
    toolbar.backDisabled = true
    toolbar.showCommand = false

    const onLeading = vi.fn()
    toolbar.addEventListener('mobile-toolbar-leading', onLeading as EventListener)

    document.body.appendChild(toolbar)
    await toolbar.updateComplete

    expect(toolbar.shadowRoot?.querySelector('[data-action="mobile-command"]')).toBeNull()

    const leading = toolbar.shadowRoot?.querySelector('[data-action="mobile-leading"]') as HTMLButtonElement | null
    expect(leading).toBeTruthy()
    expect(Boolean(leading?.disabled)).toBe(true)
    leading?.click()
    expect(onLeading).toHaveBeenCalledTimes(0)

    toolbar.leading = 'none'
    await toolbar.updateComplete
    expect(toolbar.shadowRoot?.querySelector('[data-action="mobile-leading"]')).toBeNull()
  })
})
