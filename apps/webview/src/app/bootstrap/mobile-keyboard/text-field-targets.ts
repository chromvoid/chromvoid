import {
  MOBILE_KEYBOARD_SCROLL_ATTR,
  MOBILE_KEYBOARD_SCROLL_OFF_VALUE,
} from './constants'

export type TextInputLikeOptions = {
  readonly includeSelect?: boolean
}

export const TEXT_FIELD_HOST_TAGS: ReadonlySet<string> = new Set([
  'cv-input',
  'cv-textarea',
  'cv-number',
  'cv-combobox',
])

const NON_TEXT_INPUT_TYPES: ReadonlySet<string> = new Set([
  'button',
  'submit',
  'reset',
  'checkbox',
  'radio',
  'range',
  'color',
  'file',
  'image',
  'hidden',
])

export const nowMs = (): number =>
  typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now()

export const roundDebugNumber = (value: number): number =>
  Number.isFinite(value) ? Math.round(value * 100) / 100 : value

export const getPathElements = (event: Event): HTMLElement[] => {
  const path = typeof event.composedPath === 'function' ? event.composedPath() : [event.target]
  return path.filter((node): node is HTMLElement => node instanceof HTMLElement)
}

export const getComposedParent = (element: HTMLElement): HTMLElement | null => {
  if (element.parentElement) return element.parentElement

  const root = element.getRootNode()
  if (root instanceof ShadowRoot && root.host instanceof HTMLElement) {
    return root.host
  }

  return null
}

export const findComposedAncestor = (
  element: HTMLElement,
  predicate: (candidate: HTMLElement) => boolean,
  {includeSelf}: {includeSelf: boolean},
): HTMLElement | null => {
  let current: HTMLElement | null = includeSelf ? element : getComposedParent(element)
  while (current) {
    if (predicate(current)) return current
    current = getComposedParent(current)
  }

  return null
}

const isDisabledOrReadonly = (element: HTMLElement): boolean => {
  const formLikeElement = element as HTMLElement & {
    disabled?: boolean
    readonly?: boolean
    readOnly?: boolean
  }
  return (
    formLikeElement.disabled === true ||
    formLikeElement.readonly === true ||
    formLikeElement.readOnly === true ||
    element.matches('[disabled], [readonly], [aria-disabled="true"]')
  )
}

const isContentEditableTarget = (element: HTMLElement): boolean =>
  element.isContentEditable || element.getAttribute('contenteditable') === 'true'

export const isTextInputLike = (
  element: HTMLElement,
  options: TextInputLikeOptions = {},
): boolean => {
  if (isContentEditableTarget(element)) return true
  if (isDisabledOrReadonly(element)) return false

  const tagName = element.localName
  if (TEXT_FIELD_HOST_TAGS.has(tagName)) return true
  if (element instanceof HTMLTextAreaElement) return true
  if (options.includeSelect && element instanceof HTMLSelectElement) return true
  if (!(element instanceof HTMLInputElement)) return false

  return !NON_TEXT_INPUT_TYPES.has(element.type.toLowerCase())
}

export const isMobileKeyboardScrollTarget = (element: HTMLElement): boolean =>
  isTextInputLike(element, {includeSelect: false})

export const getMobileKeyboardScrollTargetFromPath = (
  pathElements: readonly HTMLElement[],
): HTMLElement | null => {
  const customElementTarget = pathElements.find(
    (element) => TEXT_FIELD_HOST_TAGS.has(element.localName) && isMobileKeyboardScrollTarget(element),
  )
  if (customElementTarget) return customElementTarget

  return pathElements.find(isMobileKeyboardScrollTarget) ?? null
}

export const getDeepActiveElement = (): HTMLElement | null => {
  let active: Element | null = document.activeElement
  while (active instanceof HTMLElement && active.shadowRoot?.activeElement) {
    active = active.shadowRoot.activeElement
  }

  return active instanceof HTMLElement ? active : null
}

export const getActiveMobileKeyboardTarget = (): HTMLElement | null => {
  const active = getDeepActiveElement()
  if (!active) return null

  const customHost = findComposedAncestor(
    active,
    (candidate) => TEXT_FIELD_HOST_TAGS.has(candidate.localName) && isMobileKeyboardScrollTarget(candidate),
    {includeSelf: true},
  )
  if (customHost) return customHost

  return isMobileKeyboardScrollTarget(active) ? active : null
}

export const isKeyboardScrollOptedOut = (
  element: HTMLElement,
  pathElements: readonly HTMLElement[],
): boolean => {
  if (
    pathElements.some(
      (candidate) => candidate.getAttribute(MOBILE_KEYBOARD_SCROLL_ATTR) === MOBILE_KEYBOARD_SCROLL_OFF_VALUE,
    )
  ) {
    return true
  }

  return Boolean(
    findComposedAncestor(
      element,
      (candidate) =>
        candidate.getAttribute(MOBILE_KEYBOARD_SCROLL_ATTR) === MOBILE_KEYBOARD_SCROLL_OFF_VALUE,
      {includeSelf: true},
    ),
  )
}
