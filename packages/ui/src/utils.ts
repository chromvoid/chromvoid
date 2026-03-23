/**
 * Утилиты для оптимизации производительности анимаций
 */

/**
 * Управление will-change для оптимизации производительности
 * Автоматически очищает will-change после завершения transition
 */
export class WillChangeManager {
  private static cleanupTimeouts = new WeakMap<Element, number>()

  /**
   * Устанавливает will-change на время анимации
   * @param element - DOM элемент
   * @param properties - свойства для оптимизации (transform, opacity, etc.)
   * @param duration - продолжительность анимации в мс (по умолчанию 300мс)
   */
  static setForAnimation(
    element: HTMLElement,
    properties: string[] = ['transform', 'opacity'],
    duration = 300,
  ): void {
    // Устанавливаем will-change
    element.style.willChange = properties.join(', ')

    // Очищаем предыдущий таймаут если он был
    const existingTimeout = this.cleanupTimeouts.get(element)
    if (existingTimeout) {
      clearTimeout(existingTimeout)
    }

    // Устанавливаем новый таймаут для очистки
    const timeoutId = window.setTimeout(() => {
      element.style.willChange = 'auto'
      this.cleanupTimeouts.delete(element)
    }, duration)

    this.cleanupTimeouts.set(element, timeoutId)
  }

  /**
   * Устанавливает will-change на время hover/focus
   * Автоматически очищает при потере фокуса/hover
   */
  static setForInteraction(
    element: HTMLElement,
    properties: string[] = ['transform', 'box-shadow'],
  ): () => void {
    element.style.willChange = properties.join(', ')

    const cleanup = () => {
      element.style.willChange = 'auto'
      const timeout = this.cleanupTimeouts.get(element)
      if (timeout) {
        clearTimeout(timeout)
        this.cleanupTimeouts.delete(element)
      }
    }

    // Очистка через 100мс после потери взаимодействия
    const timeoutId = window.setTimeout(cleanup, 100)
    this.cleanupTimeouts.set(element, timeoutId)

    return cleanup
  }

  /**
   * Очищает все активные will-change таймауты
   * Вызывать при unmount компонента
   */
  static cleanup(element: HTMLElement): void {
    const timeout = this.cleanupTimeouts.get(element)
    if (timeout) {
      clearTimeout(timeout)
      element.style.willChange = 'auto'
      this.cleanupTimeouts.delete(element)
    }
  }
}

/**
 * Оптимизация для Lit компонентов с автоматической очисткой will-change
 */
export function withWillChangeCleanup<T extends HTMLElement & {disconnectedCallback?: () => void}>(
  component: T,
): T {
  const originalDisconnectedCallback = component.disconnectedCallback

  component.disconnectedCallback = function () {
    // Очищаем все will-change перед удалением компонента
    WillChangeManager.cleanup(this as HTMLElement)

    if (originalDisconnectedCallback) {
      originalDisconnectedCallback.call(this)
    }
  }

  return component
}
