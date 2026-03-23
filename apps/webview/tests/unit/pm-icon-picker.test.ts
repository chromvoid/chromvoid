import {afterEach, describe, expect, it, vi} from 'vitest'

import {PMIconPicker} from '../../src/features/passmanager/components/pm-icon-picker'
import {pmIconStore} from '../../src/features/passmanager/models/pm-icon-store'

let defined = false

function ensureDefined() {
  if (defined) return
  PMIconPicker.define()
  defined = true
}

describe('PMIconPicker', () => {
  afterEach(() => {
    document.querySelectorAll('pm-icon-picker').forEach((el) => el.remove())
    vi.restoreAllMocks()
  })

  it('renders saved icons and emits pm-icon-change on selection', async () => {
    ensureDefined()
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

    const selectButton = picker.shadowRoot?.querySelector('.icon-library-item') as HTMLButtonElement | null
    expect(selectButton).not.toBeNull()

    selectButton?.click()

    expect(onChange).toHaveBeenCalledTimes(1)
    const event = onChange.mock.calls[0]?.[0] as CustomEvent<{iconRef: string | undefined}>
    expect(event.detail.iconRef).toBe(iconRef)
  })
})
