import {render, type TemplateResult} from 'lit'

import {CVDialog} from '../components/cv-dialog'

export type DialogPriority = 'polite' | 'assertive'

export interface DialogControllerAdapters {
  announce?: (message: string, priority?: DialogPriority) => void
  setInertExcept?: (element: HTMLElement) => void
  restoreInert?: () => void
  findFirstFocusable?: (container: Element) => HTMLElement | null
}

export interface ManagedDialogOptions<T> {
  element: HTMLElement
  title?: string
  show: () => Promise<T>
  close: () => void
}

export interface CustomDialogOptions {
  title?: string
  content: TemplateResult | string
  footer?: TemplateResult
  size?: 's' | 'm' | 'l' | 'xl'
  closable?: boolean
  noHeader?: boolean
  noFooter?: boolean
  className?: string
}

export interface DialogController {
  present<T>(options: ManagedDialogOptions<T>): Promise<T>
  showCustom<T>(
    options: CustomDialogOptions,
    resultHandler: (dialog: HTMLElement, resolve: (value: T | null) => void) => void,
  ): Promise<T | null>
  closeAll(): void
  getActiveCount(): number
}

interface ManagedCVDialogElement extends HTMLElement {
  open: boolean
  noHeader: boolean
  closable: boolean
  closeOnEscape: boolean
  closeOnOutsidePointer: boolean
  closeOnOutsideFocus: boolean
  updateComplete?: Promise<boolean>
}

const sizeMap: Record<NonNullable<CustomDialogOptions['size']>, string> = {
  s: '320px',
  m: '480px',
  l: '640px',
  xl: '800px',
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

const managedDialogStyles = `
  cv-dialog.cv-managed-dialog::part(trigger) {
    display: none;
  }

  cv-dialog.cv-managed-dialog::part(content) {
    gap: 0;
    padding: 0;
    overflow: hidden;
  }

  cv-dialog.cv-managed-dialog::part(body) {
    padding: 0;
  }

  cv-dialog.cv-managed-dialog::part(footer) {
    display: block;
    padding: 0;
  }

  .cv-dialog-controller-body {
    padding: var(--cv-space-4, 16px);
    line-height: 1.625;
  }

  .cv-dialog-controller-footer {
    display: flex;
    gap: var(--cv-space-2, 8px);
    justify-content: flex-end;
    padding: var(--cv-space-4, 16px);
    border-top: 1px solid var(--cv-color-border, #2a3245);
    background: color-mix(in oklab, var(--cv-color-surface-elevated, #1d2432) 90%, black);
  }

  @media (max-width: 640px) {
    .cv-dialog-controller-footer {
      width: 100%;
    }

    .cv-dialog-controller-footer > * {
      flex: 1 1 0;
    }
  }
`

let stylesInjected = false
let lastDeepFocusedElement: HTMLElement | null = null
let focusTrackerInstalled = false

function injectStyles(): void {
  if (stylesInjected || typeof document === 'undefined') return

  const style = document.createElement('style')
  style.textContent = managedDialogStyles
  style.id = 'cv-dialog-controller-styles'
  document.head.appendChild(style)
  stylesInjected = true
}

function installFocusTracker(): void {
  if (focusTrackerInstalled || typeof document === 'undefined') return

  document.addEventListener(
    'focusin',
    (event) => {
      const target = event.composedPath?.()[0]
      if (target instanceof HTMLElement) {
        lastDeepFocusedElement = target
      }
    },
    {capture: true},
  )

  focusTrackerInstalled = true
}

function getDeepActiveElement(): HTMLElement | null {
  if (typeof document === 'undefined') return null

  let activeElement = document.activeElement
  while (
    activeElement instanceof HTMLElement &&
    activeElement.shadowRoot?.activeElement instanceof HTMLElement
  ) {
    activeElement = activeElement.shadowRoot.activeElement
  }

  return activeElement instanceof HTMLElement ? activeElement : null
}

function getFocusRestoreTarget(): HTMLElement | null {
  if (typeof document === 'undefined') return null

  const deepActive = getDeepActiveElement()
  if (deepActive && deepActive !== document.body && deepActive !== document.documentElement) {
    return deepActive
  }

  if (
    lastDeepFocusedElement &&
    lastDeepFocusedElement !== document.body &&
    lastDeepFocusedElement !== document.documentElement
  ) {
    return lastDeepFocusedElement
  }

  return null
}

function isElementVisible(element: HTMLElement): boolean {
  if (element.offsetWidth === 0 && element.offsetHeight === 0) {
    return false
  }

  const style = window.getComputedStyle(element)
  return style.visibility !== 'hidden' && style.display !== 'none'
}

function defaultFindFirstFocusable(container: Element): HTMLElement | null {
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
      const found = defaultFindFirstFocusable(child)
      if (found) return found
    }
  }

  return null
}

export function createDialogController(adapters: DialogControllerAdapters = {}): DialogController {
  CVDialog.define()
  injectStyles()
  installFocusTracker()

  const activeDialogs = new Map<HTMLElement, () => void>()
  let zIndexCounter = 1100

  const findFirstFocusable = adapters.findFirstFocusable ?? defaultFindFirstFocusable

  const getNextZIndex = () => zIndexCounter++

  const addDialog = (element: HTMLElement, closeFn: () => void) => {
    activeDialogs.set(element, closeFn)
    const zIndex = getNextZIndex().toString()
    element.style.setProperty('--cv-dialog-z-index', zIndex)
  }

  const removeDialog = (element: HTMLElement) => {
    activeDialogs.delete(element)
    if (activeDialogs.size === 0) {
      zIndexCounter = 1100
      adapters.restoreInert?.()
    }
  }

  const present = async <T>({element, title, show, close}: ManagedDialogOptions<T>): Promise<T> => {
    const focusRestoreTarget = getFocusRestoreTarget()

    document.body.appendChild(element)
    addDialog(element, close)

    element.addEventListener(
      'cv-after-show',
      () => {
        if (!activeDialogs.has(element)) return
        adapters.setInertExcept?.(element)
        const firstFocusable = findFirstFocusable(element)
        if (firstFocusable) {
          setTimeout(() => {
            if (firstFocusable.isConnected) {
              firstFocusable.focus()
            }
          }, 50)
        }
        if (title) {
          adapters.announce?.(title, 'assertive')
        }
      },
      {once: true},
    )

    try {
      return await show()
    } finally {
      removeDialog(element)
      if (focusRestoreTarget?.isConnected) {
        focusRestoreTarget.focus({preventScroll: true})
      }
      element.remove()
    }
  }

  const showCustom = <T>(
    options: CustomDialogOptions,
    resultHandler: (dialog: HTMLElement, resolve: (value: T | null) => void) => void,
  ): Promise<T | null> => {
    return new Promise((resolve) => {
      const focusRestoreTarget = getFocusRestoreTarget()
      let isResolved = false
      let hasOpened = false
      let isCleanedUp = false

      const resolveOnce = (result: T | null) => {
        if (isResolved) return
        isResolved = true
        resolve(result)
      }

      const dialog = document.createElement('cv-dialog') as ManagedCVDialogElement
      dialog.classList.add('cv-managed-dialog')
      dialog.noHeader = options.noHeader ?? false
      dialog.closable = options.closable !== false
      dialog.closeOnEscape = options.closable !== false
      dialog.closeOnOutsidePointer = options.closable !== false
      dialog.closeOnOutsideFocus = options.closable !== false

      if (options.className) {
        dialog.classList.add(...options.className.split(/\s+/).filter(Boolean))
      }

      dialog.style.setProperty('--cv-dialog-width', sizeMap[options.size || 'm'])

      if (!options.noHeader && options.title) {
        const title = document.createElement('span')
        title.slot = 'title'
        title.textContent = options.title
        dialog.appendChild(title)
      }

      const body = document.createElement('div')
      body.className = 'cv-dialog-controller-body'
      if (typeof options.content === 'string') {
        body.textContent = options.content
      } else {
        render(options.content, body)
      }
      dialog.appendChild(body)

      if (options.footer && !options.noFooter) {
        const footer = document.createElement('div')
        footer.className = 'cv-dialog-controller-footer'
        footer.slot = 'footer'
        render(options.footer, footer)
        dialog.appendChild(footer)
      }

      document.body.appendChild(dialog)

      const cleanup = () => {
        if (isCleanedUp) return
        isCleanedUp = true
        removeDialog(dialog)
        if (focusRestoreTarget?.isConnected) {
          focusRestoreTarget.focus({preventScroll: true})
        }
        if (document.body.contains(dialog)) {
          document.body.removeChild(dialog)
        }
      }

      addDialog(dialog, () => {
        dialog.open = false
        resolveOnce(null)
        if (!hasOpened) {
          cleanup()
        }
      })

      dialog.addEventListener('cv-after-hide', cleanup)

      dialog.addEventListener('cv-after-show', () => {
        if (!activeDialogs.has(dialog)) return
        hasOpened = true
        adapters.setInertExcept?.(dialog)
        const firstFocusable = findFirstFocusable(dialog)
        if (firstFocusable) {
          setTimeout(() => firstFocusable.focus(), 50)
        }
        if (options.title) {
          adapters.announce?.(options.title, 'assertive')
        }
      })

      dialog.addEventListener('cv-change', (event: Event) => {
        const detail = (event as CustomEvent<{open: boolean}>).detail
        if (detail?.open === false) {
          resolveOnce(null)
        }
      })

      resultHandler(dialog, (result) => {
        dialog.open = false
        resolveOnce(result)
        if (!hasOpened) {
          cleanup()
        }
      })

      const openDialog = () => {
        if (isResolved) return
        dialog.open = true
      }

      if (dialog.updateComplete) {
        dialog.updateComplete.then(openDialog)
      } else {
        requestAnimationFrame(openDialog)
      }
    })
  }

  const closeAll = () => {
    activeDialogs.forEach((close) => close())
    activeDialogs.clear()
    zIndexCounter = 1100
    adapters.restoreInert?.()
  }

  return {
    present,
    showCustom,
    closeAll,
    getActiveCount: () => activeDialogs.size,
  }
}
