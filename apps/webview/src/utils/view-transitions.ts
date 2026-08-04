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

export type ViewTransitionRunState =
  | 'applied'
  | 'joined-active'
  | 'skipped-ineligible'
  | 'skipped-reduced-motion'
  | 'skipped-unsupported'
  | 'skipped-hidden'
  | 'skipped-missing-target'
  | 'cancelled'

export type ViewTransitionResult = {
  state: ViewTransitionRunState
}

type ViewTransitionError = {
  name?: unknown
  message?: unknown
}

export type ViewTransitionDirection = 'none' | 'forward' | 'back' | 'replace'

export type ViewTransitionPresentation = {
  scope: 'route' | 'mobile-page' | 'mobile-surface' | 'pm-page'
  direction: ViewTransitionDirection
}

export type ViewTransitionTarget = {
  element: HTMLElement | null
  name: string
  required?: boolean
}

export type ViewTransitionRequest = {
  update: () => void | Promise<void>
  settle?: () => void | Promise<void>
  targets?: readonly ViewTransitionTarget[]
  presentation?: ViewTransitionPresentation
}

type ViewTransitionHandle = {
  ready: Promise<void>
  updateCallbackDone: Promise<void>
  finished: Promise<void>
  skipTransition?: () => void
}

type ElementScopedViewTransitionRoot = HTMLElement & {
  startViewTransition?: (options: {
    callback: () => void | Promise<void>
    update?: () => void | Promise<void>
    types?: readonly string[]
  }) => ViewTransitionHandle
}

export type ElementScopedViewTransitionRequest = {
  scope: HTMLElement | null
  update: () => void | Promise<void>
  settle?: () => void | Promise<void>
  enabled?: boolean
  types?: readonly string[]
}

/** Check if View Transition API is available */
export function supportsViewTransitions(): boolean {
  return typeof document !== 'undefined' && typeof document.startViewTransition === 'function'
}

export function supportsElementScopedViewTransitions(
  scope: HTMLElement | null,
): scope is ElementScopedViewTransitionRoot {
  return typeof (scope as ElementScopedViewTransitionRoot | null)?.startViewTransition === 'function'
}

/** Check if user prefers reduced motion */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return true
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function isSkippedViewTransition(error: unknown): boolean {
  const value = error as ViewTransitionError | null
  return (
    value?.name === 'AbortError' ||
    value?.name === 'InvalidStateError' ||
    (typeof value?.message === 'string' && value.message.includes('Transition was skipped'))
  )
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
class ViewTransitionCoordinator {
  private activeTransition: ViewTransitionHandle | null = null
  private readonly pendingRuns: Array<{
    request: ViewTransitionRequest
    resolve: (result: ViewTransitionResult) => void
    reject: (error: unknown) => void
  }> = []
  private busy = false
  private insideUpdateCallback = false

  run(request: ViewTransitionRequest): Promise<ViewTransitionResult> {
    if (this.insideUpdateCallback) {
      return this.runJoined(request)
    }

    const fallbackState = this.getFallbackState(request)
    if (fallbackState) {
      return this.runFallback(request, fallbackState)
    }

    if (!this.busy) {
      this.busy = true
      return this.executeAndDrain(request)
    }

    this.activeTransition?.skipTransition?.()
    return new Promise<ViewTransitionResult>((resolve, reject) => {
      this.pendingRuns.push({request, resolve, reject})
    })
  }

  private executeAndDrain(request: ViewTransitionRequest): Promise<ViewTransitionResult> {
    const run = this.execute(request)
    void run.then(
      () => this.drainQueue(),
      () => this.drainQueue(),
    )
    return run
  }

  private drainQueue(): void {
    const next = this.pendingRuns.shift()
    if (!next) {
      this.busy = false
      return
    }

    const run = this.execute(next.request)
    void run.then(next.resolve, next.reject).then(
      () => this.drainQueue(),
      () => this.drainQueue(),
    )
  }

  private async runJoined(request: ViewTransitionRequest): Promise<ViewTransitionResult> {
    await request.update()
    await request.settle?.()
    return {state: 'joined-active'}
  }

  private getFallbackState(request: ViewTransitionRequest): ViewTransitionRunState | null {
    if (prefersReducedMotion()) return 'skipped-reduced-motion'
    if (!supportsViewTransitions()) return 'skipped-unsupported'
    if (document.visibilityState === 'hidden') return 'skipped-hidden'
    if ((request.targets ?? []).some((target) => target.required !== false && !target.element)) {
      return 'skipped-missing-target'
    }
    return null
  }

  private async runFallback(
    request: ViewTransitionRequest,
    state: ViewTransitionRunState,
  ): Promise<ViewTransitionResult> {
    await this.runUpdate(request)
    return {state}
  }

  private async execute(request: ViewTransitionRequest): Promise<ViewTransitionResult> {
    const targets = request.targets ?? []

    const restorePresentation = this.applyPresentation(request.presentation, targets)

    try {
      const transition = document.startViewTransition(async () => {
        this.insideUpdateCallback = true
        try {
          await this.runUpdate(request)
        } finally {
          this.insideUpdateCallback = false
        }
      }) as ViewTransitionHandle
      this.activeTransition = transition

      const updateCallbackResult = transition.updateCallbackDone.then(
        () => undefined,
        (error: unknown) => error,
      )
      const readyResult = transition.ready.then(
        () => undefined,
        (error: unknown) => error,
      )
      const finishedResult = transition.finished.then(
        () => undefined,
        (error: unknown) => error,
      )

      const readyError = await readyResult
      const updateCallbackError = await updateCallbackResult
      if (updateCallbackError) throw updateCallbackError
      if (readyError && !isSkippedViewTransition(readyError)) throw readyError

      const finishedError = await finishedResult
      if (finishedError) {
        if (!isSkippedViewTransition(finishedError)) throw finishedError
        return {state: 'cancelled'}
      }

      return {state: readyError ? 'cancelled' : 'applied'}
    } finally {
      this.activeTransition = null
      restorePresentation()
    }
  }

  private async runUpdate(request: ViewTransitionRequest): Promise<void> {
    await request.update()
    await request.settle?.()
  }

  private applyPresentation(
    presentation: ViewTransitionPresentation | undefined,
    targets: readonly ViewTransitionTarget[],
  ): () => void {
    const root = document.documentElement
    const previousScope = root.dataset['vtScope']
    const previousDirection = root.dataset['vtDirection']
    const targetStyles = targets.flatMap((target) => {
      if (!target.element) return []
      const previousName = target.element.style.viewTransitionName
      target.element.style.viewTransitionName = target.name
      return [{element: target.element, previousName}]
    })

    if (presentation) {
      root.dataset['vtScope'] = presentation.scope
      root.dataset['vtDirection'] = presentation.direction
    }

    return () => {
      for (const {element, previousName} of targetStyles) {
        element.style.viewTransitionName = previousName
      }

      if (previousScope === undefined) {
        delete root.dataset['vtScope']
      } else {
        root.dataset['vtScope'] = previousScope
      }

      if (previousDirection === undefined) {
        delete root.dataset['vtDirection']
      } else {
        root.dataset['vtDirection'] = previousDirection
      }
    }
  }
}

export const viewTransitionCoordinator = new ViewTransitionCoordinator()

class ElementScopedViewTransitionCoordinator {
  private readonly activeTransitions = new WeakMap<HTMLElement, ViewTransitionHandle>()
  private readonly updatingScopes = new WeakSet<HTMLElement>()

  async run(request: ElementScopedViewTransitionRequest): Promise<ViewTransitionResult> {
    let updatePromise: Promise<void> | undefined
    const runUpdateOnce = () => (updatePromise ??= this.runUpdate(request))
    const {scope} = request
    if (!scope) return this.runFallback(runUpdateOnce, 'skipped-missing-target')
    if (this.updatingScopes.has(scope)) {
      await runUpdateOnce()
      return {state: 'joined-active'}
    }

    const fallbackState = this.getFallbackState(request)
    if (fallbackState) return this.runFallback(runUpdateOnce, fallbackState)

    const transitionRoot = scope as ElementScopedViewTransitionRoot
    this.activeTransitions.get(scope)?.skipTransition?.()

    let transition: ViewTransitionHandle
    try {
      const callback = async () => {
        this.updatingScopes.add(scope)
        try {
          await runUpdateOnce()
        } finally {
          this.updatingScopes.delete(scope)
        }
      }
      transition = transitionRoot.startViewTransition!({
        callback,
        update: callback,
        ...(request.types ? {types: request.types} : {}),
      })
    } catch {
      await runUpdateOnce()
      return {state: 'skipped-unsupported'}
    }
    this.activeTransitions.set(scope, transition)

    try {
      const [readyError, updateError] = await Promise.all([
        transition.ready.then(
          () => undefined,
          (error: unknown) => error,
        ),
        transition.updateCallbackDone.then(
          () => undefined,
          (error: unknown) => error,
        ),
      ])
      if (updateError) throw updateError
      if (readyError && !isSkippedViewTransition(readyError)) throw readyError

      const finishedError = await transition.finished.then(
        () => undefined,
        (error: unknown) => error,
      )
      if (finishedError && !isSkippedViewTransition(finishedError)) throw finishedError
      return {state: readyError || finishedError ? 'cancelled' : 'applied'}
    } finally {
      if (this.activeTransitions.get(scope) === transition) {
        this.activeTransitions.delete(scope)
      }
    }
  }

  private getFallbackState(
    request: ElementScopedViewTransitionRequest,
  ): ViewTransitionRunState | null {
    if (request.enabled === false) return 'skipped-ineligible'
    if (prefersReducedMotion()) return 'skipped-reduced-motion'
    if (!supportsElementScopedViewTransitions(request.scope)) return 'skipped-unsupported'
    if (document.visibilityState === 'hidden') return 'skipped-hidden'
    return null
  }

  private async runFallback(
    update: () => Promise<void>,
    state: ViewTransitionRunState,
  ): Promise<ViewTransitionResult> {
    await update()
    return {state}
  }

  private async runUpdate(request: ElementScopedViewTransitionRequest): Promise<void> {
    await request.update()
    await request.settle?.()
  }
}

export const elementScopedViewTransitionCoordinator = new ElementScopedViewTransitionCoordinator()

export function viewTransition(
  updateCallback: () => void | Promise<void>,
): Promise<ViewTransitionResult> {
  return viewTransitionCoordinator.run({update: updateCallback})
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

function readViewTransitionName(element: HTMLElement): string {
  const inlineName = element.style.viewTransitionName
  if (inlineName) {
    return inlineName
  }

  if (typeof getComputedStyle !== 'function') {
    return ''
  }

  return getComputedStyle(element).viewTransitionName
}

export function getViewTransitionNameOwners(
  name: string,
  root: ParentNode = document,
): HTMLElement[] {
  const elements: Element[] = []

  if (root instanceof HTMLElement) {
    elements.push(root)
  }

  elements.push(...Array.from(root.querySelectorAll('*')))

  return elements.filter(
    (element): element is HTMLElement =>
      element instanceof HTMLElement && readViewTransitionName(element) === name,
  )
}

function warnDuplicateViewTransitionName(name: string, owners: HTMLElement[]): void {
  if (typeof window !== 'undefined' && window.env === 'prod') {
    return
  }

  console.warn('[chromvoid][view-transition] duplicate view-transition-name owner', {
    name,
    owners: owners.length,
  })
}

/**
 * Temporarily sets a view-transition-name, runs the callback, then clears it.
 * Useful for one-shot transitions where the element shouldn't always participate.
 */
export async function withViewTransitionName(
  element: HTMLElement | null,
  name: string,
  callback: () => void | Promise<void>,
): Promise<ViewTransitionResult> {
  if (!element) {
    return viewTransition(callback)
  }

  const duplicateOwners = getViewTransitionNameOwners(name).filter((owner) => owner !== element)
  if (duplicateOwners.length > 0) {
    warnDuplicateViewTransitionName(name, duplicateOwners)
    return viewTransition(callback)
  }

  return viewTransitionCoordinator.run({
    update: callback,
    targets: [{element, name}],
  })
}
