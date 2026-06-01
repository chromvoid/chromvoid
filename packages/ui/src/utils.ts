/**Utilities to optimize animation performance
*/

/**Managing will-change to optimize performance
Automatically clears will-change after transition
*/
export class WillChangeManager {
  private static cleanupTimeouts = new WeakMap<Element, number>()

  /*** Set will-change during animation
* @param element - DOM element
* @param properties - properties for optimization (transform, opacity, etc.)
* @param duration - animation duration in ms (by default 300ms)
*/
  static setForAnimation(
    element: HTMLElement,
    properties: string[] = ['transform', 'opacity'],
    duration = 300,
  ): void {
    // Installing will-change
    element.style.willChange = properties.join(', ')

    // We cleaned the previous timeout if it was
    const existingTimeout = this.cleanupTimeouts.get(element)
    if (existingTimeout) {
      clearTimeout(existingTimeout)
    }

    // Set a new timeout for cleaning
    const timeoutId = window.setTimeout(() => {
      element.style.willChange = 'auto'
      this.cleanupTimeouts.delete(element)
    }, duration)

    this.cleanupTimeouts.set(element, timeoutId)
  }

  /**Set will-change for hover/focus
Automatically cleans when focus is lost/hover
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

    // Cleaning in 100ms after loss of interaction
    const timeoutId = window.setTimeout(cleanup, 100)
    this.cleanupTimeouts.set(element, timeoutId)

    return cleanup
  }

  /**Clears all active will-change timeouts
*Call at unmount component
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

/**Optimization for Lit components with automatic will-change cleaning
*/
export function withWillChangeCleanup<T extends HTMLElement & {disconnectedCallback?: () => void}>(
  component: T,
): T {
  const originalDisconnectedCallback = component.disconnectedCallback

  component.disconnectedCallback = function () {
    // Clean all will-change before removing the component
    WillChangeManager.cleanup(this as HTMLElement)

    if (originalDisconnectedCallback) {
      originalDisconnectedCallback.call(this)
    }
  }

  return component
}
