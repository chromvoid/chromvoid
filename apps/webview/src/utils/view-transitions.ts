/**
 * View Transition API utilities.
 *
 * Provides a thin, progressive-enhancement wrapper around
 * document.startViewTransition. Falls back to instant updates
 * when the API is unavailable or the user prefers reduced motion.
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/API/View_Transition_API
 *
 * @example
 * // Basic usage - wrap DOM mutations in the callback
 * await viewTransition(() => {
 *   this.currentPage = 'dashboard'
 *   this.requestUpdate()
 * })
 *
 * // With custom transition name
 * setViewTransitionName(element, 'gallery-image')
 */

/** Check if View Transition API is available */
export function supportsViewTransitions(): boolean {
  return typeof document !== 'undefined' && 'startViewTransition' in document
}

/** Check if user prefers reduced motion */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return true
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * Wraps a DOM update in a View Transition.
 * Falls back to immediate execution when unsupported or reduced motion.
 *
 * IMPORTANT: The callback should contain the actual DOM mutation.
 * The browser will:
 * 1. Snapshot the current state
 * 2. Execute your callback (DOM changes)
 * 3. Snapshot the new state
 * 4. Animate between the two states
 */
export async function viewTransition(updateCallback: () => void | Promise<void>): Promise<void> {
  // Skip transitions when reduced motion is preferred
  if (prefersReducedMotion()) {
    await updateCallback()
    return
  }

  // Fallback for browsers without View Transition API
  if (!supportsViewTransitions()) {
    await updateCallback()
    return
  }

  // Call startViewTransition on document directly to preserve `this` context
  const transition = (document as any).startViewTransition(async () => {
    await updateCallback()
  })

  try {
    await transition.finished
  } catch {
    // Transition was skipped or cancelled - this is normal behavior
    // (e.g., when page is hidden, or another transition starts)
  }
}

/**
 * Sets view-transition-name on an element for cross-fade animations.
 * Clears the name when value is null/undefined.
 *
 * IMPORTANT: Each view-transition-name must be unique on the page.
 * Duplicate names cause undefined behavior.
 */
export function setViewTransitionName(element: HTMLElement | null, name: string | null): void {
  if (!element) return

  if (name) {
    element.style.viewTransitionName = name
  } else {
    element.style.viewTransitionName = ''
  }
}

/**
 * Temporarily sets a view-transition-name, runs the callback, then clears it.
 * Useful for one-shot transitions where the element shouldn't always participate.
 */
export async function withViewTransitionName(
  element: HTMLElement | null,
  name: string,
  callback: () => void | Promise<void>,
): Promise<void> {
  if (!element) {
    await callback()
    return
  }

  setViewTransitionName(element, name)

  try {
    await viewTransition(callback)
  } finally {
    // Wait for transition to complete before removing the name
    // Using finished promise would be better, but this is a reasonable fallback
    requestAnimationFrame(() => {
      setViewTransitionName(element, null)
    })
  }
}
