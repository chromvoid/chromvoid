export function getKeyboardEventPath(event: Event): EventTarget[] {
  const path = typeof event.composedPath === 'function' ? event.composedPath() : []
  if (path.length > 0) return path
  return event.target ? [event.target] : []
}

export function isTextEditingTarget(target: EventTarget | null | undefined): boolean {
  if (!(target instanceof HTMLElement)) return false

  const tagName = target.tagName.toLowerCase()
  if (
    tagName === 'input' ||
    tagName === 'textarea' ||
    tagName === 'select' ||
    tagName === 'cv-input' ||
    tagName === 'cv-number' ||
    tagName === 'cv-textarea'
  ) {
    return true
  }

  const role = target.getAttribute('role')
  return role === 'textbox' || role === 'searchbox' || role === 'combobox' || target.isContentEditable
}

export function eventPathContainsTextEditor(event: Event): boolean {
  return isTextEditingTarget(event.target) || getKeyboardEventPath(event).some(isTextEditingTarget)
}

export function eventPathContainsElement(event: Event, element: Element | null | undefined): boolean {
  if (!element) return false

  return getKeyboardEventPath(event).some((target) => {
    if (target === element) return true
    return target instanceof Node && element.contains(target)
  })
}

export function getDeepActiveElement(root: Document | ShadowRoot = document): Element | null {
  let active: Element | null = root.activeElement
  while (active instanceof HTMLElement && active.shadowRoot?.activeElement) {
    active = active.shadowRoot.activeElement
  }
  return active
}

export function elementContainsDeepActiveElement(
  element: Element | null | undefined,
  root: Document | ShadowRoot = document,
): boolean {
  if (!element) return false

  const active = getDeepActiveElement(root)
  return Boolean(active && (active === element || (active instanceof Node && element.contains(active))))
}
