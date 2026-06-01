import {writeAndroidUnlockDebug} from './android-unlock-debug'
import {PASSWORD_INPUT_DIALOG_KEYBOARD_OFFSET_VAR} from './mobile-dialog-keyboard-stabilization'

export const PASSWORD_INPUT_DIALOG_DEBUG_ATTR = 'data-password-input-dialog-debug'
export const PASSWORD_INPUT_DIALOG_DEBUG_STORAGE_KEY = 'chromvoid:password-input-dialog-debug'

type ElementDebugBox = {
  tag: string
  className: string
  top: number
  bottom: number
  left: number
  right: number
  width: number
  height: number
  transform: string
  transition: string
  display: string
  position: string
  paddingBlockStart: string
  paddingBlockEnd: string
  maxBlockSize: string
  blockSize: string
}

function getRoot(): HTMLElement | null {
  return typeof document === 'undefined' ? null : document.documentElement
}

function readDebugOverride(): string | null {
  try {
    if (typeof localStorage === 'undefined') {
      return null
    }

    return localStorage.getItem(PASSWORD_INPUT_DIALOG_DEBUG_STORAGE_KEY)
  } catch {
    return null
  }
}

export function isPasswordInputDialogDebugRequested(): boolean {
  const override = readDebugOverride()
  return override === '1' || override === 'true'
}

export function enablePasswordInputDialogDebug(): void {
  const root = getRoot()
  if (!root || !isPasswordInputDialogDebugRequested()) return

  root.setAttribute(PASSWORD_INPUT_DIALOG_DEBUG_ATTR, '')
}

export function disablePasswordInputDialogDebug(): void {
  getRoot()?.removeAttribute(PASSWORD_INPUT_DIALOG_DEBUG_ATTR)
}

export function isPasswordInputDialogDebugActive(): boolean {
  return Boolean(getRoot()?.hasAttribute(PASSWORD_INPUT_DIALOG_DEBUG_ATTR))
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}

function readCssNumber(style: CSSStyleDeclaration, property: string): number | null {
  const value = Number.parseFloat(style.getPropertyValue(property))
  return Number.isFinite(value) ? value : null
}

export function readVisualViewportDebugSnapshot(): Record<string, unknown> {
  const root = document.documentElement
  const rootStyle = getComputedStyle(root)
  const viewport = window.visualViewport

  return {
    rootClientHeight: root.clientHeight,
    rootClientWidth: root.clientWidth,
    windowInnerHeight: window.innerHeight,
    windowInnerWidth: window.innerWidth,
    visualViewportHeight: viewport ? round(viewport.height) : null,
    visualViewportWidth: viewport ? round(viewport.width) : null,
    visualViewportOffsetTop: viewport ? round(viewport.offsetTop) : null,
    visualViewportOffsetLeft: viewport ? round(viewport.offsetLeft) : null,
    visualViewportPageTop: viewport ? round(viewport.pageTop) : null,
    visualViewportPageLeft: viewport ? round(viewport.pageLeft) : null,
    visualViewportScale: viewport ? round(viewport.scale) : null,
    cssVisualViewportBottomInset: readCssNumber(rootStyle, '--visual-viewport-bottom-inset'),
    cssPasswordDialogKeyboardOffset: readCssNumber(rootStyle, PASSWORD_INPUT_DIALOG_KEYBOARD_OFFSET_VAR),
    cssSafeAreaBottom: readCssNumber(rootStyle, '--safe-area-bottom'),
    cssSafeAreaBottomActive: readCssNumber(rootStyle, '--safe-area-bottom-active'),
    cssAppPadding: readCssNumber(rootStyle, '--app-padding'),
    visualViewportShrunken: root.hasAttribute('data-visual-viewport-shrunken'),
    mobileKeyboardExpanded: root.hasAttribute('data-mobile-keyboard-expanded'),
  }
}

export function readElementDebugBox(element: Element | null | undefined): ElementDebugBox | null {
  if (!(element instanceof HTMLElement)) return null

  const rect = element.getBoundingClientRect()
  const style = getComputedStyle(element)

  return {
    tag: element.tagName.toLowerCase(),
    className: element.className,
    top: round(rect.top),
    bottom: round(rect.bottom),
    left: round(rect.left),
    right: round(rect.right),
    width: round(rect.width),
    height: round(rect.height),
    transform: style.transform,
    transition: style.transition,
    display: style.display,
    position: style.position,
    paddingBlockStart: style.paddingBlockStart,
    paddingBlockEnd: style.paddingBlockEnd,
    maxBlockSize: style.maxBlockSize,
    blockSize: style.blockSize,
  }
}

export function writeMobileDialogDebug(scope: string, event: string, meta?: Record<string, unknown>): void {
  if (!isPasswordInputDialogDebugActive()) return

  writeAndroidUnlockDebug(scope, event, {
    perf_ms:
      typeof performance !== 'undefined' && typeof performance.now === 'function'
        ? round(performance.now())
        : undefined,
    viewport: readVisualViewportDebugSnapshot(),
    ...meta,
  })
}
