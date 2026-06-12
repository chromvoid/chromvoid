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
import {markMobileKeyboardProgrammaticScroll} from '../../src/shared/services/mobile-keyboard-scroll-intent'
import {ANDROID_KEYBOARD_INSETS_EVENT} from '../../src/app/bootstrap/mobile-keyboard-insets'

function dispatchAndroidKeyboardInsets(detail: Record<string, unknown>) {
  window.dispatchEvent(new CustomEvent(ANDROID_KEYBOARD_INSETS_EVENT, {detail}))
}

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
  document.documentElement.removeAttribute('data-android-native-keyboard-insets')
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
    setScale(nextScale: number) {
      Object.assign(viewport, {scale: nextScale})
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
  return vi.spyOn(element, 'getBoundingClientRect').mockReturnValue(createDOMRect({top, bottom}))
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

function createShadowInputHost() {
  const host = document.createElement('cv-input')
  const shadowRoot = host.shadowRoot ?? host.attachShadow({mode: 'open'})
  const input = document.createElement('input')
  shadowRoot.append(input)

  return {host, input}
}

function dispatchFocusIn(element: HTMLElement) {
  element.dispatchEvent(new Event('focusin', {bubbles: true, composed: true}))
}

function dispatchBeforeInput(element: HTMLElement) {
  element.dispatchEvent(new InputEvent('beforeinput', {bubbles: true, composed: true}))
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

  it('continues reveal on an outer scroller when the nearest scroller clamps', async () => {
    const viewport = installVisualViewportMock(620)
    try {
      const outer = document.createElement('div')
      const inner = document.createElement('div')
      const input = document.createElement('input')
      inner.append(input)
      outer.append(inner)
      document.body.append(outer)
      configureScrollable(outer, {scrollTop: 10, scrollHeight: 1_200, clientHeight: 500})
      configureScrollable(inner, {scrollTop: 80, scrollHeight: 180, clientHeight: 80})
      configureFieldRect(input)
      installScrollableStyleMock([outer, inner])
      setupCoordinator()

      dispatchFocusIn(input)
      await nextFrame()

      expect(inner.scrollTop).toBe(100)
      expect(outer.scrollTop).toBeGreaterThan(10)
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

  it('reveals a newly focused input when the keyboard is already settled open', async () => {
    const viewport = installVisualViewportMock(844)
    try {
      let currentTime = 0
      vi.spyOn(performance, 'now').mockImplementation(() => currentTime)

      const input = document.createElement('input')
      const scroller = appendFieldInScroller(input)
      setupCoordinator()

      viewport.setHeight(620)
      viewport.dispatchResize()
      currentTime = 501

      dispatchFocusIn(input)
      viewport.dispatchResize()
      await nextFrame()

      expect(scroller.scrollTop).toBeGreaterThan(120)
    } finally {
      viewport.restore()
    }
  })

  it('restores native scroll from a settled tap on the already focused visible input', () => {
    const viewport = installVisualViewportMock(620)
    try {
      let currentTime = 0
      vi.spyOn(performance, 'now').mockImplementation(() => currentTime)

      document.documentElement.setAttribute('data-mobile-keyboard-expanded', '')
      const input = document.createElement('input')
      const scroller = appendFieldInScroller(input)
      vi.mocked(input.getBoundingClientRect).mockReturnValue(createDOMRect({top: 200, bottom: 240}))
      setupCoordinator()
      input.focus()
      currentTime = 501

      input.dispatchEvent(createTouchPointerEvent('pointerdown', {clientX: 12, clientY: 220}))
      scroller.scrollTop = 260
      scroller.dispatchEvent(new Event('scroll'))

      expect(scroller.scrollTop).toBe(120)
    } finally {
      viewport.restore()
    }
  })

  it('restores native scroll from typing in an already focused visible input', () => {
    const viewport = installVisualViewportMock(620)
    try {
      let currentTime = 0
      vi.spyOn(performance, 'now').mockImplementation(() => currentTime)

      document.documentElement.setAttribute('data-mobile-keyboard-expanded', '')
      const input = document.createElement('input')
      const scroller = appendFieldInScroller(input)
      vi.mocked(input.getBoundingClientRect).mockReturnValue(createDOMRect({top: 200, bottom: 240}))
      setupCoordinator()
      input.focus()
      currentTime = 501

      dispatchBeforeInput(input)
      scroller.scrollTop = 260
      scroller.dispatchEvent(new Event('scroll'))

      expect(scroller.scrollTop).toBe(120)
    } finally {
      viewport.restore()
    }
  })

  it('guards a focus switch to a visible field against a native recentering jump', () => {
    const viewport = installVisualViewportMock(620)
    try {
      let currentTime = 0
      vi.spyOn(performance, 'now').mockImplementation(() => currentTime)

      document.documentElement.setAttribute('data-mobile-keyboard-expanded', '')
      const first = document.createElement('input')
      const second = document.createElement('input')
      const scroller = appendFieldInScroller(first)
      scroller.append(second)
      vi.mocked(first.getBoundingClientRect).mockReturnValue(createDOMRect({top: 300, bottom: 340}))
      configureFieldRect(second, 200, 240)
      setupCoordinator()
      first.focus()
      currentTime = 501

      second.focus()
      dispatchFocusIn(second)
      // native recentering lands between focus and the first beforeinput
      scroller.scrollTop = 260
      scroller.dispatchEvent(new Event('scroll'))

      expect(scroller.scrollTop).toBe(120)
    } finally {
      viewport.restore()
    }
  })

  it('does not margin-nudge a fully visible field on focus switch under an open keyboard', async () => {
    const viewport = installVisualViewportMock(620)
    try {
      let currentTime = 0
      vi.spyOn(performance, 'now').mockImplementation(() => currentTime)

      document.documentElement.setAttribute('data-mobile-keyboard-expanded', '')
      const first = document.createElement('input')
      const second = document.createElement('input')
      const scroller = appendFieldInScroller(first)
      scroller.append(second)
      vi.mocked(first.getBoundingClientRect).mockReturnValue(createDOMRect({top: 300, bottom: 340}))
      // fully visible but inside the 18px reveal margin (bottom 610 > 620 - 18)
      configureFieldRect(second, 580, 610)
      setupCoordinator()
      first.focus()
      currentTime = 501

      second.focus()
      dispatchFocusIn(second)
      await nextFrame()
      await nextFrame()
      await nextFrame()

      expect(scroller.scrollTop).toBe(120)
    } finally {
      viewport.restore()
    }
  })

  it('restores the native typing jump while the keyboard is still opening', () => {
    const viewport = installVisualViewportMock(620)
    try {
      let currentTime = 0
      vi.spyOn(performance, 'now').mockImplementation(() => currentTime)

      document.documentElement.setAttribute('data-mobile-keyboard-expanded', '')
      const input = document.createElement('input')
      const scroller = appendFieldInScroller(input)
      vi.mocked(input.getBoundingClientRect).mockReturnValue(createDOMRect({top: 200, bottom: 240}))
      setupCoordinator()
      input.focus()
      // first keystroke lands before the 500ms settle window elapses
      currentTime = 120

      dispatchBeforeInput(input)
      scroller.scrollTop = 260
      scroller.dispatchEvent(new Event('scroll'))

      expect(scroller.scrollTop).toBe(120)
    } finally {
      viewport.restore()
    }
  })

  it('keeps typing preserve through an open-keyboard inset resize (IME bar toggle)', () => {
    const viewport = installVisualViewportMock(620)
    try {
      let currentTime = 0
      vi.spyOn(performance, 'now').mockImplementation(() => currentTime)

      const input = document.createElement('input')
      const scroller = appendFieldInScroller(input)
      vi.mocked(input.getBoundingClientRect).mockReturnValue(createDOMRect({top: 200, bottom: 240}))
      setupCoordinator()
      dispatchAndroidKeyboardInsets({
        visible: true,
        bottomInset: 224,
        phase: 'settled',
        source: 'android-native',
        viewportMode: 'overlay',
      })
      input.focus()
      currentTime = 501

      dispatchAndroidKeyboardInsets({
        visible: true,
        bottomInset: 198,
        phase: 'progress',
        source: 'android-native',
        viewportMode: 'overlay',
      })
      dispatchBeforeInput(input)
      scroller.scrollTop = 260
      scroller.dispatchEvent(new Event('scroll'))

      expect(scroller.scrollTop).toBe(120)
    } finally {
      viewport.restore()
    }
  })

  it('does not nudge a fully visible focused field when the open keyboard viewport wobbles', async () => {
    const viewport = installVisualViewportMock(620)
    try {
      let currentTime = 0
      vi.spyOn(performance, 'now').mockImplementation(() => currentTime)

      document.documentElement.setAttribute('data-mobile-keyboard-expanded', '')
      const input = document.createElement('input')
      const scroller = appendFieldInScroller(input)
      const rect = vi.mocked(input.getBoundingClientRect)
      rect.mockReturnValue(createDOMRect({top: 200, bottom: 240}))
      setupCoordinator()

      dispatchFocusIn(input)
      await nextFrame()
      await nextFrame()
      await nextFrame()
      expect(scroller.scrollTop).toBe(120)

      currentTime = 501
      rect.mockReturnValue(createDOMRect({top: 580, bottom: 610}))
      viewport.setHeight(614)
      viewport.dispatchResize()
      await nextFrame()
      await nextFrame()

      expect(scroller.scrollTop).toBe(120)
    } finally {
      viewport.restore()
    }
  })

  it('yields preserve restore when the keyboard inset growth occludes the field', () => {
    const viewport = installVisualViewportMock(620)
    try {
      let currentTime = 0
      vi.spyOn(performance, 'now').mockImplementation(() => currentTime)

      document.documentElement.setAttribute('data-mobile-keyboard-expanded', '')
      const input = document.createElement('input')
      const scroller = appendFieldInScroller(input)
      const rect = vi.mocked(input.getBoundingClientRect)
      rect.mockReturnValue(createDOMRect({top: 200, bottom: 240}))
      setupCoordinator()
      input.focus()
      currentTime = 501

      input.dispatchEvent(createTouchPointerEvent('pointerdown', {clientX: 12, clientY: 220}))
      // suggestion bar grows the keyboard: the visible area itself shrinks
      viewport.setHeight(180)
      scroller.scrollTop = 260
      scroller.dispatchEvent(new Event('scroll'))

      expect(scroller.scrollTop).toBe(260)
    } finally {
      viewport.restore()
    }
  })

  it('reverts a native typing jump that pushes the focused field out of view', () => {
    const viewport = installVisualViewportMock(620)
    try {
      let currentTime = 0
      vi.spyOn(performance, 'now').mockImplementation(() => currentTime)

      document.documentElement.setAttribute('data-mobile-keyboard-expanded', '')
      const input = document.createElement('input')
      const scroller = appendFieldInScroller(input)
      const rect = vi.mocked(input.getBoundingClientRect)
      rect.mockReturnValue(createDOMRect({top: 200, bottom: 240}))
      setupCoordinator()
      input.focus()
      currentTime = 501

      dispatchBeforeInput(input)
      // the native jump itself moves the field out while the viewport is unchanged
      rect.mockReturnValue(createDOMRect({top: 700, bottom: 740}))
      scroller.scrollTop = 260
      scroller.dispatchEvent(new Event('scroll'))

      expect(scroller.scrollTop).toBe(120)
    } finally {
      viewport.restore()
    }
  })

  it('restores the typing jump when input resumes right after a user scroll', () => {
    const viewport = installVisualViewportMock(620)
    try {
      let currentTime = 0
      vi.spyOn(performance, 'now').mockImplementation(() => currentTime)

      document.documentElement.setAttribute('data-mobile-keyboard-expanded', '')
      const input = document.createElement('input')
      const scroller = appendFieldInScroller(input)
      vi.mocked(input.getBoundingClientRect).mockReturnValue(createDOMRect({top: 200, bottom: 240}))
      setupCoordinator()
      input.focus()
      currentTime = 501

      // deliberate user scroll: gesture moves beyond tap tolerance
      document.dispatchEvent(createTouchPointerEvent('pointerdown', {clientX: 12, clientY: 400, pointerId: 7}))
      document.dispatchEvent(createTouchPointerEvent('pointermove', {clientX: 12, clientY: 300, pointerId: 7}))
      scroller.scrollTop = 220
      scroller.dispatchEvent(new Event('scroll'))
      expect(scroller.scrollTop).toBe(220)

      // typing resumes 100ms later — within the old absolute intent window
      currentTime = 601
      dispatchBeforeInput(input)
      scroller.scrollTop = 380
      scroller.dispatchEvent(new Event('scroll'))

      expect(scroller.scrollTop).toBe(220)
    } finally {
      viewport.restore()
    }
  })

  it('pins the user scroll position when typing into a field scrolled out of view', () => {
    const viewport = installVisualViewportMock(620)
    try {
      let currentTime = 0
      vi.spyOn(performance, 'now').mockImplementation(() => currentTime)

      document.documentElement.setAttribute('data-mobile-keyboard-expanded', '')
      const input = document.createElement('input')
      const scroller = appendFieldInScroller(input)
      const rect = vi.mocked(input.getBoundingClientRect)
      rect.mockReturnValue(createDOMRect({top: 200, bottom: 240}))
      setupCoordinator()
      input.focus()
      currentTime = 501

      // user deliberately scrolls the focused field out of view
      document.dispatchEvent(createTouchPointerEvent('pointerdown', {clientX: 12, clientY: 400, pointerId: 7}))
      document.dispatchEvent(createTouchPointerEvent('pointermove', {clientX: 12, clientY: 200, pointerId: 7}))
      rect.mockReturnValue(createDOMRect({top: -300, bottom: -260}))
      scroller.scrollTop = 320
      scroller.dispatchEvent(new Event('scroll'))
      expect(scroller.scrollTop).toBe(320)

      // typing later: the browser yanks the field back into view — revert it
      currentTime = 901
      dispatchBeforeInput(input)
      scroller.scrollTop = 120
      scroller.dispatchEvent(new Event('scroll'))

      expect(scroller.scrollTop).toBe(320)
    } finally {
      viewport.restore()
    }
  })

  it('does not bring back a deliberately scrolled-away field on keyboard wobbles', async () => {
    const viewport = installVisualViewportMock(620)
    try {
      let currentTime = 0
      vi.spyOn(performance, 'now').mockImplementation(() => currentTime)

      document.documentElement.setAttribute('data-mobile-keyboard-expanded', '')
      const input = document.createElement('input')
      const scroller = appendFieldInScroller(input)
      const rect = vi.mocked(input.getBoundingClientRect)
      rect.mockReturnValue(createDOMRect({top: 200, bottom: 240}))
      setupCoordinator()
      input.focus()
      currentTime = 501

      document.dispatchEvent(createTouchPointerEvent('pointerdown', {clientX: 12, clientY: 400, pointerId: 7}))
      document.dispatchEvent(createTouchPointerEvent('pointermove', {clientX: 12, clientY: 200, pointerId: 7}))
      rect.mockReturnValue(createDOMRect({top: -300, bottom: -260}))
      scroller.scrollTop = 320
      scroller.dispatchEvent(new Event('scroll'))

      currentTime = 901
      viewport.setHeight(614)
      viewport.dispatchResize()
      await nextFrame()
      await nextFrame()

      expect(scroller.scrollTop).toBe(320)
    } finally {
      viewport.restore()
    }
  })

  it('does not restore typing scroll when the target geometry grows after beforeinput', () => {
    const viewport = installVisualViewportMock(620)
    try {
      let currentTime = 0
      vi.spyOn(performance, 'now').mockImplementation(() => currentTime)

      document.documentElement.setAttribute('data-mobile-keyboard-expanded', '')
      const input = document.createElement('textarea')
      const scroller = appendFieldInScroller(input)
      vi.mocked(input.getBoundingClientRect).mockReturnValue(createDOMRect({top: 200, bottom: 240, height: 40}))
      setupCoordinator()
      input.focus()
      currentTime = 501

      dispatchBeforeInput(input)
      vi.mocked(input.getBoundingClientRect).mockReturnValue(createDOMRect({top: 200, bottom: 290, height: 90}))
      Object.defineProperty(scroller, 'scrollHeight', {
        configurable: true,
        value: 1_300,
      })
      scroller.scrollTop = 260
      scroller.dispatchEvent(new Event('scroll'))

      expect(scroller.scrollTop).toBe(260)
    } finally {
      viewport.restore()
    }
  })

  it('does not restore settled tap scroll after wheel intent', () => {
    const viewport = installVisualViewportMock(620)
    try {
      let currentTime = 0
      vi.spyOn(performance, 'now').mockImplementation(() => currentTime)

      document.documentElement.setAttribute('data-mobile-keyboard-expanded', '')
      const input = document.createElement('input')
      const scroller = appendFieldInScroller(input)
      vi.mocked(input.getBoundingClientRect).mockReturnValue(createDOMRect({top: 200, bottom: 240}))
      setupCoordinator()
      input.focus()
      currentTime = 501

      input.dispatchEvent(createTouchPointerEvent('pointerdown', {clientX: 12, clientY: 220}))
      document.dispatchEvent(new WheelEvent('wheel', {bubbles: true, cancelable: true}))
      scroller.scrollTop = 260
      scroller.dispatchEvent(new Event('scroll'))

      expect(scroller.scrollTop).toBe(260)
    } finally {
      viewport.restore()
    }
  })

  it('does not let a second touch overwrite the gesture that cancels preserve', () => {
    const viewport = installVisualViewportMock(620)
    try {
      let currentTime = 0
      vi.spyOn(performance, 'now').mockImplementation(() => currentTime)

      document.documentElement.setAttribute('data-mobile-keyboard-expanded', '')
      const input = document.createElement('input')
      const scroller = appendFieldInScroller(input)
      vi.mocked(input.getBoundingClientRect).mockReturnValue(createDOMRect({top: 200, bottom: 240}))
      setupCoordinator()
      input.focus()
      currentTime = 501

      input.dispatchEvent(createTouchPointerEvent('pointerdown', {clientX: 12, clientY: 220, pointerId: 1}))
      input.dispatchEvent(createTouchPointerEvent('pointerdown', {clientX: 20, clientY: 220, pointerId: 2}))
      input.dispatchEvent(createTouchPointerEvent('pointermove', {clientX: 12, clientY: 260, pointerId: 1}))
      scroller.scrollTop = 260
      scroller.dispatchEvent(new Event('scroll'))

      expect(scroller.scrollTop).toBe(260)
    } finally {
      viewport.restore()
    }
  })

  it('does not restore marked programmatic scroll during preserve', () => {
    const viewport = installVisualViewportMock(620)
    try {
      let currentTime = 0
      vi.spyOn(performance, 'now').mockImplementation(() => currentTime)

      document.documentElement.setAttribute('data-mobile-keyboard-expanded', '')
      const input = document.createElement('input')
      const scroller = appendFieldInScroller(input)
      vi.mocked(input.getBoundingClientRect).mockReturnValue(createDOMRect({top: 200, bottom: 240}))
      setupCoordinator()
      input.focus()
      currentTime = 501

      input.dispatchEvent(createTouchPointerEvent('pointerdown', {clientX: 12, clientY: 220}))
      markMobileKeyboardProgrammaticScroll('test')
      scroller.scrollTop = 260
      scroller.dispatchEvent(new Event('scroll'))

      expect(scroller.scrollTop).toBe(260)
    } finally {
      viewport.restore()
    }
  })

  it('restores a document scroller jump while preserving a nested focused field', () => {
    const viewport = installVisualViewportMock(620)
    try {
      let currentTime = 0
      vi.spyOn(performance, 'now').mockImplementation(() => currentTime)

      document.documentElement.setAttribute('data-mobile-keyboard-expanded', '')
      const input = document.createElement('input')
      appendFieldInScroller(input)
      vi.mocked(input.getBoundingClientRect).mockReturnValue(createDOMRect({top: 200, bottom: 240}))
      const documentScroller =
        document.scrollingElement instanceof HTMLElement ? document.scrollingElement : document.documentElement
      documentScroller.scrollTop = 0
      setupCoordinator()
      input.focus()
      currentTime = 501

      input.dispatchEvent(createTouchPointerEvent('pointerdown', {clientX: 12, clientY: 220}))
      documentScroller.scrollTop = 160
      documentScroller.dispatchEvent(new Event('scroll'))

      expect(documentScroller.scrollTop).toBe(0)
    } finally {
      viewport.restore()
    }
  })

  it('does not preserve scroll for an opted-out focused field path', () => {
    const viewport = installVisualViewportMock(620)
    try {
      let currentTime = 0
      vi.spyOn(performance, 'now').mockImplementation(() => currentTime)

      document.documentElement.setAttribute('data-mobile-keyboard-expanded', '')
      const input = document.createElement('input')
      const scroller = appendFieldInScroller(input)
      scroller.setAttribute(MOBILE_KEYBOARD_SCROLL_ATTR, 'off')
      vi.mocked(input.getBoundingClientRect).mockReturnValue(createDOMRect({top: 200, bottom: 240}))
      setupCoordinator()
      input.focus()
      currentTime = 501

      dispatchBeforeInput(input)
      scroller.scrollTop = 260
      scroller.dispatchEvent(new Event('scroll'))

      expect(scroller.scrollTop).toBe(260)
    } finally {
      viewport.restore()
    }
  })

  it('does not treat pinch zoom viewport shrink as keyboard-open preserve state', () => {
    const viewport = installVisualViewportMock(620)
    try {
      let currentTime = 0
      vi.spyOn(performance, 'now').mockImplementation(() => currentTime)
      viewport.setScale(2)

      const input = document.createElement('input')
      const scroller = appendFieldInScroller(input)
      vi.mocked(input.getBoundingClientRect).mockReturnValue(createDOMRect({top: 200, bottom: 240}))
      setupCoordinator()
      input.focus()
      currentTime = 501

      input.dispatchEvent(createTouchPointerEvent('pointerdown', {clientX: 12, clientY: 220}))
      scroller.scrollTop = 260
      scroller.dispatchEvent(new Event('scroll'))

      expect(scroller.scrollTop).toBe(260)
    } finally {
      viewport.restore()
    }
  })

  it('does not restore settled tap scroll after the touch becomes a scroll gesture', () => {
    const viewport = installVisualViewportMock(620)
    try {
      let currentTime = 0
      vi.spyOn(performance, 'now').mockImplementation(() => currentTime)

      document.documentElement.setAttribute('data-mobile-keyboard-expanded', '')
      const input = document.createElement('input')
      const scroller = appendFieldInScroller(input)
      vi.mocked(input.getBoundingClientRect).mockReturnValue(createDOMRect({top: 200, bottom: 240}))
      setupCoordinator()
      input.focus()
      currentTime = 501

      input.dispatchEvent(createTouchPointerEvent('pointerdown', {clientX: 12, clientY: 220}))
      input.dispatchEvent(createTouchPointerEvent('pointermove', {clientX: 12, clientY: 260}))
      scroller.scrollTop = 260
      scroller.dispatchEvent(new Event('scroll'))

      expect(scroller.scrollTop).toBe(260)
    } finally {
      viewport.restore()
    }
  })

  it('keeps correction available after the keyboard settles open', async () => {
    const viewport = installVisualViewportMock(844)
    try {
      let currentTime = 0
      vi.spyOn(performance, 'now').mockImplementation(() => currentTime)

      const input = document.createElement('input')
      const scroller = appendFieldInScroller(input)
      vi.mocked(input.getBoundingClientRect).mockReturnValue(createDOMRect({top: 200, bottom: 240}))
      setupCoordinator()

      dispatchFocusIn(input)
      viewport.setHeight(620)
      viewport.dispatchResize()
      await nextFrame()
      expect(scroller.scrollTop).toBe(120)

      currentTime = 501
      vi.mocked(input.getBoundingClientRect).mockReturnValue(createDOMRect({top: 760, bottom: 820}))
      viewport.dispatchResize()
      await nextFrame()

      expect(scroller.scrollTop).toBeGreaterThan(120)
    } finally {
      viewport.restore()
    }
  })

  it('keeps pending correction when input arrives before keyboard viewport resize', async () => {
    const viewport = installVisualViewportMock(844)
    try {
      const input = document.createElement('input')
      const scroller = appendFieldInScroller(input)
      setupCoordinator()

      dispatchFocusIn(input)
      input.dispatchEvent(new InputEvent('input', {bubbles: true, composed: true}))
      viewport.setHeight(620)
      viewport.dispatchResize()
      await nextFrame()

      expect(scroller.scrollTop).toBeGreaterThan(120)
    } finally {
      viewport.restore()
    }
  })

  it('cancels pending correction before typing when the active shadow host is fully visible', async () => {
    const viewport = installVisualViewportMock(620)
    try {
      document.documentElement.setAttribute('data-mobile-keyboard-expanded', '')
      const {host, input} = createShadowInputHost()
      const scroller = appendFieldInScroller(host)
      vi.mocked(host.getBoundingClientRect).mockReturnValue(createDOMRect({top: 580, bottom: 610}))
      setupCoordinator()

      host.dispatchEvent(new CustomEvent('cv-focus', {bubbles: true, composed: true}))
      dispatchBeforeInput(input)
      await nextFrame()

      expect(scroller.scrollTop).toBe(120)
    } finally {
      viewport.restore()
    }
  })

  it('cancels pending correction from cv-input fallback when the active host is fully visible', async () => {
    const viewport = installVisualViewportMock(620)
    try {
      document.documentElement.setAttribute('data-mobile-keyboard-expanded', '')
      const input = document.createElement('cv-input')
      const scroller = appendFieldInScroller(input)
      vi.mocked(input.getBoundingClientRect).mockReturnValue(createDOMRect({top: 580, bottom: 610}))
      setupCoordinator()

      input.dispatchEvent(new CustomEvent('cv-focus', {bubbles: true, composed: true}))
      input.dispatchEvent(
        new CustomEvent('cv-input', {bubbles: true, composed: true, detail: {value: 'typed'}}),
      )
      await nextFrame()

      expect(scroller.scrollTop).toBe(120)
    } finally {
      viewport.restore()
    }
  })

  it('keeps pending correction when beforeinput arrives before keyboard viewport resize', async () => {
    const viewport = installVisualViewportMock(844)
    try {
      const input = document.createElement('input')
      const scroller = appendFieldInScroller(input)
      setupCoordinator()

      dispatchFocusIn(input)
      dispatchBeforeInput(input)
      viewport.setHeight(620)
      viewport.dispatchResize()
      await nextFrame()

      expect(scroller.scrollTop).toBeGreaterThan(120)
    } finally {
      viewport.restore()
    }
  })

  it('can reveal again after cv-input cancellation if the active UIKit host becomes hidden', async () => {
    const viewport = installVisualViewportMock(620)
    try {
      const input = document.createElement('cv-input')
      const scroller = appendFieldInScroller(input)
      vi.mocked(input.getBoundingClientRect).mockReturnValue(createDOMRect({top: 200, bottom: 240}))
      setupCoordinator()

      input.dispatchEvent(new CustomEvent('cv-focus', {bubbles: true, composed: true}))
      await nextFrame()
      input.dispatchEvent(
        new CustomEvent('cv-input', {bubbles: true, composed: true, detail: {value: 'typed'}}),
      )
      vi.mocked(input.getBoundingClientRect).mockReturnValue(createDOMRect({top: 760, bottom: 820}))
      viewport.dispatchResize()
      await nextFrame()

      expect(scroller.scrollTop).toBeGreaterThan(120)
    } finally {
      viewport.restore()
    }
  })

  it('can reveal again after an already visible active target is tapped and later hidden', async () => {
    const viewport = installVisualViewportMock(620)
    try {
      const input = document.createElement('input')
      const scroller = appendFieldInScroller(input)
      vi.mocked(input.getBoundingClientRect).mockReturnValue(createDOMRect({top: 200, bottom: 240}))
      setupCoordinator()

      dispatchFocusIn(input)
      await nextFrame()
      input.dispatchEvent(createTouchPointerEvent('pointerdown', {clientX: 12, clientY: 12}))
      vi.mocked(input.getBoundingClientRect).mockReturnValue(createDOMRect({top: 760, bottom: 820}))
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
