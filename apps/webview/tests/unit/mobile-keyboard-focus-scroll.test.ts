import {atom} from '@reatom/core'
import {afterEach, describe, expect, it, vi} from 'vitest'

import {
  MOBILE_KEYBOARD_SCROLL_ATTR,
  MOBILE_KEYBOARD_SCROLL_CONTAINER_ATTR,
  getMobileKeyboardScrollContainer,
  getMobileKeyboardScrollTargetFromPath,
  isMobileKeyboardScrollTarget,
  setupMobileKeyboardFocusScroll,
} from '../../src/app/bootstrap/mobile-keyboard-focus-scroll'

let cleanupCoordinator: (() => void) | null = null

function setupCoordinator(isMobile = true) {
  const mobile = atom(isMobile)
  cleanupCoordinator = setupMobileKeyboardFocusScroll({isMobile: mobile} as any)
  return mobile
}

function resetRootKeyboardState() {
  document.documentElement.removeAttribute('data-mobile-keyboard-expanded')
  document.documentElement.removeAttribute('data-mobile-keyboard-native-resize')
  document.documentElement.removeAttribute('data-native-keyboard-insets')
  document.documentElement.removeAttribute('data-ios-native-keyboard-insets')
  document.documentElement.style.removeProperty('--mobile-keyboard-scroll-clearance')
  document.documentElement.style.removeProperty('--mobile-keyboard-overlay-offset')
  document.documentElement.style.removeProperty('--visual-viewport-bottom-inset')
  document.documentElement.style.removeProperty('--native-keyboard-bottom-inset')
}

function createDOMRect(rect: Partial<DOMRect>): DOMRect {
  const top = rect.top ?? 0
  const left = rect.left ?? 0
  const width = rect.width ?? Math.max(0, (rect.right ?? 0) - left)
  const height = rect.height ?? Math.max(0, (rect.bottom ?? 0) - top)
  const right = rect.right ?? left + width
  const bottom = rect.bottom ?? top + height

  return {
    x: left,
    y: top,
    top,
    right,
    bottom,
    left,
    width,
    height,
    toJSON: () => ({}),
  } as DOMRect
}

function installVisualViewportMock(height = 844) {
  const previous = Object.getOwnPropertyDescriptor(window, 'visualViewport')
  const viewport = new EventTarget() as VisualViewport

  Object.assign(viewport, {
    width: 390,
    height,
    scale: 1,
    offsetTop: 0,
    offsetLeft: 0,
    pageTop: 0,
    pageLeft: 0,
  })

  Object.defineProperty(window, 'visualViewport', {
    configurable: true,
    value: viewport,
  })

  return {
    setHeight(nextHeight: number) {
      Object.assign(viewport, {height: nextHeight})
    },
    dispatchResize() {
      viewport.dispatchEvent(new Event('resize'))
    },
    restore() {
      if (previous) {
        Object.defineProperty(window, 'visualViewport', previous)
        return
      }

      delete (window as Window & {visualViewport?: VisualViewport}).visualViewport
    },
  }
}

function installScrollableStyleMock(scrollers: readonly HTMLElement[]) {
  const scrollableElements = new Set(scrollers)
  const getComputedStyle = window.getComputedStyle.bind(window)

  vi.spyOn(window, 'getComputedStyle').mockImplementation((element) => {
    const style = getComputedStyle(element)
    if (!scrollableElements.has(element as HTMLElement)) return style

    return new Proxy(style, {
      get(target, prop) {
        if (prop === 'overflowY') return 'auto'
        return Reflect.get(target, prop)
      },
    }) as CSSStyleDeclaration
  })
}

function configureScrollable(
  element: HTMLElement,
  options: {scrollTop?: number; scrollHeight?: number; clientHeight?: number; top?: number; bottom?: number},
) {
  element.scrollTop = options.scrollTop ?? 120
  Object.defineProperty(element, 'scrollHeight', {
    configurable: true,
    value: options.scrollHeight ?? 1_200,
  })
  Object.defineProperty(element, 'clientHeight', {
    configurable: true,
    value: options.clientHeight ?? 500,
  })
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue(
    createDOMRect({top: options.top ?? 0, bottom: options.bottom ?? 844}),
  )
}

function configureFieldRect(element: HTMLElement, top = 760, bottom = 820) {
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue(createDOMRect({top, bottom}))
}

function appendFieldInScroller(field: HTMLElement) {
  const scroller = document.createElement('div')
  scroller.append(field)
  document.body.append(scroller)
  configureScrollable(scroller, {})
  configureFieldRect(field)
  installScrollableStyleMock([scroller])
  return scroller
}

function createTouchPointerEvent(
  type: string,
  options: {clientX?: number; clientY?: number; pointerId?: number} = {},
): PointerEvent {
  const event = new Event(type, {bubbles: true, cancelable: true, composed: true}) as PointerEvent
  Object.defineProperties(event, {
    clientX: {value: options.clientX ?? 0},
    clientY: {value: options.clientY ?? 0},
    pointerId: {value: options.pointerId ?? 1},
    pointerType: {value: 'touch'},
  })
  return event
}

function dispatchFocusIn(element: HTMLElement) {
  element.dispatchEvent(new Event('focusin', {bubbles: true, composed: true}))
}

async function nextFrame() {
  await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()))
  await Promise.resolve()
}

describe('mobile keyboard focus scroll coordinator', () => {
  afterEach(() => {
    cleanupCoordinator?.()
    cleanupCoordinator = null
    document.body.innerHTML = ''
    resetRootKeyboardState()
    vi.restoreAllMocks()
  })

  it('detects text-like keyboard targets from native and UIKit controls', () => {
    const textInput = document.createElement('input')
    textInput.type = 'text'
    const checkbox = document.createElement('input')
    checkbox.type = 'checkbox'
    const readonlyInput = document.createElement('input')
    readonlyInput.readOnly = true
    const textarea = document.createElement('textarea')
    const contentEditable = document.createElement('div')
    contentEditable.setAttribute('contenteditable', 'true')
    const cvNumber = document.createElement('cv-number')

    expect(isMobileKeyboardScrollTarget(textInput)).toBe(true)
    expect(isMobileKeyboardScrollTarget(checkbox)).toBe(false)
    expect(isMobileKeyboardScrollTarget(readonlyInput)).toBe(false)
    expect(isMobileKeyboardScrollTarget(textarea)).toBe(true)
    expect(isMobileKeyboardScrollTarget(contentEditable)).toBe(true)
    expect(isMobileKeyboardScrollTarget(cvNumber)).toBe(true)
    expect(getMobileKeyboardScrollTargetFromPath([textInput, cvNumber])).toBe(cvNumber)
  })

  it('scrolls a native text input into the visible keyboard viewport on focusin', async () => {
    const viewport = installVisualViewportMock(620)
    try {
      const input = document.createElement('input')
      const scroller = appendFieldInScroller(input)
      setupCoordinator()

      dispatchFocusIn(input)
      await nextFrame()

      expect(scroller.scrollTop).toBeGreaterThan(120)
    } finally {
      viewport.restore()
    }
  })

  it('scrolls a UIKit host into view from a bubbling cv-focus event', async () => {
    const viewport = installVisualViewportMock(620)
    try {
      const input = document.createElement('cv-input')
      const scroller = appendFieldInScroller(input)
      setupCoordinator()

      input.dispatchEvent(new CustomEvent('cv-focus', {bubbles: true, composed: true}))
      await nextFrame()

      expect(scroller.scrollTop).toBeGreaterThan(120)
    } finally {
      viewport.restore()
    }
  })

  it('honors data-mobile-keyboard-scroll off on target ancestors', async () => {
    const viewport = installVisualViewportMock(620)
    try {
      const input = document.createElement('input')
      const scroller = appendFieldInScroller(input)
      scroller.setAttribute(MOBILE_KEYBOARD_SCROLL_ATTR, 'off')
      setupCoordinator()

      dispatchFocusIn(input)
      await nextFrame()

      expect(scroller.scrollTop).toBe(120)
    } finally {
      viewport.restore()
    }
  })

  it('prefers an explicit keyboard scroll container over a nearer scrollable ancestor', async () => {
    const viewport = installVisualViewportMock(620)
    try {
      const outer = document.createElement('div')
      const inner = document.createElement('div')
      const input = document.createElement('input')
      outer.setAttribute(MOBILE_KEYBOARD_SCROLL_CONTAINER_ATTR, '')
      inner.append(input)
      outer.append(inner)
      document.body.append(outer)
      configureScrollable(outer, {scrollTop: 10})
      configureScrollable(inner, {scrollTop: 80})
      configureFieldRect(input)
      installScrollableStyleMock([outer, inner])
      setupCoordinator()

      dispatchFocusIn(input)
      await nextFrame()

      expect(getMobileKeyboardScrollContainer(input)).toBe(outer)
      expect(outer.scrollTop).toBeGreaterThan(10)
      expect(inner.scrollTop).toBe(80)
    } finally {
      viewport.restore()
    }
  })

  it('retries correction when the visual viewport resizes after focus', async () => {
    const viewport = installVisualViewportMock(844)
    try {
      const input = document.createElement('input')
      const scroller = appendFieldInScroller(input)
      setupCoordinator()

      dispatchFocusIn(input)
      await nextFrame()
      expect(scroller.scrollTop).toBe(120)

      viewport.setHeight(620)
      viewport.dispatchResize()
      await nextFrame()

      expect(scroller.scrollTop).toBeGreaterThan(120)
    } finally {
      viewport.restore()
    }
  })

  it('cancels pending correction when the focus touch becomes a scroll gesture', async () => {
    const viewport = installVisualViewportMock(620)
    try {
      const input = document.createElement('input')
      const scroller = appendFieldInScroller(input)
      setupCoordinator()

      document.dispatchEvent(createTouchPointerEvent('pointerdown', {clientX: 12, clientY: 12}))
      dispatchFocusIn(input)
      document.dispatchEvent(createTouchPointerEvent('pointermove', {clientX: 12, clientY: 42}))
      viewport.dispatchResize()
      await nextFrame()

      expect(scroller.scrollTop).toBe(120)
    } finally {
      viewport.restore()
    }
  })

  it('does not run the coordinator on desktop runtime state', async () => {
    const viewport = installVisualViewportMock(620)
    try {
      const input = document.createElement('input')
      const scroller = appendFieldInScroller(input)
      setupCoordinator(false)

      dispatchFocusIn(input)
      await nextFrame()

      expect(scroller.scrollTop).toBe(120)
    } finally {
      viewport.restore()
    }
  })
})
