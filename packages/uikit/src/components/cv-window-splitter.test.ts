import {afterEach, describe, expect, it, vi} from 'vitest'

import {CVWindowSplitter} from './cv-window-splitter'

// Polyfill PointerEvent for jsdom which does not support it
if (typeof globalThis['PointerEvent'] === 'undefined') {
  ;(globalThis as Record<string, unknown>)['PointerEvent'] = class PointerEvent extends MouseEvent {
    readonly pointerId: number
    readonly pointerType: string
    constructor(type: string, init?: PointerEventInit) {
      super(type, init)
      this.pointerId = init?.pointerId ?? 0
      this.pointerType = init?.pointerType ?? ''
    }
  }
}

CVWindowSplitter.define()

const settle = async (el: CVWindowSplitter) => {
  await el.updateComplete
  await Promise.resolve()
  await el.updateComplete
}

const createSplitter = async (attrs?: Partial<CVWindowSplitter>) => {
  const el = document.createElement('cv-window-splitter') as CVWindowSplitter
  if (attrs) Object.assign(el, attrs)
  document.body.append(el)
  await settle(el)
  return el
}

const getBase = (el: CVWindowSplitter) =>
  el.shadowRoot!.querySelector('[part="base"]') as HTMLElement

const getSeparator = (el: CVWindowSplitter) =>
  el.shadowRoot!.querySelector('[part="separator"]') as HTMLElement

afterEach(() => {
  document.body.innerHTML = ''
})

describe('cv-window-splitter', () => {
  // ──────────────────────────────────────────────────────────────────────────
  // 1. Shadow DOM structure
  // ──────────────────────────────────────────────────────────────────────────

  describe('shadow DOM structure', () => {
    it('renders [part="base"]', async () => {
      const el = await createSplitter()
      expect(getBase(el)).not.toBeNull()
    })

    it('renders exactly two [part="pane"] elements', async () => {
      const el = await createSplitter()
      const panes = el.shadowRoot!.querySelectorAll('[part="pane"]')
      expect(panes).toHaveLength(2)
    })

    it('renders [part="separator"]', async () => {
      const el = await createSplitter()
      expect(getSeparator(el)).not.toBeNull()
    })

    it('renders [part="separator-handle"] inside separator', async () => {
      const el = await createSplitter()
      const handle = getSeparator(el).querySelector('[part="separator-handle"]')
      expect(handle).not.toBeNull()
    })

    it('renders slot[name="primary"] inside primary pane', async () => {
      const el = await createSplitter()
      const primaryPane = el.shadowRoot!.querySelector('[part="pane"][data-pane="primary"]')
      expect(primaryPane).not.toBeNull()
      expect(primaryPane!.querySelector('slot[name="primary"]')).not.toBeNull()
    })

    it('renders slot[name="secondary"] inside secondary pane', async () => {
      const el = await createSplitter()
      const secondaryPane = el.shadowRoot!.querySelector('[part="pane"][data-pane="secondary"]')
      expect(secondaryPane).not.toBeNull()
      expect(secondaryPane!.querySelector('slot[name="secondary"]')).not.toBeNull()
    })

    it('renders slot[name="separator"] inside separator-handle', async () => {
      const el = await createSplitter()
      const handle = getSeparator(el).querySelector('[part="separator-handle"]')
      expect(handle!.querySelector('slot[name="separator"]')).not.toBeNull()
    })

    it('pane elements carry data-pane="primary" and data-pane="secondary"', async () => {
      const el = await createSplitter()
      const primary = el.shadowRoot!.querySelector('[part="pane"][data-pane="primary"]')
      const secondary = el.shadowRoot!.querySelector('[part="pane"][data-pane="secondary"]')
      expect(primary).not.toBeNull()
      expect(secondary).not.toBeNull()
    })

    it('pane elements carry data-orientation matching host orientation', async () => {
      const el = await createSplitter({orientation: 'vertical'})
      const panes = el.shadowRoot!.querySelectorAll('[part="pane"]')
      panes.forEach((pane) => {
        expect(pane.getAttribute('data-orientation')).toBe('vertical')
      })
    })

    it('[part="base"] carries data-orientation matching host orientation', async () => {
      const el = await createSplitter({orientation: 'horizontal'})
      expect(getBase(el).getAttribute('data-orientation')).toBe('horizontal')
    })
  })

  // ──────────────────────────────────────────────────────────────────────────
  // 2. Default property values
  // ──────────────────────────────────────────────────────────────────────────

  describe('default property values', () => {
    it('has position = 50', async () => {
      const el = await createSplitter()
      expect(el.position).toBe(50)
    })

    it('has min = 0', async () => {
      const el = await createSplitter()
      expect(el.min).toBe(0)
    })

    it('has max = 100', async () => {
      const el = await createSplitter()
      expect(el.max).toBe(100)
    })

    it('has step = 1', async () => {
      const el = await createSplitter()
      expect(el.step).toBe(1)
    })

    // TARGET behavior (ARIA-aligned): default orientation is "vertical"
    // (vertical separator = left/right split → ArrowLeft/ArrowRight move).
    // NOTE: Current impl defaults to "horizontal" — this test WILL FAIL (RED).
    it('has orientation = "vertical" (ARIA-aligned default)', async () => {
      const el = await createSplitter()
      expect(el.orientation).toBe('vertical')
    })

    it('has fixed = false', async () => {
      const el = await createSplitter()
      expect(el.fixed).toBe(false)
    })

    // snapThreshold default per spec is 12
    // NOTE: property may not exist yet — this test WILL FAIL (RED).
    it('has snapThreshold = 12', async () => {
      const el = await createSplitter()
      expect((el as unknown as {snapThreshold: number}).snapThreshold).toBe(12)
    })
  })

  // ──────────────────────────────────────────────────────────────────────────
  // 3. ARIA
  // ──────────────────────────────────────────────────────────────────────────

  describe('ARIA', () => {
    it('separator has role="separator"', async () => {
      const el = await createSplitter()
      expect(getSeparator(el).getAttribute('role')).toBe('separator')
    })

    it('separator has tabindex="0"', async () => {
      const el = await createSplitter()
      expect(getSeparator(el).getAttribute('tabindex')).toBe('0')
    })

    it('aria-valuenow = "50" by default', async () => {
      const el = await createSplitter()
      expect(getSeparator(el).getAttribute('aria-valuenow')).toBe('50')
    })

    it('aria-valuemin = "0" by default', async () => {
      const el = await createSplitter()
      expect(getSeparator(el).getAttribute('aria-valuemin')).toBe('0')
    })

    it('aria-valuemax = "100" by default', async () => {
      const el = await createSplitter()
      expect(getSeparator(el).getAttribute('aria-valuemax')).toBe('100')
    })

    // TARGET default orientation is "vertical" — test will FAIL vs current impl (RED).
    it('aria-orientation = "vertical" by default (ARIA-aligned)', async () => {
      const el = await createSplitter()
      expect(getSeparator(el).getAttribute('aria-orientation')).toBe('vertical')
    })

    it('aria-orientation = "horizontal" when orientation is set to "horizontal"', async () => {
      const el = await createSplitter({orientation: 'horizontal'})
      expect(getSeparator(el).getAttribute('aria-orientation')).toBe('horizontal')
    })

    it('aria-orientation = "vertical" when orientation is set to "vertical"', async () => {
      const el = await createSplitter({orientation: 'vertical'})
      expect(getSeparator(el).getAttribute('aria-orientation')).toBe('vertical')
    })

    it('aria-controls references a pane element id', async () => {
      const el = await createSplitter()
      const primaryPane = el.shadowRoot!.querySelector('[part="pane"][data-pane="primary"]') as HTMLElement
      const ariaControls = getSeparator(el).getAttribute('aria-controls')
      expect(ariaControls).toContain(primaryPane.id)
    })

    it('aria-controls references both pane element ids', async () => {
      const el = await createSplitter()
      const primaryPane = el.shadowRoot!.querySelector('[part="pane"][data-pane="primary"]') as HTMLElement
      const secondaryPane = el.shadowRoot!.querySelector('[part="pane"][data-pane="secondary"]') as HTMLElement
      const ariaControls = getSeparator(el).getAttribute('aria-controls')
      expect(ariaControls).toContain(primaryPane.id)
      expect(ariaControls).toContain(secondaryPane.id)
    })

    it('setting ariaLabel propagates to separator aria-label', async () => {
      const el = await createSplitter({ariaLabel: 'Resize panels'})
      expect(getSeparator(el).getAttribute('aria-label')).toBe('Resize panels')
    })

    it('headless delegation: aria-valuenow equals String(el.position) after position change', async () => {
      const el = await createSplitter({position: 30, orientation: 'vertical', step: 1})
      const separator = getSeparator(el)
      expect(separator.getAttribute('aria-valuenow')).toBe('30')

      separator.dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowRight', bubbles: true}))
      await settle(el)

      expect(separator.getAttribute('aria-valuenow')).toBe(String(el.position))
    })
  })

  // ──────────────────────────────────────────────────────────────────────────
  // 4. Keyboard controls — vertical orientation (ARIA-aligned: ArrowLeft/Right)
  // ──────────────────────────────────────────────────────────────────────────

  // TARGET behavior (ARIA-aligned):
  //   orientation="vertical" (vertical separator bar, left/right split)
  //   → ArrowRight increments, ArrowLeft decrements
  //   → ArrowUp/ArrowDown are no-ops
  //
  // NOTE: Current headless maps vertical → ArrowUp/ArrowDown and horizontal → ArrowLeft/ArrowRight.
  //       These tests WILL FAIL against the current impl (RED expected).

  describe('keyboard controls — vertical orientation', () => {
    it('ArrowRight increments position by step', async () => {
      const el = await createSplitter({orientation: 'vertical', position: 50, step: 5})
      getSeparator(el).dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowRight', bubbles: true}))
      await settle(el)
      expect(el.position).toBe(55)
    })

    it('ArrowLeft decrements position by step', async () => {
      const el = await createSplitter({orientation: 'vertical', position: 50, step: 5})
      getSeparator(el).dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowLeft', bubbles: true}))
      await settle(el)
      expect(el.position).toBe(45)
    })

    it('Home moves to min', async () => {
      const el = await createSplitter({orientation: 'vertical', position: 50, min: 10, max: 90, step: 1})
      getSeparator(el).dispatchEvent(new KeyboardEvent('keydown', {key: 'Home', bubbles: true}))
      await settle(el)
      expect(el.position).toBe(10)
    })

    it('End moves to max', async () => {
      const el = await createSplitter({orientation: 'vertical', position: 50, min: 10, max: 90, step: 1})
      getSeparator(el).dispatchEvent(new KeyboardEvent('keydown', {key: 'End', bubbles: true}))
      await settle(el)
      expect(el.position).toBe(90)
    })

    it('ArrowUp has no effect (inactive axis for vertical orientation)', async () => {
      const el = await createSplitter({orientation: 'vertical', position: 50, step: 5})
      getSeparator(el).dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowUp', bubbles: true}))
      await settle(el)
      expect(el.position).toBe(50)
    })

    it('ArrowDown has no effect (inactive axis for vertical orientation)', async () => {
      const el = await createSplitter({orientation: 'vertical', position: 50, step: 5})
      getSeparator(el).dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowDown', bubbles: true}))
      await settle(el)
      expect(el.position).toBe(50)
    })

    it('input event fires on ArrowRight keystroke', async () => {
      const el = await createSplitter({orientation: 'vertical', position: 50, step: 5})
      let inputCount = 0
      el.addEventListener('cv-input', () => inputCount++)
      getSeparator(el).dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowRight', bubbles: true}))
      await settle(el)
      expect(inputCount).toBe(1)
    })

    it('change event fires on ArrowRight keystroke', async () => {
      const el = await createSplitter({orientation: 'vertical', position: 50, step: 5})
      let changeCount = 0
      el.addEventListener('cv-change', () => changeCount++)
      getSeparator(el).dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowRight', bubbles: true}))
      await settle(el)
      expect(changeCount).toBe(1)
    })
  })

  // ──────────────────────────────────────────────────────────────────────────
  // 5. Keyboard controls — horizontal orientation (ARIA-aligned: ArrowUp/Down)
  // ──────────────────────────────────────────────────────────────────────────

  // TARGET behavior (ARIA-aligned):
  //   orientation="horizontal" (horizontal separator bar, top/bottom split)
  //   → ArrowDown increments, ArrowUp decrements
  //   → ArrowLeft/ArrowRight are no-ops
  //
  // NOTE: Current headless maps horizontal → ArrowLeft/ArrowRight.
  //       These tests WILL FAIL against the current impl (RED expected).

  describe('keyboard controls — horizontal orientation', () => {
    it('ArrowDown increments position by step', async () => {
      const el = await createSplitter({orientation: 'horizontal', position: 50, step: 5})
      getSeparator(el).dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowDown', bubbles: true}))
      await settle(el)
      expect(el.position).toBe(55)
    })

    it('ArrowUp decrements position by step', async () => {
      const el = await createSplitter({orientation: 'horizontal', position: 50, step: 5})
      getSeparator(el).dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowUp', bubbles: true}))
      await settle(el)
      expect(el.position).toBe(45)
    })

    it('Home moves to min', async () => {
      const el = await createSplitter({orientation: 'horizontal', position: 50, min: 0, max: 100, step: 1})
      getSeparator(el).dispatchEvent(new KeyboardEvent('keydown', {key: 'Home', bubbles: true}))
      await settle(el)
      expect(el.position).toBe(0)
    })

    it('End moves to max', async () => {
      const el = await createSplitter({orientation: 'horizontal', position: 50, min: 0, max: 100, step: 1})
      getSeparator(el).dispatchEvent(new KeyboardEvent('keydown', {key: 'End', bubbles: true}))
      await settle(el)
      expect(el.position).toBe(100)
    })

    it('ArrowRight has no effect (inactive axis for horizontal orientation)', async () => {
      const el = await createSplitter({orientation: 'horizontal', position: 50, step: 5})
      getSeparator(el).dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowRight', bubbles: true}))
      await settle(el)
      expect(el.position).toBe(50)
    })

    it('ArrowLeft has no effect (inactive axis for horizontal orientation)', async () => {
      const el = await createSplitter({orientation: 'horizontal', position: 50, step: 5})
      getSeparator(el).dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowLeft', bubbles: true}))
      await settle(el)
      expect(el.position).toBe(50)
    })
  })

  // ──────────────────────────────────────────────────────────────────────────
  // 6. Fixed mode
  // ──────────────────────────────────────────────────────────────────────────

  describe('fixed mode', () => {
    it('fixed=true: ArrowRight has no effect', async () => {
      const el = await createSplitter({fixed: true, orientation: 'vertical', position: 50, step: 5})
      getSeparator(el).dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowRight', bubbles: true}))
      await settle(el)
      expect(el.position).toBe(50)
    })

    it('fixed=true: Enter from position 50 (midpoint) moves to max (100)', async () => {
      const el = await createSplitter({fixed: true, position: 50, min: 0, max: 100})
      getSeparator(el).dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true}))
      await settle(el)
      expect(el.position).toBe(100)
    })

    it('fixed=true: Enter from position 100 moves to min (0)', async () => {
      const el = await createSplitter({fixed: true, position: 100, min: 0, max: 100})
      getSeparator(el).dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true}))
      await settle(el)
      expect(el.position).toBe(0)
    })

    it('fixed=true: input event fires on Enter toggle', async () => {
      const el = await createSplitter({fixed: true, position: 50, min: 0, max: 100})
      let inputCount = 0
      el.addEventListener('cv-input', () => inputCount++)
      getSeparator(el).dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true}))
      await settle(el)
      expect(inputCount).toBe(1)
    })

    it('fixed=true: change event fires on Enter toggle', async () => {
      const el = await createSplitter({fixed: true, position: 50, min: 0, max: 100})
      let changeCount = 0
      el.addEventListener('cv-change', () => changeCount++)
      getSeparator(el).dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true}))
      await settle(el)
      expect(changeCount).toBe(1)
    })

    it('fixed=true: multiple Enter presses toggle between max and min', async () => {
      const el = await createSplitter({fixed: true, position: 50, min: 0, max: 100})
      const separator = getSeparator(el)

      separator.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true}))
      await settle(el)
      expect(el.position).toBe(100)

      separator.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true}))
      await settle(el)
      expect(el.position).toBe(0)

      separator.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true}))
      await settle(el)
      expect(el.position).toBe(100)
    })
  })

  // ──────────────────────────────────────────────────────────────────────────
  // 7. Drag — pointer events
  // ──────────────────────────────────────────────────────────────────────────

  // NOTE: Current impl uses mousedown/mousemove/mouseup on document.
  //       These pointer event tests WILL FAIL against the current impl (RED expected).

  describe('drag — pointer events', () => {
    it('setPointerCapture is called on pointerdown', async () => {
      const el = await createSplitter({
        orientation: 'vertical',
        position: 50,
        min: 0,
        max: 100,
      })
      const separator = getSeparator(el)
      separator.setPointerCapture = vi.fn()
      el.getBoundingClientRect = () =>
        ({left: 0, right: 200, width: 200, top: 0, bottom: 200, height: 200, x: 0, y: 0, toJSON: () => {}}) as DOMRect

      separator.dispatchEvent(new PointerEvent('pointerdown', {pointerId: 1, clientX: 100, bubbles: true}))
      await settle(el)

      expect(separator.setPointerCapture).toHaveBeenCalledWith(1)
    })

    it('position changes during pointermove', async () => {
      const el = await createSplitter({
        orientation: 'vertical',
        position: 50,
        min: 0,
        max: 100,
      })
      const separator = getSeparator(el)
      separator.setPointerCapture = vi.fn()

      const base = getBase(el)
      base.getBoundingClientRect = () =>
        ({left: 0, right: 200, width: 200, top: 0, bottom: 200, height: 200, x: 0, y: 0, toJSON: () => {}}) as DOMRect

      separator.dispatchEvent(new PointerEvent('pointerdown', {pointerId: 1, clientX: 100, bubbles: true}))
      await settle(el)

      separator.dispatchEvent(new PointerEvent('pointermove', {pointerId: 1, clientX: 150, bubbles: true}))
      await settle(el)

      expect(el.position).toBeGreaterThan(50)
    })

    it('input event fires during pointermove', async () => {
      const el = await createSplitter({
        orientation: 'vertical',
        position: 50,
        min: 0,
        max: 100,
      })
      const separator = getSeparator(el)
      separator.setPointerCapture = vi.fn()

      const base = getBase(el)
      base.getBoundingClientRect = () =>
        ({left: 0, right: 200, width: 200, top: 0, bottom: 200, height: 200, x: 0, y: 0, toJSON: () => {}}) as DOMRect

      let inputCount = 0
      el.addEventListener('cv-input', () => inputCount++)

      separator.dispatchEvent(new PointerEvent('pointerdown', {pointerId: 1, clientX: 100, bubbles: true}))
      await settle(el)

      separator.dispatchEvent(new PointerEvent('pointermove', {pointerId: 1, clientX: 150, bubbles: true}))
      await settle(el)

      expect(inputCount).toBeGreaterThan(0)
    })

    it('change event fires on pointerup when position changed', async () => {
      const el = await createSplitter({
        orientation: 'vertical',
        position: 50,
        min: 0,
        max: 100,
      })
      const separator = getSeparator(el)
      separator.setPointerCapture = vi.fn()
      separator.releasePointerCapture = vi.fn()

      const base = getBase(el)
      base.getBoundingClientRect = () =>
        ({left: 0, right: 200, width: 200, top: 0, bottom: 200, height: 200, x: 0, y: 0, toJSON: () => {}}) as DOMRect

      let changeCount = 0
      el.addEventListener('cv-change', () => changeCount++)

      separator.dispatchEvent(new PointerEvent('pointerdown', {pointerId: 1, clientX: 100, bubbles: true}))
      await settle(el)

      separator.dispatchEvent(new PointerEvent('pointermove', {pointerId: 1, clientX: 150, bubbles: true}))
      await settle(el)

      separator.dispatchEvent(new PointerEvent('pointerup', {pointerId: 1, clientX: 150, bubbles: true}))
      await settle(el)

      expect(changeCount).toBe(1)
    })

    it('[data-dragging] attribute is set on separator during drag and removed on pointerup', async () => {
      const el = await createSplitter({
        orientation: 'vertical',
        position: 50,
        min: 0,
        max: 100,
      })
      const separator = getSeparator(el)
      separator.setPointerCapture = vi.fn()
      separator.releasePointerCapture = vi.fn()

      const base = getBase(el)
      base.getBoundingClientRect = () =>
        ({left: 0, right: 200, width: 200, top: 0, bottom: 200, height: 200, x: 0, y: 0, toJSON: () => {}}) as DOMRect

      separator.dispatchEvent(new PointerEvent('pointerdown', {pointerId: 1, clientX: 100, bubbles: true}))
      await settle(el)
      expect(separator.hasAttribute('data-dragging')).toBe(true)

      separator.dispatchEvent(new PointerEvent('pointerup', {pointerId: 1, clientX: 100, bubbles: true}))
      await settle(el)
      expect(separator.hasAttribute('data-dragging')).toBe(false)
    })

    it('pointercancel also removes [data-dragging]', async () => {
      const el = await createSplitter({
        orientation: 'vertical',
        position: 50,
        min: 0,
        max: 100,
      })
      const separator = getSeparator(el)
      separator.setPointerCapture = vi.fn()
      separator.releasePointerCapture = vi.fn()

      const base = getBase(el)
      base.getBoundingClientRect = () =>
        ({left: 0, right: 200, width: 200, top: 0, bottom: 200, height: 200, x: 0, y: 0, toJSON: () => {}}) as DOMRect

      separator.dispatchEvent(new PointerEvent('pointerdown', {pointerId: 1, clientX: 100, bubbles: true}))
      await settle(el)
      expect(separator.hasAttribute('data-dragging')).toBe(true)

      separator.dispatchEvent(new PointerEvent('pointercancel', {pointerId: 1, bubbles: true}))
      await settle(el)
      expect(separator.hasAttribute('data-dragging')).toBe(false)
    })
  })

  // ──────────────────────────────────────────────────────────────────────────
  // 8. Snap
  // ──────────────────────────────────────────────────────────────────────────

  // NOTE: snap and snapThreshold properties are not yet in the UIKit component.
  //       These tests WILL FAIL (RED expected) until IMPL_UIKIT and IMPL_HEADLESS land.

  describe('snap', () => {
    it('snaps to nearest snap point when within threshold (keyboard navigation)', async () => {
      const el = await createSplitter({position: 0, min: 0, max: 100, step: 1, orientation: 'vertical'})
      const elAny = el as unknown as {snap: string; snapThreshold: number}
      elAny.snap = '25 50 75'
      elAny.snapThreshold = 12
      await settle(el)

      // Press ArrowRight 20 times from position=0 to approach snap point at 25
      // With snap threshold of 12, position 20 is within threshold of 25 and should snap
      const separator = getSeparator(el)
      for (let i = 0; i < 20; i++) {
        separator.dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowRight', bubbles: true}))
        await settle(el)
      }

      // Position should have snapped to 25 since 20 is within the 12-unit threshold of 25
      expect(el.position).toBe(25)
    })

    it('snap attribute is reflected as a property', async () => {
      const el = await createSplitter()
      ;(el as unknown as {snap: string}).snap = '25 50 75'
      await settle(el)
      expect((el as unknown as {snap: string}).snap).toBe('25 50 75')
    })

    it('snap-threshold attribute is reflected as snapThreshold property', async () => {
      const el = document.createElement('cv-window-splitter') as CVWindowSplitter
      el.setAttribute('snap-threshold', '8')
      document.body.append(el)
      await settle(el)
      expect((el as unknown as {snapThreshold: number}).snapThreshold).toBe(8)
    })
  })

  // ──────────────────────────────────────────────────────────────────────────
  // 9. Events
  // ──────────────────────────────────────────────────────────────────────────

  describe('events', () => {
    it('input event detail has shape {position: number}', async () => {
      const el = await createSplitter({orientation: 'vertical', position: 50, step: 5})
      let detail: unknown
      el.addEventListener('cv-input', (e) => {
        detail = (e as CustomEvent).detail
      })

      getSeparator(el).dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowRight', bubbles: true}))
      await settle(el)

      expect(detail).toEqual({position: 55})
    })

    it('change event detail has shape {position: number}', async () => {
      const el = await createSplitter({orientation: 'vertical', position: 50, step: 5})
      let detail: unknown
      el.addEventListener('cv-change', (e) => {
        detail = (e as CustomEvent).detail
      })

      getSeparator(el).dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowRight', bubbles: true}))
      await settle(el)

      expect(detail).toEqual({position: 55})
    })

    it('input event bubbles and is composed', async () => {
      const el = await createSplitter({orientation: 'vertical', position: 50, step: 5})
      let capturedEvent: CustomEvent | null = null
      document.addEventListener(
        'cv-input',
        (e) => {
          capturedEvent = e as CustomEvent
        },
        {once: true},
      )

      getSeparator(el).dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowRight', bubbles: true}))
      await settle(el)

      expect(capturedEvent).not.toBeNull()
      expect(capturedEvent!.bubbles).toBe(true)
      expect(capturedEvent!.composed).toBe(true)
    })

    it('change event bubbles and is composed', async () => {
      const el = await createSplitter({orientation: 'vertical', position: 50, step: 5})
      let capturedEvent: CustomEvent | null = null
      document.addEventListener(
        'cv-change',
        (e) => {
          capturedEvent = e as CustomEvent
        },
        {once: true},
      )

      getSeparator(el).dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowRight', bubbles: true}))
      await settle(el)

      expect(capturedEvent).not.toBeNull()
      expect(capturedEvent!.bubbles).toBe(true)
      expect(capturedEvent!.composed).toBe(true)
    })

    it('no input or change events fire when position does not change (ArrowRight at max)', async () => {
      const el = await createSplitter({orientation: 'vertical', position: 100, min: 0, max: 100, step: 5})
      let inputCount = 0
      let changeCount = 0
      el.addEventListener('cv-input', () => inputCount++)
      el.addEventListener('cv-change', () => changeCount++)

      getSeparator(el).dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowRight', bubbles: true}))
      await settle(el)

      expect(inputCount).toBe(0)
      expect(changeCount).toBe(0)
    })
  })

  // ──────────────────────────────────────────────────────────────────────────
  // 10. Headless contract delegation
  // ──────────────────────────────────────────────────────────────────────────

  describe('headless contract delegation', () => {
    it('aria-orientation changes when orientation property changes', async () => {
      const el = await createSplitter({orientation: 'vertical'})
      expect(getSeparator(el).getAttribute('aria-orientation')).toBe('vertical')

      el.orientation = 'horizontal'
      await settle(el)
      expect(getSeparator(el).getAttribute('aria-orientation')).toBe('horizontal')

      el.orientation = 'vertical'
      await settle(el)
      expect(getSeparator(el).getAttribute('aria-orientation')).toBe('vertical')
    })

    it('aria-valuenow equals String(el.position) after position property change', async () => {
      const el = await createSplitter({position: 30})
      el.position = 70
      await settle(el)
      expect(getSeparator(el).getAttribute('aria-valuenow')).toBe('70')
    })

    it('aria-valuemin equals String(el.min) after min property change', async () => {
      const el = await createSplitter({min: 0})
      el.min = 10
      await settle(el)
      expect(getSeparator(el).getAttribute('aria-valuemin')).toBe('10')
    })

    it('aria-valuemax equals String(el.max) after max property change', async () => {
      const el = await createSplitter({max: 100})
      el.max = 80
      await settle(el)
      expect(getSeparator(el).getAttribute('aria-valuemax')).toBe('80')
    })

    it('data-orientation on separator updates when orientation changes', async () => {
      const el = await createSplitter({orientation: 'vertical'})
      expect(getSeparator(el).getAttribute('data-orientation')).toBe('vertical')

      el.orientation = 'horizontal'
      await settle(el)
      expect(getSeparator(el).getAttribute('data-orientation')).toBe('horizontal')
    })

    it('data-orientation on panes updates when orientation changes', async () => {
      const el = await createSplitter({orientation: 'vertical'})
      const panes = el.shadowRoot!.querySelectorAll('[part="pane"]')
      panes.forEach((p) => expect(p.getAttribute('data-orientation')).toBe('vertical'))

      el.orientation = 'horizontal'
      await settle(el)
      el.shadowRoot!.querySelectorAll('[part="pane"]').forEach((p) => {
        expect(p.getAttribute('data-orientation')).toBe('horizontal')
      })
    })

    it('data-orientation on base updates when orientation changes', async () => {
      const el = await createSplitter({orientation: 'vertical'})
      expect(getBase(el).getAttribute('data-orientation')).toBe('vertical')

      el.orientation = 'horizontal'
      await settle(el)
      expect(getBase(el).getAttribute('data-orientation')).toBe('horizontal')
    })
  })
})
