import {
  KEYBOARD_BOTTOM_INSET_VIEWPORT_RATIO,
  MIN_KEYBOARD_BOTTOM_INSET,
  MIN_SCROLL_ADJUSTMENT_PX,
  MOBILE_KEYBOARD_SCROLL_CONTAINER_ATTR,
  VISUAL_VIEWPORT_FIELD_MARGIN_PX,
} from './constants'
import {
  findComposedAncestor,
  getComposedParent,
} from './text-field-targets'
import {
  MOBILE_KEYBOARD_NATIVE_RESIZE_ATTR,
} from '../mobile-keyboard-insets'

const SCROLLABLE_OVERFLOW_RE = /^(auto|scroll|overlay)$/

export type MobileKeyboardVisibleRect = {
  readonly top: number
  readonly bottom: number
}

export type MobileKeyboardVisibleScrollContainer = {
  readonly scroller: HTMLElement
  readonly top: number
  readonly bottom: number
}

export type ScrollAdjustment = {
  readonly scroller: HTMLElement
  readonly scrollTop: number
}

export const readRootCssPx = (name: string): number => {
  const value = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name))
  return Number.isFinite(value) && value > 0 ? value : 0
}

const getPositiveViewportDimension = (value: number | undefined): number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0

export const getLayoutViewportHeight = (): number => {
  const rootHeight = getPositiveViewportDimension(document.documentElement.clientHeight)
  const windowHeight = getPositiveViewportDimension(window.innerHeight)

  return rootHeight || windowHeight
}

export const getVisualViewportKeyboardInset = (): number => {
  const visualViewport = window.visualViewport
  if (!visualViewport) return 0

  const layoutHeight = getLayoutViewportHeight()
  const viewportTop = getPositiveViewportDimension(visualViewport.offsetTop)
  const viewportHeight = getPositiveViewportDimension(visualViewport.height)
  if (layoutHeight <= 0 || viewportHeight <= 0) return 0

  const inset = layoutHeight - (viewportHeight + viewportTop)
  return inset > MIN_SCROLL_ADJUSTMENT_PX ? Math.round(inset) : 0
}

export const isLikelyVisualViewportKeyboardInset = (inset: number): boolean => {
  const layoutHeight = getLayoutViewportHeight()
  if (!Number.isFinite(layoutHeight) || layoutHeight <= 0) return false
  const threshold = Math.max(
    MIN_KEYBOARD_BOTTOM_INSET,
    Math.round(layoutHeight * KEYBOARD_BOTTOM_INSET_VIEWPORT_RATIO),
  )
  return inset >= threshold
}

export const getMobileKeyboardVisibleRect = (): MobileKeyboardVisibleRect | null => {
  const visualViewport = window.visualViewport
  const layoutHeight = getLayoutViewportHeight()
  const viewportTop = visualViewport ? getPositiveViewportDimension(visualViewport.offsetTop) : 0
  const viewportHeight = visualViewport
    ? getPositiveViewportDimension(visualViewport.height)
    : getPositiveViewportDimension(window.innerHeight) || layoutHeight

  if (viewportHeight <= 0 && layoutHeight <= 0) return null

  const visualBottom = viewportHeight > 0 ? viewportTop + viewportHeight : layoutHeight
  const root = document.documentElement
  const nativeResize = root.hasAttribute(MOBILE_KEYBOARD_NATIVE_RESIZE_ATTR)
  const nativeKeyboardInset = nativeResize ? 0 : readRootCssPx('--native-keyboard-bottom-inset')
  const overlayInset = Math.max(
    readRootCssPx('--mobile-keyboard-scroll-clearance'),
    readRootCssPx('--mobile-keyboard-overlay-offset'),
    readRootCssPx('--visual-viewport-bottom-inset'),
    nativeKeyboardInset,
  )
  const insetBottom = layoutHeight > 0 && overlayInset > 0 ? layoutHeight - overlayInset : visualBottom
  const bottom = Math.min(visualBottom, insetBottom)

  return bottom > viewportTop ? {top: viewportTop, bottom} : null
}

export const getDocumentScroller = (): HTMLElement => {
  return document.scrollingElement instanceof HTMLElement
    ? document.scrollingElement
    : document.documentElement
}

export const isDocumentScroller = (element: HTMLElement): boolean =>
  element === document.scrollingElement || element === document.documentElement || element === document.body

export const isScrollableY = (element: HTMLElement): boolean => {
  const style = getComputedStyle(element)
  return (
    SCROLLABLE_OVERFLOW_RE.test(style.overflowY) &&
    element.scrollHeight - element.clientHeight > MIN_SCROLL_ADJUSTMENT_PX
  )
}

export const getMobileKeyboardScrollContainer = (target: HTMLElement): HTMLElement => {
  const explicitContainer = findComposedAncestor(
    target,
    (candidate) => candidate.hasAttribute(MOBILE_KEYBOARD_SCROLL_CONTAINER_ATTR),
    {includeSelf: false},
  )
  if (explicitContainer) return explicitContainer

  const scrollableAncestor = findComposedAncestor(target, isScrollableY, {includeSelf: false})
  return scrollableAncestor ?? getDocumentScroller()
}

export const getMobileKeyboardScrollerChain = (target: HTMLElement): HTMLElement[] => {
  const chain: HTMLElement[] = []
  const first = getMobileKeyboardScrollContainer(target)
  let current: HTMLElement | null = first
  const documentScroller = getDocumentScroller()

  while (current) {
    if (!chain.includes(current) && (current === first || isScrollableY(current) || isDocumentScroller(current))) {
      chain.push(current)
    }
    if (isDocumentScroller(current)) break
    current = getComposedParent(current)
  }

  if (!chain.includes(documentScroller)) chain.push(documentScroller)
  return chain
}

export const clampScrollTop = (scroller: HTMLElement, scrollTop: number): number => {
  const maxScrollTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight)
  return Math.min(maxScrollTop, Math.max(0, scrollTop))
}

export const getVisibleScrollContainerForScroller = (
  scroller: HTMLElement,
): MobileKeyboardVisibleScrollContainer | null => {
  const visibleRect = getMobileKeyboardVisibleRect()
  if (!visibleRect) return null

  const scrollerRect = scroller.getBoundingClientRect()
  const top = isDocumentScroller(scroller)
    ? visibleRect.top
    : Math.max(scrollerRect.top, visibleRect.top)
  const bottom = isDocumentScroller(scroller)
    ? visibleRect.bottom
    : Math.min(scrollerRect.bottom, visibleRect.bottom)

  return bottom > top ? {scroller, top, bottom} : null
}

export const getMobileKeyboardVisibleScrollContainer = (
  target: HTMLElement,
): MobileKeyboardVisibleScrollContainer | null => {
  return getVisibleScrollContainerForScroller(getMobileKeyboardScrollContainer(target))
}

const getScrollDeltaForVisibleContainer = (
  target: HTMLElement,
  visibleContainer: MobileKeyboardVisibleScrollContainer,
): number => {
  const targetRect = target.getBoundingClientRect()
  const visibleTop = visibleContainer.top + VISUAL_VIEWPORT_FIELD_MARGIN_PX
  const visibleBottom = visibleContainer.bottom - VISUAL_VIEWPORT_FIELD_MARGIN_PX

  if (visibleBottom <= visibleTop) return 0

  const bottomOverflow = targetRect.bottom - visibleBottom
  const topOverflow = visibleTop - targetRect.top
  return bottomOverflow > 0 ? bottomOverflow : topOverflow > 0 ? -topOverflow : 0
}

export const getMobileKeyboardScrollAdjustment = (target: HTMLElement): ScrollAdjustment | null => {
  const visibleContainer = getMobileKeyboardVisibleScrollContainer(target)
  if (!visibleContainer) return null

  const scrollDelta = getScrollDeltaForVisibleContainer(target, visibleContainer)
  if (Math.abs(scrollDelta) <= MIN_SCROLL_ADJUSTMENT_PX) return null

  const nextScrollTop = clampScrollTop(
    visibleContainer.scroller,
    visibleContainer.scroller.scrollTop + scrollDelta,
  )
  if (Math.abs(nextScrollTop - visibleContainer.scroller.scrollTop) <= MIN_SCROLL_ADJUSTMENT_PX) {
    return null
  }

  return {scroller: visibleContainer.scroller, scrollTop: nextScrollTop}
}

export const computeMobileKeyboardRevealAdjustments = (target: HTMLElement): ScrollAdjustment[] => {
  const adjustments: ScrollAdjustment[] = []
  let remainingDelta: number | null = null

  for (const scroller of getMobileKeyboardScrollerChain(target)) {
    const visibleContainer = getVisibleScrollContainerForScroller(scroller)
    if (!visibleContainer) continue

    const scrollDelta: number = remainingDelta ?? getScrollDeltaForVisibleContainer(target, visibleContainer)
    if (Math.abs(scrollDelta) <= MIN_SCROLL_ADJUSTMENT_PX) break

    const nextScrollTop = clampScrollTop(scroller, scroller.scrollTop + scrollDelta)
    const appliedDelta = nextScrollTop - scroller.scrollTop
    if (Math.abs(appliedDelta) > MIN_SCROLL_ADJUSTMENT_PX) {
      adjustments.push({scroller, scrollTop: nextScrollTop})
    }

    remainingDelta = scrollDelta - appliedDelta
    if (Math.abs(remainingDelta) <= MIN_SCROLL_ADJUSTMENT_PX) break
  }

  return adjustments
}

export const applyMobileKeyboardScrollAdjustments = (adjustments: readonly ScrollAdjustment[]): boolean => {
  let changed = false
  for (const adjustment of adjustments) {
    if (Math.abs(adjustment.scroller.scrollTop - adjustment.scrollTop) <= MIN_SCROLL_ADJUSTMENT_PX) {
      continue
    }
    adjustment.scroller.scrollTop = adjustment.scrollTop
    changed = true
  }

  return changed
}

export const scrollMobileKeyboardTargetIntoView = (target: HTMLElement): boolean =>
  applyMobileKeyboardScrollAdjustments(computeMobileKeyboardRevealAdjustments(target))

export const isMobileKeyboardTargetFullyVisible = (target: HTMLElement): boolean => {
  const visibleContainer = getMobileKeyboardVisibleScrollContainer(target)
  if (!visibleContainer) return false

  const targetRect = target.getBoundingClientRect()

  return (
    targetRect.top >= visibleContainer.top - MIN_SCROLL_ADJUSTMENT_PX &&
    targetRect.bottom <= visibleContainer.bottom + MIN_SCROLL_ADJUSTMENT_PX
  )
}
