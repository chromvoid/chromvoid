function isElementVisible(element: HTMLElement): boolean {
  if (element.offsetWidth === 0 && element.offsetHeight === 0) {
    return false
  }
  const style = window.getComputedStyle(element)
  return style.visibility !== 'hidden' && style.display !== 'none'
}

const STANDARD_FOCUSABLE_SELECTORS = [
  'a[href]',
  'area[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'button:not([disabled])',
  'iframe',
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable]',
].join(',')

const INPUT_LIKE_COMPONENTS = ['cv-input', 'cv-number', 'cv-textarea', 'cv-select']

/**
 * Finds first focusable element in container.
 * Priority: autofocus > input-like web components > standard focusable elements.
 * Supports Shadow DOM traversal.
 */
export function findFirstFocusableElement(container: Element): HTMLElement | null {
  const autofocusElement = container.querySelector('[autofocus]') as HTMLElement | null
  if (autofocusElement && isElementVisible(autofocusElement)) {
    return autofocusElement
  }

  if (container.shadowRoot) {
    const shadowAutofocus = container.shadowRoot.querySelector('[autofocus]') as HTMLElement | null
    if (shadowAutofocus && isElementVisible(shadowAutofocus)) {
      return shadowAutofocus
    }
  }

  for (const tagName of INPUT_LIKE_COMPONENTS) {
    const component = container.querySelector(tagName) as HTMLElement | null
    if (component && isElementVisible(component)) {
      return component
    }
  }

  const elements = container.querySelectorAll(STANDARD_FOCUSABLE_SELECTORS)
  for (const element of elements) {
    const htmlElement = element as HTMLElement
    if (isElementVisible(htmlElement)) {
      return htmlElement
    }
  }

  for (const child of container.children) {
    if (child.shadowRoot) {
      const found = findFirstFocusableElement(child)
      if (found) return found
    }
  }

  return null
}
