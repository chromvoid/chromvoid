import {afterAll, afterEach, beforeAll, describe, expect, it} from 'vitest'

import {CVSidebar} from './cv-sidebar'
import {CVSidebarItem} from './cv-sidebar-item'

CVSidebar.define()
CVSidebarItem.define()

const originalIntersectionObserver = globalThis.IntersectionObserver
const originalInnerHeight = window.innerHeight
const originalScrollTo = window.scrollTo
const originalScrollY = window.scrollY

class MockIntersectionObserver implements IntersectionObserver {
  static instances: MockIntersectionObserver[] = []

  readonly root = null
  readonly rootMargin: string
  readonly thresholds: ReadonlyArray<number>
  private readonly observed = new Set<Element>()

  constructor(
    private readonly callback: IntersectionObserverCallback,
    options: IntersectionObserverInit = {},
  ) {
    this.rootMargin = options.rootMargin ?? '0px'
    const threshold = options.threshold ?? 0
    this.thresholds = Array.isArray(threshold) ? threshold : [threshold]
    MockIntersectionObserver.instances.push(this)
  }

  observe(target: Element): void {
    this.observed.add(target)
  }

  unobserve(target: Element): void {
    this.observed.delete(target)
  }

  disconnect(): void {
    this.observed.clear()
  }

  takeRecords(): IntersectionObserverEntry[] {
    return []
  }

  emit(target: Element, init: Partial<IntersectionObserverEntry> = {}): void {
    const rect = init.boundingClientRect ?? createRect(0, 240)
    const entry = {
      time: 0,
      target,
      isIntersecting: init.isIntersecting ?? true,
      intersectionRatio: init.intersectionRatio ?? 1,
      boundingClientRect: rect,
      intersectionRect: init.intersectionRect ?? rect,
      rootBounds: init.rootBounds ?? rect,
    } satisfies Partial<IntersectionObserverEntry>

    this.callback([entry as IntersectionObserverEntry], this as unknown as IntersectionObserver)
  }

  static reset(): void {
    MockIntersectionObserver.instances = []
  }
}

const createRect = (top: number, height: number) =>
  ({
    x: 0,
    y: top,
    top,
    left: 0,
    width: 320,
    height,
    bottom: top + height,
    right: 320,
    toJSON() {
      return {}
    },
  }) satisfies DOMRectReadOnly

const setElementRect = (element: Element, top: number, height: number) => {
  ;(element as HTMLElement).getBoundingClientRect = () => createRect(top, height) as DOMRect
}

const waitForAnimationFrame = () =>
  new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))

const setViewportHeight = (height: number) => {
  Object.defineProperty(window, 'innerHeight', {
    configurable: true,
    value: height,
  })
}

const setScrollY = (value: number) => {
  Object.defineProperty(window, 'scrollY', {
    configurable: true,
    value,
  })
}

beforeAll(() => {
  globalThis.IntersectionObserver = MockIntersectionObserver as unknown as typeof IntersectionObserver
})

afterAll(() => {
  globalThis.IntersectionObserver = originalIntersectionObserver
})

const settle = async (element: CVSidebar) => {
  await element.updateComplete
  await Promise.resolve()
  await waitForAnimationFrame()
  await element.updateComplete
}

const createSidebar = async (attrs?: Partial<CVSidebar>) => {
  const el = document.createElement('cv-sidebar') as CVSidebar
  if (attrs) Object.assign(el, attrs)
  document.body.append(el)
  await settle(el)
  return el
}

const getBase = (el: CVSidebar) =>
  el.shadowRoot!.querySelector('[part="panel"]') as HTMLElement

afterEach(() => {
  document.body.innerHTML = ''
  document.body.style.overflow = ''
  setViewportHeight(originalInnerHeight)
  setScrollY(originalScrollY)
  window.scrollTo = originalScrollTo
  Reflect.deleteProperty(document.documentElement, 'scrollHeight')
  MockIntersectionObserver.reset()
})

describe('cv-sidebar', () => {
  // --- Shadow DOM structure ---

  describe('shadow DOM structure', () => {
    it('renders [part="overlay"] as a <div>', async () => {
      const el = await createSidebar()
      const overlay = el.shadowRoot!.querySelector('[part="overlay"]') as HTMLElement
      expect(overlay).not.toBeNull()
      expect(overlay.tagName).toBe('DIV')
    })

    it('renders [part="panel"] as an <aside>', async () => {
      const el = await createSidebar()
      const panel = getBase(el)
      expect(panel).not.toBeNull()
      expect(panel.tagName).toBe('ASIDE')
    })

    it('renders [part="header"] as a <header> with slot[name="header"]', async () => {
      const el = await createSidebar()
      const header = el.shadowRoot!.querySelector('[part="header"]') as HTMLElement
      expect(header).not.toBeNull()
      expect(header.tagName).toBe('HEADER')
      const slot = header.querySelector('slot[name="header"]')
      expect(slot).not.toBeNull()
    })

    it('renders [part="toggle"] as a <button> with slot[name="toggle"]', async () => {
      const el = await createSidebar()
      const toggle = el.shadowRoot!.querySelector('[part="toggle"]') as HTMLElement
      expect(toggle).not.toBeNull()
      expect(toggle.tagName).toBe('BUTTON')
      const slot = toggle.querySelector('slot[name="toggle"]')
      expect(slot).not.toBeNull()
    })

    it('renders [part="body"] as a <nav> with default slot', async () => {
      const el = await createSidebar()
      const body = el.shadowRoot!.querySelector('[part="body"]') as HTMLElement
      expect(body).not.toBeNull()
      expect(body.tagName).toBe('NAV')
      const slot = body.querySelector('slot:not([name])')
      expect(slot).not.toBeNull()
    })

    it('renders [part="footer"] as a <footer> with slot[name="footer"]', async () => {
      const el = await createSidebar()
      const footer = el.shadowRoot!.querySelector('[part="footer"]') as HTMLElement
      expect(footer).not.toBeNull()
      expect(footer.tagName).toBe('FOOTER')
      const slot = footer.querySelector('slot[name="footer"]')
      expect(slot).not.toBeNull()
    })
  })

  // --- Default property values ---

  describe('default property values', () => {
    it('has correct defaults', async () => {
      const el = await createSidebar()
      expect(el.expanded).toBe(true)
      expect(el.collapsed).toBe(false)
      expect(el.mobile).toBe(false)
      expect(el.overlayOpen).toBe(false)
      expect(el.size).toBe('medium')
      expect(el.breakpoint).toBe('768px')
      expect(el.closeOnEscape).toBe(true)
      expect(el.closeOnOutsidePointer).toBe(true)
    })
  })

  // --- Attribute reflection ---

  describe('attribute reflection', () => {
    it('expanded attribute reflects when true (default)', async () => {
      const el = await createSidebar()
      expect(el.hasAttribute('expanded')).toBe(true)
    })

    it('collapsed attribute reflects when set', async () => {
      const el = await createSidebar({collapsed: true})
      expect(el.hasAttribute('collapsed')).toBe(true)
    })

    it('expanded attribute is absent when collapsed', async () => {
      const el = await createSidebar({collapsed: true})
      expect(el.hasAttribute('expanded')).toBe(false)
    })

    it('mobile attribute reflects when set', async () => {
      const el = await createSidebar({mobile: true})
      expect(el.hasAttribute('mobile')).toBe(true)
    })

    it('overlay-open attribute reflects when set', async () => {
      const el = await createSidebar({overlayOpen: true, mobile: true})
      expect(el.hasAttribute('overlay-open')).toBe(true)
    })

    it('size attribute reflects its value', async () => {
      const el = await createSidebar({size: 'large'})
      expect(el.getAttribute('size')).toBe('large')
    })

    it('size defaults to "medium" in attribute', async () => {
      const el = await createSidebar()
      expect(el.getAttribute('size')).toBe('medium')
    })

    it('close-on-escape attribute reflects', async () => {
      const el = await createSidebar()
      expect(el.hasAttribute('close-on-escape')).toBe(true)
    })

    it('close-on-outside-pointer attribute reflects', async () => {
      const el = await createSidebar()
      expect(el.hasAttribute('close-on-outside-pointer')).toBe(true)
    })
  })

  // --- Events ---

  describe('events', () => {
    it('cv-input fires with {expanded: false} when collapsed via toggle click', async () => {
      const el = await createSidebar()
      const toggle = el.shadowRoot!.querySelector('[part="toggle"]') as HTMLElement
      let detail: unknown

      el.addEventListener('cv-input', (e) => {
        detail = (e as CustomEvent).detail
      })

      toggle.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(el)

      expect(detail).toEqual({expanded: false})
    })

    it('cv-change fires with {expanded: false} when collapsed via toggle click', async () => {
      const el = await createSidebar()
      const toggle = el.shadowRoot!.querySelector('[part="toggle"]') as HTMLElement
      let detail: unknown

      el.addEventListener('cv-change', (e) => {
        detail = (e as CustomEvent).detail
      })

      toggle.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(el)

      expect(detail).toEqual({expanded: false})
    })

    it('cv-input fires with {expanded: true} when expanded via toggle click', async () => {
      const el = await createSidebar({collapsed: true})
      const toggle = el.shadowRoot!.querySelector('[part="toggle"]') as HTMLElement
      let detail: unknown

      el.addEventListener('cv-input', (e) => {
        detail = (e as CustomEvent).detail
      })

      toggle.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(el)

      expect(detail).toEqual({expanded: true})
    })

    it('programmatic expanded change does not emit cv-input/cv-change', async () => {
      const el = await createSidebar()
      let inputCount = 0
      let changeCount = 0

      el.addEventListener('cv-input', () => inputCount++)
      el.addEventListener('cv-change', () => changeCount++)

      el.expanded = false
      await settle(el)

      expect(inputCount).toBe(0)
      expect(changeCount).toBe(0)
    })

    it('cv-expand fires when sidebar begins expanding', async () => {
      const el = await createSidebar({collapsed: true})
      const toggle = el.shadowRoot!.querySelector('[part="toggle"]') as HTMLElement
      let fired = false

      el.addEventListener('cv-expand', () => {
        fired = true
      })

      toggle.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(el)

      expect(fired).toBe(true)
    })

    it('cv-after-expand fires after expand transition completes', async () => {
      const el = await createSidebar({collapsed: true})
      const toggle = el.shadowRoot!.querySelector('[part="toggle"]') as HTMLElement
      let fired = false

      el.addEventListener('cv-after-expand', () => {
        fired = true
      })

      toggle.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(el)

      expect(fired).toBe(true)
    })

    it('cv-collapse fires when sidebar begins collapsing', async () => {
      const el = await createSidebar()
      const toggle = el.shadowRoot!.querySelector('[part="toggle"]') as HTMLElement
      let fired = false

      el.addEventListener('cv-collapse', () => {
        fired = true
      })

      toggle.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(el)

      expect(fired).toBe(true)
    })

    it('cv-after-collapse fires after collapse transition completes', async () => {
      const el = await createSidebar()
      const toggle = el.shadowRoot!.querySelector('[part="toggle"]') as HTMLElement
      let fired = false

      el.addEventListener('cv-after-collapse', () => {
        fired = true
      })

      toggle.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(el)

      expect(fired).toBe(true)
    })

    it('cv-overlay-open fires when mobile overlay begins opening', async () => {
      const el = await createSidebar({mobile: true})
      let fired = false

      el.addEventListener('cv-overlay-open', () => {
        fired = true
      })

      el.overlayOpen = true
      await settle(el)

      expect(fired).toBe(true)
    })

    it('cv-overlay-close fires when mobile overlay begins closing', async () => {
      const el = await createSidebar({mobile: true, overlayOpen: true})
      let fired = false

      el.addEventListener('cv-overlay-close', () => {
        fired = true
      })

      el.overlayOpen = false
      await settle(el)

      expect(fired).toBe(true)
    })

    it('cv-after-overlay-open fires after overlay open transition completes', async () => {
      const el = await createSidebar({mobile: true})
      let fired = false

      el.addEventListener('cv-after-overlay-open', () => {
        fired = true
      })

      el.overlayOpen = true
      await settle(el)

      expect(fired).toBe(true)
    })

    it('cv-after-overlay-close fires after overlay close transition completes', async () => {
      const el = await createSidebar({mobile: true, overlayOpen: true})
      let fired = false

      el.addEventListener('cv-after-overlay-close', () => {
        fired = true
      })

      el.overlayOpen = false
      await settle(el)

      expect(fired).toBe(true)
    })

    it('cv-input fires with {overlayOpen: true} in mobile mode', async () => {
      const el = await createSidebar({mobile: true})
      const toggle = el.shadowRoot!.querySelector('[part="toggle"]') as HTMLElement
      let detail: unknown

      el.addEventListener('cv-input', (e) => {
        detail = (e as CustomEvent).detail
      })

      toggle.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(el)

      expect(detail).toEqual({overlayOpen: true})
    })

    it('cv-change fires with {overlayOpen: true} in mobile mode', async () => {
      const el = await createSidebar({mobile: true})
      const toggle = el.shadowRoot!.querySelector('[part="toggle"]') as HTMLElement
      let detail: unknown

      el.addEventListener('cv-change', (e) => {
        detail = (e as CustomEvent).detail
      })

      toggle.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(el)

      expect(detail).toEqual({overlayOpen: true})
    })
  })

  // --- ARIA ---

  describe('ARIA', () => {
    it('panel has role="navigation" in desktop mode', async () => {
      const el = await createSidebar()
      const panel = getBase(el)
      expect(panel.getAttribute('role')).toBe('navigation')
    })

    it('panel has role="dialog" in mobile overlay mode', async () => {
      const el = await createSidebar({mobile: true, overlayOpen: true})
      const panel = getBase(el)
      expect(panel.getAttribute('role')).toBe('dialog')
    })

    it('panel has aria-label defaulting to "Sidebar navigation"', async () => {
      const el = await createSidebar()
      const panel = getBase(el)
      expect(panel.getAttribute('aria-label')).toBe('Sidebar navigation')
    })

    it('panel has aria-modal="true" when mobile overlay is open', async () => {
      const el = await createSidebar({mobile: true, overlayOpen: true})
      const panel = getBase(el)
      expect(panel.getAttribute('aria-modal')).toBe('true')
    })

    it('panel does not have aria-modal in desktop mode', async () => {
      const el = await createSidebar()
      const panel = getBase(el)
      const ariaModal = panel.getAttribute('aria-modal')
      expect(ariaModal === null || ariaModal === 'false').toBe(true)
    })

    it('panel has data-collapsed when collapsed', async () => {
      const el = await createSidebar({collapsed: true})
      const panel = getBase(el)
      expect(panel.hasAttribute('data-collapsed')).toBe(true)
    })

    it('panel has data-mobile when in mobile mode', async () => {
      const el = await createSidebar({mobile: true})
      const panel = getBase(el)
      expect(panel.hasAttribute('data-mobile')).toBe(true)
    })

    it('toggle has aria-expanded reflecting expanded state', async () => {
      const el = await createSidebar()
      const toggle = el.shadowRoot!.querySelector('[part="toggle"]') as HTMLElement
      expect(toggle.getAttribute('aria-expanded')).toBe('true')

      el.expanded = false
      el.collapsed = true
      await settle(el)
      expect(toggle.getAttribute('aria-expanded')).toBe('false')
    })

    it('toggle has aria-controls pointing to panel id', async () => {
      const el = await createSidebar()
      const toggle = el.shadowRoot!.querySelector('[part="toggle"]') as HTMLElement
      const panel = getBase(el)
      expect(toggle.getAttribute('aria-controls')).toBe(panel.id)
    })

    it('toggle has tabindex="0"', async () => {
      const el = await createSidebar()
      const toggle = el.shadowRoot!.querySelector('[part="toggle"]') as HTMLElement
      expect(toggle.getAttribute('tabindex')).toBe('0')
    })
  })

  // --- Expand/collapse behavior ---

  describe('expand/collapse behavior', () => {
    it('toggle click collapses expanded sidebar', async () => {
      const el = await createSidebar()
      const toggle = el.shadowRoot!.querySelector('[part="toggle"]') as HTMLElement

      toggle.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(el)

      expect(el.expanded).toBe(false)
      expect(el.collapsed).toBe(true)
    })

    it('toggle click expands collapsed sidebar', async () => {
      const el = await createSidebar({collapsed: true})
      const toggle = el.shadowRoot!.querySelector('[part="toggle"]') as HTMLElement

      toggle.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(el)

      expect(el.expanded).toBe(true)
      expect(el.collapsed).toBe(false)
    })

    it('expanded and collapsed are always inverse', async () => {
      const el = await createSidebar()
      expect(el.expanded).toBe(true)
      expect(el.collapsed).toBe(false)

      el.collapsed = true
      await settle(el)
      expect(el.expanded).toBe(false)
      expect(el.collapsed).toBe(true)
    })
  })

  // --- Rail mode ---

  describe('rail mode', () => {
    it('panel has data-collapsed when in rail mode', async () => {
      const el = await createSidebar({collapsed: true})
      const panel = getBase(el)
      expect(panel.hasAttribute('data-collapsed')).toBe(true)
    })

    it('panel does not have data-collapsed when expanded', async () => {
      const el = await createSidebar()
      const panel = getBase(el)
      expect(panel.hasAttribute('data-collapsed')).toBe(false)
    })

    it('host has [collapsed] attribute when in rail mode', async () => {
      const el = await createSidebar({collapsed: true})
      expect(el.hasAttribute('collapsed')).toBe(true)
      expect(el.hasAttribute('expanded')).toBe(false)
    })
  })

  // --- Mobile overlay mode ---

  describe('mobile overlay mode', () => {
    it('overlay is hidden when overlayOpen is false', async () => {
      const el = await createSidebar({mobile: true})
      const overlay = el.shadowRoot!.querySelector('[part="overlay"]') as HTMLElement
      expect(overlay.hidden).toBe(true)
    })

    it('overlay is visible when overlayOpen is true', async () => {
      const el = await createSidebar({mobile: true, overlayOpen: true})
      const overlay = el.shadowRoot!.querySelector('[part="overlay"]') as HTMLElement
      expect(overlay.hidden).toBe(false)
    })

    it('overlay has data-open when overlayOpen is true', async () => {
      const el = await createSidebar({mobile: true, overlayOpen: true})
      const overlay = el.shadowRoot!.querySelector('[part="overlay"]') as HTMLElement
      expect(overlay.hasAttribute('data-open')).toBe(true)
    })

    it('host has [mobile] and [overlay-open] attributes when overlay is open', async () => {
      const el = await createSidebar({mobile: true, overlayOpen: true})
      expect(el.hasAttribute('mobile')).toBe(true)
      expect(el.hasAttribute('overlay-open')).toBe(true)
    })

    it('body scroll is locked when mobile overlay is open', async () => {
      const el = await createSidebar({mobile: true, overlayOpen: true})
      await settle(el)
      expect(document.body.style.overflow).toBe('hidden')
    })

    it('body scroll is restored when mobile overlay closes', async () => {
      const el = await createSidebar({mobile: true, overlayOpen: true})
      await settle(el)
      expect(document.body.style.overflow).toBe('hidden')

      el.overlayOpen = false
      await settle(el)
      expect(document.body.style.overflow).toBe('')
    })

    it('outside pointer click closes overlay when closeOnOutsidePointer=true', async () => {
      const el = await createSidebar({mobile: true, overlayOpen: true})
      const overlay = el.shadowRoot!.querySelector('[part="overlay"]') as HTMLElement

      overlay.dispatchEvent(new MouseEvent('mousedown', {bubbles: true}))
      await settle(el)

      expect(el.overlayOpen).toBe(false)
    })

    it('outside pointer click does not close overlay when closeOnOutsidePointer=false', async () => {
      const el = await createSidebar({mobile: true, overlayOpen: true, closeOnOutsidePointer: false})
      const overlay = el.shadowRoot!.querySelector('[part="overlay"]') as HTMLElement

      overlay.dispatchEvent(new MouseEvent('mousedown', {bubbles: true}))
      await settle(el)

      expect(el.overlayOpen).toBe(true)
    })
  })

  // --- Keyboard interaction ---

  describe('keyboard interaction', () => {
    it('Escape closes mobile overlay when closeOnEscape=true (default)', async () => {
      const el = await createSidebar({mobile: true, overlayOpen: true})
      const panel = getBase(el)

      panel.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true}))
      await settle(el)

      expect(el.overlayOpen).toBe(false)
    })

    it('Escape does not close overlay when closeOnEscape=false', async () => {
      const el = await createSidebar({mobile: true, overlayOpen: true, closeOnEscape: false})
      const panel = getBase(el)

      panel.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true}))
      await settle(el)

      expect(el.overlayOpen).toBe(true)
    })

    it('Escape emits cv-input and cv-change with {overlayOpen: false}', async () => {
      const el = await createSidebar({mobile: true, overlayOpen: true})
      const panel = getBase(el)
      const inputDetails: unknown[] = []
      const changeDetails: unknown[] = []

      el.addEventListener('cv-input', (e) => inputDetails.push((e as CustomEvent).detail))
      el.addEventListener('cv-change', (e) => changeDetails.push((e as CustomEvent).detail))

      panel.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true}))
      await settle(el)

      expect(inputDetails).toEqual([{overlayOpen: false}])
      expect(changeDetails).toEqual([{overlayOpen: false}])
    })
  })

  // --- Headless contract delegation ---

  describe('headless contract delegation', () => {
    it('panel ARIA attributes come from headless getSidebarProps()', async () => {
      const el = await createSidebar()
      const panel = getBase(el)
      expect(panel.id).toBeTruthy()
      expect(panel.getAttribute('role')).toBe('navigation')
      expect(panel.getAttribute('aria-label')).toBeDefined()
    })

    it('toggle ARIA attributes come from headless getToggleProps()', async () => {
      const el = await createSidebar()
      const toggle = el.shadowRoot!.querySelector('[part="toggle"]') as HTMLElement
      expect(toggle.id).toBeTruthy()
      expect(toggle.getAttribute('role')).toBe('button')
      expect(toggle.getAttribute('aria-expanded')).toBeDefined()
      expect(toggle.getAttribute('aria-controls')).toBeTruthy()
    })

    it('overlay hidden attribute reflects headless getOverlayProps().hidden', async () => {
      const el = await createSidebar({mobile: true})
      const overlay = el.shadowRoot!.querySelector('[part="overlay"]') as HTMLElement
      expect(overlay.hidden).toBe(true)

      el.overlayOpen = true
      await settle(el)
      expect(overlay.hidden).toBe(false)
    })

    it('aria-controls on toggle matches panel id', async () => {
      const el = await createSidebar()
      const toggle = el.shadowRoot!.querySelector('[part="toggle"]') as HTMLElement
      const panel = getBase(el)
      expect(toggle.getAttribute('aria-controls')).toBe(panel.id)
    })
  })

  describe('scrollspy', () => {
    it('tracks activeId and emits cv-scrollspy-change for cv-sidebar-item targets', async () => {
      const alpha = document.createElement('section')
      alpha.id = 'alpha'
      const beta = document.createElement('section')
      beta.id = 'beta'
      document.body.append(alpha, beta)
      setElementRect(alpha, 24, 320)
      setElementRect(beta, 440, 320)

      const el = await createSidebar({scrollspy: true, scrollspyOffsetTop: 80})
      const itemAlpha = document.createElement('cv-sidebar-item') as CVSidebarItem
      itemAlpha.href = '#alpha'
      itemAlpha.textContent = 'Alpha'
      const itemBeta = document.createElement('cv-sidebar-item') as CVSidebarItem
      itemBeta.href = '#beta'
      itemBeta.textContent = 'Beta'
      el.append(itemAlpha, itemBeta)
      await settle(el)

      expect(el.activeId).toBe('alpha')
      expect(itemAlpha.active).toBe(true)
      expect(itemBeta.active).toBe(false)

      const observer = MockIntersectionObserver.instances[0]!
      expect(observer).toBeDefined()

      const changes: Array<string | null> = []
      el.addEventListener('cv-scrollspy-change', (event) => {
        changes.push((event as CustomEvent<{activeId: string | null}>).detail.activeId)
      })

      observer.emit(alpha, {boundingClientRect: createRect(24, 320), isIntersecting: true})
      await settle(el)

      setElementRect(alpha, -360, 320)
      setElementRect(beta, 48, 320)
      observer.emit(beta, {boundingClientRect: createRect(48, 320), isIntersecting: true})
      await settle(el)

      expect(el.activeId).toBe('beta')
      expect(itemAlpha.active).toBe(false)
      expect(itemBeta.active).toBe(true)
      expect(changes).toEqual(['beta'])
    })

    it('uses top-anchor observer config by default', async () => {
      const alpha = document.createElement('section')
      alpha.id = 'alpha'
      document.body.append(alpha)

      const el = await createSidebar({scrollspy: true, scrollspyOffsetTop: 80})
      const item = document.createElement('cv-sidebar-item') as CVSidebarItem
      item.href = '#alpha'
      item.textContent = 'Alpha'
      el.append(item)
      await settle(el)

      const observer = MockIntersectionObserver.instances[0]!
      expect(observer.rootMargin).toBe('-80px 0px -60% 0px')
      expect(observer.thresholds).toEqual([0, 0.25, 0.5, 0.75, 1])
    })

    it('uses viewport-dominant observer config when requested', async () => {
      const alpha = document.createElement('section')
      alpha.id = 'alpha'
      document.body.append(alpha)

      const el = await createSidebar({
        scrollspy: true,
        scrollspyOffsetTop: 80,
        scrollspyStrategy: 'viewport-dominant',
      })
      const item = document.createElement('cv-sidebar-item') as CVSidebarItem
      item.href = '#alpha'
      item.textContent = 'Alpha'
      el.append(item)
      await settle(el)

      const observer = MockIntersectionObserver.instances[0]!
      expect(observer.rootMargin).toBe('0px')
      expect(observer.thresholds).toHaveLength(21)
      expect(observer.thresholds.at(0)).toBe(0)
      expect(observer.thresholds.at(-1)).toBe(1)
    })

    it('updates aria-current for plain hash anchors', async () => {
      const alpha = document.createElement('section')
      alpha.id = 'alpha'
      const beta = document.createElement('section')
      beta.id = 'beta'
      document.body.append(alpha, beta)
      setElementRect(alpha, 20, 280)
      setElementRect(beta, 380, 280)

      const el = await createSidebar({scrollspy: true})
      const anchorAlpha = document.createElement('a')
      anchorAlpha.setAttribute('href', '#alpha')
      anchorAlpha.textContent = 'Alpha'
      const anchorBeta = document.createElement('a')
      anchorBeta.setAttribute('href', '#beta')
      anchorBeta.textContent = 'Beta'
      el.append(anchorAlpha, anchorBeta)
      await settle(el)

      const observer = MockIntersectionObserver.instances[0]!
      observer.emit(alpha, {boundingClientRect: createRect(20, 280), isIntersecting: true})
      await settle(el)

      expect(anchorAlpha.getAttribute('aria-current')).toBe('location')
      expect(anchorBeta.hasAttribute('aria-current')).toBe(false)

      setElementRect(alpha, -320, 280)
      setElementRect(beta, -8, 280)
      observer.emit(beta, {boundingClientRect: createRect(-8, 280), isIntersecting: true})
      await settle(el)

      expect(anchorAlpha.hasAttribute('aria-current')).toBe(false)
      expect(anchorBeta.getAttribute('aria-current')).toBe('location')
    })

    it('computes viewport-dominant activeId from effective viewport dominance', async () => {
      setViewportHeight(1200)

      const alpha = document.createElement('section')
      alpha.id = 'alpha'
      const beta = document.createElement('section')
      beta.id = 'beta'
      document.body.append(alpha, beta)
      setElementRect(alpha, 88, 266)
      setElementRect(beta, 354, 397)

      const el = await createSidebar({
        scrollspy: true,
        scrollspyOffsetTop: 80,
        scrollspyStrategy: 'viewport-dominant',
      })
      const itemAlpha = document.createElement('cv-sidebar-item') as CVSidebarItem
      itemAlpha.href = '#alpha'
      itemAlpha.textContent = 'Alpha'
      const itemBeta = document.createElement('cv-sidebar-item') as CVSidebarItem
      itemBeta.href = '#beta'
      itemBeta.textContent = 'Beta'
      el.append(itemAlpha, itemBeta)
      await settle(el)

      expect(el.activeId).toBe('beta')
      expect(itemAlpha.active).toBe(false)
      expect(itemBeta.active).toBe(true)
    })

    it('intercepts same-page hash clicks and preserves non-hash links', async () => {
      const target = document.createElement('section')
      target.id = 'alpha'
      const calls: ScrollIntoViewOptions[] = []
      target.scrollIntoView = ((options?: ScrollIntoViewOptions) => {
        calls.push(options ?? {})
      }) as typeof target.scrollIntoView
      document.body.append(target)

      const el = await createSidebar({scrollspy: true, scrollspySmoothScroll: true})
      const item = document.createElement('cv-sidebar-item') as CVSidebarItem
      item.href = '#alpha'
      item.textContent = 'Alpha'
      const external = document.createElement('a')
      external.setAttribute('href', 'https://example.com/')
      external.target = '_blank'
      external.textContent = 'External'
      let externalDefaultPrevented = false
      external.addEventListener('click', (event) => {
        externalDefaultPrevented = event.defaultPrevented
        event.preventDefault()
      })
      el.append(item, external)
      await settle(el)

      const link = item.shadowRoot!.querySelector('a') as HTMLAnchorElement
      link.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(el)

      expect(calls).toEqual([{behavior: 'smooth', block: 'start'}])
      expect(el.activeId).toBe('alpha')
      expect(item.active).toBe(true)

      external.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(el)

      expect(calls).toHaveLength(1)
      expect(externalDefaultPrevented).toBe(false)
    })

    it('does not optimistically switch activeId on click in viewport-dominant mode', async () => {
      setViewportHeight(1200)
      setScrollY(0)

      const alpha = document.createElement('section')
      alpha.id = 'alpha'
      const beta = document.createElement('section')
      beta.id = 'beta'
      document.body.append(alpha, beta)
      setElementRect(alpha, 100, 500)
      setElementRect(beta, 820, 360)
      Object.defineProperty(document.documentElement, 'scrollHeight', {
        configurable: true,
        value: 5000,
      })
      const scrollCalls: ScrollToOptions[] = []
      window.scrollTo = ((options: ScrollToOptions | number, y?: number) => {
        if (typeof options === 'number') {
          const top = y ?? 0
          scrollCalls.push({top, behavior: 'auto'})
          setScrollY(top)
          return
        }

        scrollCalls.push(options)
        setScrollY(options.top ?? 0)
      }) as typeof window.scrollTo

      const el = await createSidebar({
        scrollspy: true,
        scrollspyOffsetTop: 80,
        scrollspyStrategy: 'viewport-dominant',
      })
      const itemAlpha = document.createElement('cv-sidebar-item') as CVSidebarItem
      itemAlpha.href = '#alpha'
      itemAlpha.textContent = 'Alpha'
      const itemBeta = document.createElement('cv-sidebar-item') as CVSidebarItem
      itemBeta.href = '#beta'
      itemBeta.textContent = 'Beta'
      el.append(itemAlpha, itemBeta)
      await settle(el)

      expect(el.activeId).toBe('alpha')

      const link = itemBeta.shadowRoot!.querySelector('a') as HTMLAnchorElement
      link.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))
      await settle(el)

      expect(scrollCalls).toEqual([{top: 360, behavior: 'smooth'}])
      expect(el.activeId).toBe('alpha')
      expect(itemAlpha.active).toBe(true)
      expect(itemBeta.active).toBe(false)
    })

    it('propagates collapsed and mobile context to sidebar items', async () => {
      const el = await createSidebar({collapsed: true})
      const item = document.createElement('cv-sidebar-item') as CVSidebarItem
      item.href = '#alpha'
      item.textContent = 'Alpha'
      el.append(item)
      await settle(el)

      expect(item.getAttribute('data-sidebar-collapsed')).toBe('')
      expect(item.hasAttribute('data-sidebar-mobile')).toBe(false)

      el.mobile = true
      await settle(el)

      expect(item.getAttribute('data-sidebar-mobile')).toBe('')
    })

    it('reveals the active item inside the sidebar body scroller', async () => {
      const alpha = document.createElement('section')
      alpha.id = 'alpha'
      const beta = document.createElement('section')
      beta.id = 'beta'
      document.body.append(alpha, beta)
      setElementRect(alpha, -320, 280)
      setElementRect(beta, -8, 280)

      const el = await createSidebar({scrollspy: true})
      const itemAlpha = document.createElement('cv-sidebar-item') as CVSidebarItem
      itemAlpha.href = '#alpha'
      itemAlpha.textContent = 'Alpha'
      const itemBeta = document.createElement('cv-sidebar-item') as CVSidebarItem
      itemBeta.href = '#beta'
      itemBeta.textContent = 'Beta'
      el.append(itemAlpha, itemBeta)
      await settle(el)

      const body = el.shadowRoot!.querySelector('[part="body"]') as HTMLElement
      body.getBoundingClientRect = () => createRect(100, 120) as DOMRect
      let scrollTop = 0
      Object.defineProperty(body, 'scrollTop', {
        configurable: true,
        get() {
          return scrollTop
        },
        set(value: number) {
          scrollTop = value
        },
      })
      itemAlpha.getBoundingClientRect = () => createRect(110, 24) as DOMRect
      itemBeta.getBoundingClientRect = () => createRect(250, 24) as DOMRect

      const observer = MockIntersectionObserver.instances[0]!
      observer.emit(beta, {boundingClientRect: createRect(-8, 280), isIntersecting: true})
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve(undefined))))
      await settle(el)

      expect(body.scrollTop).toBeGreaterThan(0)
    })

    it('applies hysteresis in viewport-dominant mode to prevent close-score jitter', async () => {
      setViewportHeight(1200)

      const alpha = document.createElement('section')
      alpha.id = 'alpha'
      const beta = document.createElement('section')
      beta.id = 'beta'
      document.body.append(alpha, beta)
      setElementRect(alpha, 100, 500)
      setElementRect(beta, 780, 500)

      const el = await createSidebar({
        scrollspy: true,
        scrollspyOffsetTop: 80,
        scrollspyStrategy: 'viewport-dominant',
      })
      const itemAlpha = document.createElement('cv-sidebar-item') as CVSidebarItem
      itemAlpha.href = '#alpha'
      itemAlpha.textContent = 'Alpha'
      const itemBeta = document.createElement('cv-sidebar-item') as CVSidebarItem
      itemBeta.href = '#beta'
      itemBeta.textContent = 'Beta'
      el.append(itemAlpha, itemBeta)
      await settle(el)

      expect(el.activeId).toBe('alpha')

      setElementRect(alpha, 100, 500)
      setElementRect(beta, 230, 500)
      const observer = MockIntersectionObserver.instances[0]!
      observer.emit(beta, {intersectionRatio: 0.9, isIntersecting: true})
      await settle(el)

      expect(el.activeId).toBe('alpha')
      expect(itemAlpha.active).toBe(true)
      expect(itemBeta.active).toBe(false)
    })

    it('ignores stale observer geometry and uses live section positions', async () => {
      const alpha = document.createElement('section')
      alpha.id = 'alpha'
      const beta = document.createElement('section')
      beta.id = 'beta'
      document.body.append(alpha, beta)
      setElementRect(alpha, -520, 320)
      setElementRect(beta, 40, 320)

      const el = await createSidebar({scrollspy: true, scrollspyOffsetTop: 80})
      const itemAlpha = document.createElement('cv-sidebar-item') as CVSidebarItem
      itemAlpha.href = '#alpha'
      itemAlpha.textContent = 'Alpha'
      const itemBeta = document.createElement('cv-sidebar-item') as CVSidebarItem
      itemBeta.href = '#beta'
      itemBeta.textContent = 'Beta'
      el.append(itemAlpha, itemBeta)
      await settle(el)

      const observer = MockIntersectionObserver.instances[0]!
      observer.emit(alpha, {boundingClientRect: createRect(24, 320), isIntersecting: true})
      await settle(el)

      expect(el.activeId).toBe('beta')
      expect(itemAlpha.active).toBe(false)
      expect(itemBeta.active).toBe(true)
    })

    it('prefers the visible section closest to the offset near the page bottom', async () => {
      const recommendations = document.createElement('section')
      recommendations.id = 'recommendations'
      const audit = document.createElement('section')
      audit.id = 'audit'
      document.body.append(recommendations, audit)
      setElementRect(recommendations, -425, 532)
      setElementRect(audit, 107, 369)

      const el = await createSidebar({scrollspy: true, scrollspyOffsetTop: 80})
      const itemRecommendations = document.createElement('cv-sidebar-item') as CVSidebarItem
      itemRecommendations.href = '#recommendations'
      itemRecommendations.textContent = 'Recommendations'
      const itemAudit = document.createElement('cv-sidebar-item') as CVSidebarItem
      itemAudit.href = '#audit'
      itemAudit.textContent = 'Audit'
      el.append(itemRecommendations, itemAudit)
      await settle(el)

      const observer = MockIntersectionObserver.instances[0]!
      observer.emit(audit, {boundingClientRect: createRect(-8, 280), isIntersecting: true})
      await settle(el)

      expect(el.activeId).toBe('audit')
      expect(itemRecommendations.active).toBe(false)
      expect(itemAudit.active).toBe(true)
    })

    it('chooses disclosure when it dominates the effective viewport near the page bottom', async () => {
      setViewportHeight(1200)

      const audit = document.createElement('section')
      audit.id = 'audit'
      const disclosure = document.createElement('section')
      disclosure.id = 'disclosure'
      document.body.append(audit, disclosure)
      setElementRect(audit, -144, 387)
      setElementRect(disclosure, 243, 360)

      const el = await createSidebar({
        scrollspy: true,
        scrollspyOffsetTop: 80,
        scrollspyStrategy: 'viewport-dominant',
      })
      const itemAudit = document.createElement('cv-sidebar-item') as CVSidebarItem
      itemAudit.href = '#audit'
      itemAudit.textContent = 'Audit'
      const itemDisclosure = document.createElement('cv-sidebar-item') as CVSidebarItem
      itemDisclosure.href = '#disclosure'
      itemDisclosure.textContent = 'Disclosure'
      el.append(itemAudit, itemDisclosure)
      await settle(el)

      expect(el.activeId).toBe('disclosure')
      expect(itemAudit.active).toBe(false)
      expect(itemDisclosure.active).toBe(true)
    })
  })
})
