import {afterEach, describe, expect, it, vi} from 'vitest'

import {CVToastRegion} from './cv-toast-region'

const settle = async (region: CVToastRegion) => {
  await region.updateComplete
  await Promise.resolve()
  await region.updateComplete
  await Promise.resolve()
}

function getToastItems(region: CVToastRegion): HTMLElement[] {
  return Array.from(region.shadowRoot?.querySelectorAll('[part="item"]') ?? []) as HTMLElement[]
}

async function mountRegion() {
  CVToastRegion.define()
  const region = document.createElement('cv-toast-region') as CVToastRegion
  document.body.append(region)
  await settle(region)
  return region
}

afterEach(() => {
  document.body.innerHTML = ''
  vi.useRealTimers()
})

describe('cv-toast-region', () => {
  it('supports push, dismiss and clear via imperative controller', async () => {
    const region = await mountRegion()

    const firstId = region.controller.push({message: 'Saved', durationMs: 0})
    await settle(region)
    expect(getToastItems(region)).toHaveLength(1)

    region.controller.dismiss(firstId)
    await settle(region)
    expect(getToastItems(region)).toHaveLength(0)

    region.controller.push({message: 'One', durationMs: 0})
    region.controller.push({message: 'Two', durationMs: 0})
    await settle(region)
    expect(getToastItems(region)).toHaveLength(2)

    region.controller.clear()
    await settle(region)
    expect(getToastItems(region)).toHaveLength(0)
  })

  it('auto-dismisses toasts and emits close events', async () => {
    vi.useFakeTimers()

    const region = await mountRegion()
    const closed: string[] = []

    region.addEventListener('cv-close', (event) => {
      closed.push((event as CustomEvent<{id: string}>).detail.id)
    })

    const id = region.controller.push({message: 'Auto', durationMs: 50})
    await settle(region)
    expect(getToastItems(region)).toHaveLength(1)

    vi.advanceTimersByTime(50)
    await settle(region)

    expect(getToastItems(region)).toHaveLength(0)
    expect(closed).toContain(id)
  })

  it('pauses and resumes auto-dismiss timers', async () => {
    vi.useFakeTimers()

    const region = await mountRegion()

    region.controller.push({message: 'Pauseable', durationMs: 100})
    await settle(region)

    vi.advanceTimersByTime(40)
    region.controller.pause()

    vi.advanceTimersByTime(500)
    await settle(region)
    expect(getToastItems(region)).toHaveLength(1)

    region.controller.resume()
    vi.advanceTimersByTime(59)
    await settle(region)
    expect(getToastItems(region)).toHaveLength(1)

    vi.advanceTimersByTime(1)
    await settle(region)
    expect(getToastItems(region)).toHaveLength(0)
  })

  it('renders aria region and level-based item roles from headless contracts', async () => {
    const region = await mountRegion()

    region.controller.push({message: 'Warn', level: 'warning', durationMs: 0})
    region.controller.push({message: 'Info', level: 'info', durationMs: 0})
    await settle(region)

    const base = region.shadowRoot?.querySelector('[part="base"]') as HTMLElement
    expect(base.getAttribute('role')).toBe('region')
    expect(base.getAttribute('aria-live')).toBe('polite')

    const warning = region.shadowRoot?.querySelector('[data-level="warning"]') as HTMLElement
    const info = region.shadowRoot?.querySelector('[data-level="info"]') as HTMLElement

    expect(warning.getAttribute('role')).toBe('alert')
    expect(info.getAttribute('role')).toBe('status')
  })

  it('emits close event for explicit dismiss', async () => {
    const region = await mountRegion()

    const closed: string[] = []
    region.addEventListener('cv-close', (event) => {
      closed.push((event as CustomEvent<{id: string}>).detail.id)
    })

    const id = region.controller.push({message: 'Manual', durationMs: 0})
    await settle(region)

    region.controller.dismiss(id)
    await settle(region)

    expect(closed).toEqual([id])
  })

  // --- Position attribute ---

  describe('position attribute', () => {
    it('defaults position to "top-end"', async () => {
      const region = await mountRegion()
      expect(region.position).toBe('top-end')
    })

    it('reflects position attribute', async () => {
      const region = await mountRegion()
      region.position = 'bottom-center'
      await settle(region)
      expect(region.getAttribute('position')).toBe('bottom-center')
    })

    it('accepts all valid position values', async () => {
      const positions = ['top-start', 'top-center', 'top-end', 'bottom-start', 'bottom-center', 'bottom-end'] as const
      for (const pos of positions) {
        const region = await mountRegion()
        region.position = pos
        await settle(region)
        expect(region.getAttribute('position')).toBe(pos)
        region.remove()
      }
    })
  })

  // --- Max visible ---

  describe('max-visible attribute', () => {
    it('defaults maxVisible to 3', async () => {
      const region = await mountRegion()
      expect(region.maxVisible).toBe(3)
    })

    it('limits displayed toasts to maxVisible count', async () => {
      const region = await mountRegion()
      region.maxVisible = 2
      await settle(region)

      region.controller.push({message: 'A', durationMs: 0})
      region.controller.push({message: 'B', durationMs: 0})
      region.controller.push({message: 'C', durationMs: 0})
      await settle(region)

      expect(getToastItems(region)).toHaveLength(2)
    })
  })

  // --- Region ARIA structure ---

  describe('region ARIA structure', () => {
    it('renders [part="base"] with aria-atomic="false"', async () => {
      const region = await mountRegion()
      const base = region.shadowRoot?.querySelector('[part="base"]') as HTMLElement
      expect(base.getAttribute('aria-atomic')).toBe('false')
    })
  })

  // --- Mouse hover pause/resume ---

  describe('mouse hover pause/resume', () => {
    it('pauses timers on mouseenter and resumes on mouseleave', async () => {
      vi.useFakeTimers()

      const region = await mountRegion()
      region.controller.push({message: 'Hover test', durationMs: 100})
      await settle(region)

      const base = region.shadowRoot?.querySelector('[part="base"]') as HTMLElement

      vi.advanceTimersByTime(30)
      base.dispatchEvent(new MouseEvent('mouseenter', {bubbles: true}))
      await settle(region)

      vi.advanceTimersByTime(500)
      await settle(region)
      expect(getToastItems(region)).toHaveLength(1)

      base.dispatchEvent(new MouseEvent('mouseleave', {bubbles: true}))
      await settle(region)

      vi.advanceTimersByTime(70)
      await settle(region)
      expect(getToastItems(region)).toHaveLength(0)
    })
  })
})
