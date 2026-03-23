/**
 * Утилиты для accessibility диалогов
 */

/**
 * Announce текст для screen readers
 */
export function announce(message: string, priority: 'polite' | 'assertive' = 'polite') {
  const announcer = document.createElement('div')
  announcer.setAttribute('aria-live', priority)
  announcer.setAttribute('aria-atomic', 'true')
  announcer.className = 'visually-hidden'

  document.body.appendChild(announcer)

  // Небольшая задержка чтобы screen reader успел подготовиться
  setTimeout(() => {
    announcer.textContent = message

    // Удаляем через 1 секунду
    setTimeout(() => {
      if (document.body.contains(announcer)) {
        document.body.removeChild(announcer)
      }
    }, 1000)
  }, 100)
}

/**
 * Утилита для управления inert состоянием всех элементов страницы кроме диалога
 */
export class InertManager {
  private inertElements: Element[] = []

  /**
   * Делает все элементы страницы inert кроме указанного
   */
  setInertExcept(exceptElement: Element) {
    this.restoreAll() // Сначала восстанавливаем предыдущее состояние

    const bodyChildren = Array.from(document.body.children)

    for (const element of bodyChildren) {
      // Пропускаем исключенный элемент и уже inert элементы
      if (element !== exceptElement && !element.hasAttribute('inert')) {
        element.setAttribute('inert', '')
        this.inertElements.push(element)
      }
    }
  }

  /**
   * Восстанавливает все элементы из inert состояния
   */
  restoreAll() {
    for (const element of this.inertElements) {
      element.removeAttribute('inert')
    }
    this.inertElements = []
  }
}

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
