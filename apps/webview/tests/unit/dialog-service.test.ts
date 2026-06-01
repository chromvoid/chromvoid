import {afterEach, describe, expect, it, vi} from 'vitest'
import {atom} from '@reatom/core'
import {html} from 'lit'

import {dialogService} from 'root/shared/services/dialog-service'
import {CvInputDialog} from 'root/shared/services/cv-input-dialog'
import {resetRuntimeCapabilities, setRuntimeCapabilities} from 'root/core/runtime/runtime-capabilities'
import {clearAppContext, createMockAppContext, initAppContext} from 'root/shared/services/app-context'
import {
  enablePasswordInputDialogDebug,
  isPasswordInputDialogDebugActive,
  PASSWORD_INPUT_DIALOG_DEBUG_ATTR,
  PASSWORD_INPUT_DIALOG_DEBUG_STORAGE_KEY,
} from 'root/shared/services/mobile-dialog-debug'
import {
  PASSWORD_INPUT_DIALOG_KEYBOARD_OFFSET_VAR,
  PASSWORD_INPUT_DIALOG_PROVISIONAL_KEYBOARD_OFFSET,
  PASSWORD_INPUT_DIALOG_KEYBOARD_STABILIZATION_ATTR,
  syncPasswordInputDialogKeyboardOffset,
} from 'root/shared/services/mobile-dialog-keyboard-stabilization'

async function flushDom() {
  await Promise.resolve()
  await Promise.resolve()
  await new Promise((resolve) => window.setTimeout(resolve, 0))
  await Promise.resolve()
}

async function waitFor(check: () => boolean, label: string) {
  for (let attempt = 0; attempt < 20; attempt++) {
    if (check()) return
    await flushDom()
  }

  throw new Error(`Timed out waiting for ${label}`)
}

function setupLayout(mode: 'mobile' | 'desktop') {
  initAppContext(
    createMockAppContext({
      store: {
        layoutMode: atom<'mobile' | 'desktop'>(mode),
      } as any,
    }),
  )
}

function stylesToText(styles: unknown): string {
  const values = Array.isArray(styles) ? styles : [styles]
  return values
    .map((value) => {
      if (value == null) return ''
      return typeof value === 'object' && 'cssText' in (value as object)
        ? String((value as {cssText: string}).cssText)
        : String(value)
    })
    .join('\n')
}

describe('dialogService', () => {
  afterEach(() => {
    ;(dialogService as any).dialogController.closeAll()
    document.body.innerHTML = ''
    document.body.style.overflow = ''
    document.documentElement.removeAttribute(PASSWORD_INPUT_DIALOG_DEBUG_ATTR)
    localStorage.removeItem(PASSWORD_INPUT_DIALOG_DEBUG_STORAGE_KEY)
    resetRuntimeCapabilities()
    clearAppContext()
  })

  it('does not leave the app inert after confirm dialog closes', async () => {
    const appRoot = document.createElement('div')
    appRoot.id = 'app-root'
    document.body.append(appRoot)

    const resultPromise = dialogService.showConfirmDialog({
      title: 'Confirm',
      message: 'Leave inert only while dialog is open',
    })

    await waitFor(() => document.querySelector('cv-confirm-dialog') !== null, 'confirm dialog to mount')
    await waitFor(() => appRoot.hasAttribute('inert'), 'app root to become inert')

    const dialog = document.querySelector('cv-confirm-dialog') as {close: (value?: boolean | null) => void} | null
    expect(dialog).not.toBeNull()

    dialog?.close(false)

    await expect(resultPromise).resolves.toBe(false)
    await waitFor(() => document.querySelector('cv-confirm-dialog') === null, 'confirm dialog to unmount')
    await waitFor(() => !appRoot.hasAttribute('inert'), 'app root inert to be restored')

    expect(document.querySelector('[inert]')).toBeNull()
  })

  it('prewarms input dialog rendering without leaving a mounted dialog', async () => {
    setupLayout('mobile')

    await dialogService.prewarmInputDialog({
      title: 'Unlock vault',
      label: 'Vault password',
      type: 'password',
      required: true,
    })

    expect(document.querySelector('cv-input-dialog')).toBeNull()
    expect(dialogService.getActiveDialogsCount()).toBe(0)
  })

  it('lets input dialogs inherit theme text colors without self-referential overrides', () => {
    const stylesText = stylesToText(CvInputDialog.styles)
    const surfaceRule = stylesText.match(/adaptive-modal-surface\s*{(?<body>[\s\S]*?)}/)?.groups?.body ?? ''

    expect(surfaceRule).not.toMatch(/--cv-color-[\w-]+:\s*var\(--cv-color-/)
    expect(stylesText).toContain('adaptive-modal-surface::part(title)')
    expect(stylesText).toContain('color: var(--cv-color-text);')
    expect(stylesText).toContain('color: var(--cv-color-text-muted);')
    expect(stylesText).not.toMatch(/#[\da-fA-F]{3,8}\b/)
  })

  it('keeps password input dialog debug disabled unless explicitly requested', () => {
    enablePasswordInputDialogDebug()

    expect(isPasswordInputDialogDebugActive()).toBe(false)
    expect(document.documentElement.hasAttribute(PASSWORD_INPUT_DIALOG_DEBUG_ATTR)).toBe(false)

    localStorage.setItem(PASSWORD_INPUT_DIALOG_DEBUG_STORAGE_KEY, '1')
    enablePasswordInputDialogDebug()

    expect(isPasswordInputDialogDebugActive()).toBe(true)
    expect(document.documentElement.hasAttribute(PASSWORD_INPUT_DIALOG_DEBUG_ATTR)).toBe(true)
  })

  it('treats implicit confirm dialog close as false', async () => {
    const resultPromise = dialogService.showConfirmDialog({
      title: 'Confirm',
      message: 'Close without approving',
    })

    await waitFor(() => document.querySelector('cv-confirm-dialog') !== null, 'confirm dialog to mount')

    const dialog = document.querySelector('cv-confirm-dialog') as HTMLElement & {shadowRoot: ShadowRoot | null}
    expect(dialog).not.toBeNull()

    await waitFor(
      () =>
        Boolean(
          dialog.shadowRoot
            ?.querySelector('adaptive-modal-surface')
            ?.shadowRoot?.querySelector('cv-dialog'),
        ),
      'confirm dialog shell',
    )
    const surface = dialog.shadowRoot?.querySelector('adaptive-modal-surface')
    const shell = surface?.shadowRoot?.querySelector('cv-dialog')
    expect(shell).not.toBeNull()

    surface?.dispatchEvent(new Event('cv-after-show', {bubbles: true, composed: true}))
    surface?.dispatchEvent(
      new CustomEvent('cv-change', {
        detail: {open: false},
        bubbles: true,
        composed: true,
      }),
    )
    surface?.dispatchEvent(new Event('cv-after-hide', {bubbles: true, composed: true}))

    await expect(resultPromise).resolves.toBe(false)
  })

  it('closes only the top managed dialog for transient back handling', async () => {
    const firstResult = dialogService.showConfirmDialog({
      title: 'First',
      message: 'Keep this one open',
    })
    const secondResult = dialogService.showConfirmDialog({
      title: 'Second',
      message: 'Close this one first',
    })

    await waitFor(() => dialogService.getActiveDialogsCount() === 2, 'two active dialogs')

    const dialogs = Array.from(document.querySelectorAll('cv-confirm-dialog')) as Array<
      HTMLElement & {shadowRoot: ShadowRoot | null}
    >
    expect(dialogs).toHaveLength(2)
    const [firstDialog, secondDialog] = dialogs
    await waitFor(
      () =>
        Boolean(
          firstDialog!.shadowRoot
            ?.querySelector('adaptive-modal-surface')
            ?.shadowRoot?.querySelector('cv-dialog'),
        ) &&
        Boolean(
          secondDialog!.shadowRoot
            ?.querySelector('adaptive-modal-surface')
            ?.shadowRoot?.querySelector('cv-dialog'),
        ),
      'confirm dialog shells',
    )
    const firstSurface = firstDialog!.shadowRoot?.querySelector('adaptive-modal-surface')
    const secondSurface = secondDialog!.shadowRoot?.querySelector('adaptive-modal-surface')
    const firstShell = firstSurface?.shadowRoot?.querySelector('cv-dialog')
    const secondShell = secondSurface?.shadowRoot?.querySelector('cv-dialog')
    expect(firstShell).not.toBeNull()
    expect(secondShell).not.toBeNull()
    ;(firstDialog as any).handleAfterShow()
    ;(secondDialog as any).handleAfterShow()

    expect(dialogService.closeTopDialog()).toBe(true)
    ;(secondDialog as any).handleAfterHide()
    await expect(secondResult).resolves.toBe(false)
    await flushDom()

    if (dialogService.getActiveDialogsCount() > 0) {
      expect(dialogService.closeTopDialog()).toBe(true)
      ;(firstDialog as any).handleAfterHide()
    }
    await expect(firstResult).resolves.toBe(false)
    await waitFor(() => dialogService.getActiveDialogsCount() === 0, 'no active dialogs')
    expect(dialogService.closeTopDialog()).toBe(false)
  })

  it('keeps input dialog open when focus temporarily leaves before confirm', async () => {
    const resultPromise = dialogService.showInputDialog({
      title: 'Unlock vault',
      label: 'Vault password',
      type: 'password',
      required: true,
    })

    await waitFor(() => document.querySelector('cv-input-dialog') !== null, 'input dialog to mount')

    const dialog = document.querySelector('cv-input-dialog') as HTMLElement & {shadowRoot: ShadowRoot | null}
    expect(dialog).not.toBeNull()

    const input = dialog.shadowRoot?.querySelector('cv-input') as HTMLElement | null
    expect(input).not.toBeNull()

    input?.dispatchEvent(
      new CustomEvent('cv-input', {
        detail: {value: 'secret'},
        bubbles: true,
        composed: true,
      }),
    )
    await flushDom()

    expect(document.querySelector('cv-input-dialog')).toBe(dialog)

    const inputEl = input as {value?: string}
    inputEl.value = 'secret'

    const confirmButton = dialog.shadowRoot?.querySelector('cv-button[variant="primary"]') as HTMLElement | null
    expect(confirmButton).not.toBeNull()

    confirmButton?.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))

    await expect(resultPromise).resolves.toBe('secret')
  })

  it('renders input and confirm dialogs through adaptive surfaces', async () => {
    setupLayout('mobile')
    const inputResult = dialogService.showInputDialog({
      title: 'Mobile input',
      label: 'Name',
    })
    await waitFor(() => document.querySelector('cv-input-dialog') !== null, 'mobile input dialog to mount')
    const inputDialog = document.querySelector('cv-input-dialog') as HTMLElement & {
      shadowRoot: ShadowRoot | null
      close: (value?: string | null) => void
    }
    await waitFor(
      () =>
        Boolean(
          inputDialog.shadowRoot
            ?.querySelector('adaptive-modal-surface')
            ?.shadowRoot?.querySelector('cv-bottom-sheet'),
        ),
      'mobile input sheet',
    )
    const inputSurface = inputDialog.shadowRoot?.querySelector('adaptive-modal-surface')
    const inputSheet = inputSurface?.shadowRoot?.querySelector('cv-bottom-sheet')
    expect(inputSheet).not.toBeNull()
    expect(inputSheet?.showHandle).toBe(false)
    expect(inputSheet?.dragToClose).toBe(false)
    expect(inputSurface?.shadowRoot?.querySelector('cv-dialog')).toBeNull()
    inputSurface?.dispatchEvent(new Event('cv-after-show', {bubbles: true, composed: true}))
    inputDialog.close(null)
    inputSurface?.dispatchEvent(new Event('cv-after-hide', {bubbles: true, composed: true}))
    await expect(inputResult).resolves.toBeNull()

    clearAppContext()
    setupLayout('desktop')
    const confirmResult = dialogService.showConfirmDialog({
      title: 'Desktop confirm',
      message: 'Confirm',
    })
    await waitFor(() => document.querySelector('cv-confirm-dialog') !== null, 'desktop confirm dialog to mount')
    const confirmDialog = document.querySelector('cv-confirm-dialog') as HTMLElement & {
      shadowRoot: ShadowRoot | null
      close: (value?: boolean | null) => void
    }
    await waitFor(
      () =>
        Boolean(
          confirmDialog.shadowRoot
            ?.querySelector('adaptive-modal-surface')
            ?.shadowRoot?.querySelector('cv-dialog'),
        ),
      'desktop confirm shell',
    )
    const confirmSurface = confirmDialog.shadowRoot?.querySelector('adaptive-modal-surface')
    const confirmShell = confirmSurface?.shadowRoot?.querySelector('cv-dialog')
    expect(confirmShell).not.toBeNull()
    expect(confirmSurface?.shadowRoot?.querySelector('cv-bottom-sheet')).toBeNull()
    confirmSurface?.dispatchEvent(new Event('cv-after-show', {bubbles: true, composed: true}))
    confirmDialog.close(false)
    confirmSurface?.dispatchEvent(new Event('cv-after-hide', {bubbles: true, composed: true}))
    await expect(confirmResult).resolves.toBe(false)
  })

  it('stabilizes mobile password input dialog and owns autofocus', async () => {
    setupLayout('mobile')
    const resultPromise = dialogService.showInputDialog({
      title: 'Unlock vault',
      label: 'Vault password',
      type: 'password',
      required: true,
    })

    await waitFor(() => document.querySelector('cv-input-dialog') !== null, 'mobile password dialog to mount')
    const inputDialog = document.querySelector('cv-input-dialog') as HTMLElement & {
      shadowRoot: ShadowRoot | null
      close: (value?: string | null) => void
    }

    await waitFor(
      () =>
        Boolean(
          inputDialog.shadowRoot
            ?.querySelector('adaptive-modal-surface')
            ?.shadowRoot?.querySelector('cv-bottom-sheet'),
        ),
      'mobile password input sheet',
    )

    const inputSurface = inputDialog.shadowRoot?.querySelector('adaptive-modal-surface')
    const inputSheet = inputSurface?.shadowRoot?.querySelector('cv-bottom-sheet')
    const input = inputDialog.shadowRoot?.querySelector('cv-input') as HTMLElement | null
    const stylesText = stylesToText(CvInputDialog.styles)

    expect(inputSheet).not.toBeNull()
    expect(inputSurface?.classList.contains('password-input-dialog')).toBe(true)
    expect(document.documentElement.hasAttribute(PASSWORD_INPUT_DIALOG_DEBUG_ATTR)).toBe(false)
    expect(document.documentElement.hasAttribute(PASSWORD_INPUT_DIALOG_KEYBOARD_STABILIZATION_ATTR)).toBe(true)
    expect(document.documentElement.style.getPropertyValue(PASSWORD_INPUT_DIALOG_KEYBOARD_OFFSET_VAR)).toBe(
      PASSWORD_INPUT_DIALOG_PROVISIONAL_KEYBOARD_OFFSET,
    )
    expect(stylesText).toMatch(
      /adaptive-modal-surface\.password-input-dialog\s*{[\s\S]*--cv-bottom-sheet-keyboard-inset:\s*var\(\s*--password-input-dialog-keyboard-offset,\s*var\(--visual-viewport-bottom-inset,\s*0px\)\s*\);/,
    )
    expect(stylesText).not.toContain('adaptive-modal-surface.password-input-dialog::part(content)')
    expect(stylesText).not.toMatch(
      /adaptive-modal-surface\.password-input-dialog::part\(content\)[\s\S]*transform:/,
    )
    expect(input).not.toBeNull()

    expect(syncPasswordInputDialogKeyboardOffset(336)).toBe(336)
    expect(document.documentElement.style.getPropertyValue(PASSWORD_INPUT_DIALOG_KEYBOARD_OFFSET_VAR)).toBe(
      '336px',
    )
    expect(syncPasswordInputDialogKeyboardOffset(103)).toBe(336)
    expect(document.documentElement.style.getPropertyValue(PASSWORD_INPUT_DIALOG_KEYBOARD_OFFSET_VAR)).toBe(
      '336px',
    )
    expect(syncPasswordInputDialogKeyboardOffset(0)).toBe(0)
    expect(document.documentElement.style.getPropertyValue(PASSWORD_INPUT_DIALOG_KEYBOARD_OFFSET_VAR)).toBe(
      '0px',
    )
    expect(syncPasswordInputDialogKeyboardOffset(240, {phase: 'progress', source: 'android-native'})).toBe(240)
    expect(syncPasswordInputDialogKeyboardOffset(120, {phase: 'progress', source: 'android-native'})).toBe(120)
    expect(document.documentElement.style.getPropertyValue(PASSWORD_INPUT_DIALOG_KEYBOARD_OFFSET_VAR)).toBe(
      '120px',
    )

    const focusSpy = vi.fn()
    input!.focus = focusSpy

    await new Promise((resolve) => window.setTimeout(resolve, 160))
    focusSpy.mockClear()
    ;(inputDialog as any).clearPendingInputFocus()

    inputSurface?.dispatchEvent(new Event('cv-show', {bubbles: true, composed: true}))
    await new Promise((resolve) => window.setTimeout(resolve, 90))

    expect(focusSpy).toHaveBeenCalledTimes(1)
    expect(focusSpy).toHaveBeenCalledWith({preventScroll: true})

    inputSurface?.dispatchEvent(new Event('cv-after-show', {bubbles: true, composed: true}))
    await new Promise((resolve) => window.setTimeout(resolve, 90))

    expect(focusSpy).toHaveBeenCalledTimes(1)

    inputDialog.close(null)
    inputSurface?.dispatchEvent(new Event('cv-after-hide', {bubbles: true, composed: true}))
    await expect(resultPromise).resolves.toBeNull()
    expect(document.documentElement.hasAttribute(PASSWORD_INPUT_DIALOG_KEYBOARD_STABILIZATION_ATTR)).toBe(false)
    expect(document.documentElement.style.getPropertyValue(PASSWORD_INPUT_DIALOG_KEYBOARD_OFFSET_VAR)).toBe('')
  })

  it('uses native android IME insets instead of provisional password offset', async () => {
    setupLayout('mobile')
    setRuntimeCapabilities({
      platform: 'android',
      mobile: true,
    })
    const resultPromise = dialogService.showInputDialog({
      title: 'Unlock vault',
      label: 'Vault password',
      type: 'password',
      required: true,
    })

    await waitFor(() => document.querySelector('cv-input-dialog') !== null, 'mobile password dialog to mount')
    const inputDialog = document.querySelector('cv-input-dialog') as HTMLElement & {
      shadowRoot: ShadowRoot | null
      close: (value?: string | null) => void
    }

    await waitFor(
      () =>
        Boolean(
          inputDialog.shadowRoot
            ?.querySelector('adaptive-modal-surface')
            ?.shadowRoot?.querySelector('cv-bottom-sheet'),
        ),
      'mobile password input sheet',
    )

    expect(document.documentElement.hasAttribute(PASSWORD_INPUT_DIALOG_KEYBOARD_STABILIZATION_ATTR)).toBe(true)
    expect(document.documentElement.style.getPropertyValue(PASSWORD_INPUT_DIALOG_KEYBOARD_OFFSET_VAR)).toBe('0px')

    expect(syncPasswordInputDialogKeyboardOffset(96, {phase: 'progress', source: 'android-native'})).toBe(96)
    expect(document.documentElement.style.getPropertyValue(PASSWORD_INPUT_DIALOG_KEYBOARD_OFFSET_VAR)).toBe(
      '96px',
    )
    expect(syncPasswordInputDialogKeyboardOffset(48, {phase: 'progress', source: 'android-native'})).toBe(48)
    expect(document.documentElement.style.getPropertyValue(PASSWORD_INPUT_DIALOG_KEYBOARD_OFFSET_VAR)).toBe(
      '48px',
    )

    const inputSurface = inputDialog.shadowRoot?.querySelector('adaptive-modal-surface')
    inputDialog.close(null)
    inputSurface?.dispatchEvent(new Event('cv-after-hide', {bubbles: true, composed: true}))
    await expect(resultPromise).resolves.toBeNull()
  })

  it('preserves confirmed input result when the shell emits a close change before hide', async () => {
    const resultPromise = dialogService.showInputDialog({
      title: 'Rename file',
      label: 'New name',
      value: 'photo.png',
      required: true,
    })

    await waitFor(() => document.querySelector('cv-input-dialog') !== null, 'input dialog to mount')

    const dialog = document.querySelector('cv-input-dialog') as HTMLElement & {shadowRoot: ShadowRoot | null}
    expect(dialog).not.toBeNull()

    await waitFor(
      () =>
        Boolean(
          dialog.shadowRoot
            ?.querySelector('adaptive-modal-surface')
            ?.shadowRoot?.querySelector('cv-dialog'),
        ),
      'input dialog shell',
    )
    const surface = dialog.shadowRoot?.querySelector('adaptive-modal-surface')
    const shell = surface?.shadowRoot?.querySelector('cv-dialog')
    expect(shell).not.toBeNull()
    surface?.dispatchEvent(new Event('cv-after-show', {bubbles: true, composed: true}))

    const input = dialog.shadowRoot?.querySelector('cv-input') as (HTMLElement & {value?: string}) | null
    expect(input).not.toBeNull()
    input!.dispatchEvent(
      new CustomEvent('cv-input', {
        detail: {value: 'renamed.png'},
        bubbles: true,
        composed: true,
      }),
    )
    await flushDom()

    const confirmButton = dialog.shadowRoot?.querySelector('cv-button[variant="primary"]') as HTMLElement | null
    expect(confirmButton).not.toBeNull()
    confirmButton?.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))

    surface?.dispatchEvent(
      new CustomEvent('cv-change', {
        detail: {open: false},
        bubbles: true,
        composed: true,
      }),
    )
    surface?.dispatchEvent(new Event('cv-after-hide', {bubbles: true, composed: true}))

    await expect(resultPromise).resolves.toBe('renamed.png')
  })

  it('does not read unreported DOM input value when confirming input dialog', async () => {
    const resultPromise = dialogService.showInputDialog({
      title: 'Rename file',
      label: 'New name',
      value: 'photo.png',
      required: true,
    })

    await waitFor(() => document.querySelector('cv-input-dialog') !== null, 'input dialog to mount')

    const dialog = document.querySelector('cv-input-dialog') as HTMLElement & {shadowRoot: ShadowRoot | null}
    expect(dialog).not.toBeNull()

    await waitFor(
      () =>
        Boolean(
          dialog.shadowRoot
            ?.querySelector('adaptive-modal-surface')
            ?.shadowRoot?.querySelector('cv-dialog'),
        ),
      'input dialog shell',
    )
    const surface = dialog.shadowRoot?.querySelector('adaptive-modal-surface')
    surface?.dispatchEvent(new Event('cv-after-show', {bubbles: true, composed: true}))

    const input = dialog.shadowRoot?.querySelector('cv-input') as (HTMLElement & {value?: string}) | null
    expect(input).not.toBeNull()
    input!.value = 'dom-only.png'

    const confirmButton = dialog.shadowRoot?.querySelector('cv-button[variant="primary"]') as HTMLElement | null
    expect(confirmButton).not.toBeNull()
    confirmButton?.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))

    surface?.dispatchEvent(new Event('cv-after-hide', {bubbles: true, composed: true}))

    await expect(resultPromise).resolves.toBe('photo.png')
  })

  it('returns the selected value from single-select dialog', async () => {
    setupLayout('desktop')
    const resultPromise = dialogService.showSelectDialog({
      title: 'Pick one',
      options: [
        {value: 'alpha', label: 'Alpha'},
        {value: 'beta', label: 'Beta'},
      ],
    })

    await waitFor(
      () => document.querySelector('adaptive-modal-surface.cv-managed-dialog') !== null,
      'select dialog to mount',
    )
    const surface = document.querySelector('adaptive-modal-surface.cv-managed-dialog')
    expect(surface?.shadowRoot?.querySelector('cv-dialog')).not.toBeNull()

    const confirmButton = document.querySelector<HTMLButtonElement>('.select-dialog-action[data-action="confirm"]')
    const betaInput = document.querySelector<HTMLInputElement>('.select-dialog-option-input[value="beta"]')

    expect(confirmButton?.disabled).toBe(true)
    expect(betaInput).not.toBeNull()

    betaInput?.click()
    await flushDom()

    expect(confirmButton?.disabled).toBe(false)
    confirmButton?.click()

    await expect(resultPromise).resolves.toBe('beta')
  })

  it('returns ordered values from multi-select dialog', async () => {
    setupLayout('desktop')
    const resultPromise = dialogService.showSelectDialog({
      title: 'Pick many',
      multiple: true,
      options: [
        {value: 'alpha', label: 'Alpha'},
        {value: 'beta', label: 'Beta'},
        {value: 'gamma', label: 'Gamma'},
      ],
    })

    await waitFor(
      () => document.querySelector('adaptive-modal-surface.cv-managed-dialog') !== null,
      'multi-select dialog to mount',
    )

    const confirmButton = document.querySelector<HTMLButtonElement>('.select-dialog-action[data-action="confirm"]')
    const betaInput = document.querySelector<HTMLInputElement>('.select-dialog-option-input[value="beta"]')
    const alphaInput = document.querySelector<HTMLInputElement>('.select-dialog-option-input[value="alpha"]')

    betaInput?.click()
    alphaInput?.click()
    await flushDom()

    confirmButton?.click()

    await expect(resultPromise).resolves.toEqual(['alpha', 'beta'])
  })

  it('returns null when select dialog is cancelled', async () => {
    setupLayout('desktop')
    const resultPromise = dialogService.showSelectDialog({
      title: 'Cancel select',
      options: [{value: 'alpha', label: 'Alpha'}],
    })

    await waitFor(
      () => document.querySelector('adaptive-modal-surface.cv-managed-dialog') !== null,
      'select dialog to mount',
    )

    const cancelButton = document.querySelector<HTMLButtonElement>('.select-dialog-action[data-action="cancel"]')
    expect(cancelButton).not.toBeNull()

    cancelButton?.click()

    await expect(resultPromise).resolves.toBeNull()
  })

  it('renders managed custom dialogs as adaptive surfaces on desktop and mobile', async () => {
    setupLayout('desktop')
    let resolveDesktop: ((value: string | null) => void) | undefined
    const desktopResult = dialogService.showCustomDialog<string>(
      {
        title: 'Desktop custom',
        content: 'Desktop body',
      },
      (_dialog, resolve) => {
        resolveDesktop = resolve
      },
    )

    await waitFor(
      () => document.querySelector('adaptive-modal-surface.cv-managed-dialog') !== null,
      'desktop custom dialog to mount',
    )
    const desktopSurface = document.querySelector('adaptive-modal-surface.cv-managed-dialog')
    expect(desktopSurface?.shadowRoot?.querySelector('cv-dialog')).not.toBeNull()
    expect(desktopSurface?.shadowRoot?.querySelector('cv-bottom-sheet')).toBeNull()

    resolveDesktop?.('done')
    await expect(desktopResult).resolves.toBe('done')
    await waitFor(() => document.querySelector('adaptive-modal-surface.cv-managed-dialog') === null, 'desktop cleanup')

    clearAppContext()
    setupLayout('mobile')
    let resolveMobile: ((value: string | null) => void) | undefined
    const mobileResult = dialogService.showCustomDialog<string>(
      {
        title: 'Mobile custom',
        content: 'Mobile body',
      },
      (_dialog, resolve) => {
        resolveMobile = resolve
      },
    )

    await waitFor(
      () => document.querySelector('adaptive-modal-surface.cv-managed-dialog') !== null,
      'mobile custom dialog to mount',
    )
    const mobileSurface = document.querySelector('adaptive-modal-surface.cv-managed-dialog')
    expect(mobileSurface?.shadowRoot?.querySelector('cv-bottom-sheet')).not.toBeNull()
    expect(mobileSurface?.shadowRoot?.querySelector('cv-dialog')).toBeNull()

    resolveMobile?.('done')
    await expect(mobileResult).resolves.toBe('done')
  })

  it('keeps managed custom dialog DOM mounted until cv-after-hide cleanup', async () => {
    setupLayout('desktop')
    let dialogRef: (HTMLElement & {open?: boolean}) | undefined
    let resolveDialog: ((value: string | null) => void) | undefined

    const resultPromise = dialogService.showCustomDialog<string>(
      {
        title: 'Delayed cleanup',
        content: 'Keep mounted until after hide',
      },
      (dialog, resolve) => {
        dialogRef = dialog as HTMLElement & {open?: boolean}
        resolveDialog = resolve
      },
    )

    await waitFor(() => Boolean(dialogRef?.isConnected), 'custom dialog to mount')
    dialogRef?.dispatchEvent(new Event('cv-after-show', {bubbles: true, composed: true}))

    resolveDialog?.('done')
    await flushDom()

    expect(dialogRef?.open).toBe(false)
    expect(document.body.contains(dialogRef!)).toBe(true)
    await expect(resultPromise).resolves.toBe('done')

    dialogRef?.dispatchEvent(new Event('cv-after-hide', {bubbles: true, composed: true}))
    await waitFor(() => !document.body.contains(dialogRef!), 'custom dialog cleanup')
  })

  it('does not close a managed custom dialog for nested non-modal cv-change events', async () => {
    setupLayout('mobile')
    let dialogRef: HTMLElement | undefined
    let resolveDialog: ((value: string | null) => void) | undefined
    const resultPromise = dialogService.showCustomDialog<string>(
      {
        title: 'Nested event',
        content: html`<cv-input label="Name"></cv-input>`,
      },
      (dialog, resolve) => {
        dialogRef = dialog
        resolveDialog = resolve
      },
    )

    await waitFor(() => Boolean(dialogRef?.isConnected), 'nested custom dialog to mount')
    const input = dialogRef?.querySelector('cv-input')
    expect(input).not.toBeNull()

    input?.dispatchEvent(new CustomEvent('cv-change', {detail: {value: 'abc'}, bubbles: true, composed: true}))
    await flushDom()

    expect(document.querySelector('adaptive-modal-surface.cv-managed-dialog')).toBe(dialogRef)

    resolveDialog?.('done')
    await expect(resultPromise).resolves.toBe('done')
  })

  it('blurs the active input before scheduling dialog close', async () => {
    vi.useFakeTimers()

    const dialog = new CvInputDialog() as CvInputDialog & {
      shown: boolean
      isOpen: {(): boolean; set: (value: boolean) => void}
      closeTimer: number | null
    }
    dialog.configure({
      title: 'Unlock vault',
      label: 'Vault password',
      type: 'password',
      required: true,
    })
    document.body.append(dialog)
    await dialog.updateComplete

    const input = dialog.shadowRoot?.querySelector('cv-input') as HTMLElement | null
    expect(input).not.toBeNull()

    const blurSpy = vi.spyOn(input as HTMLElement, 'blur')
    const activeElementDescriptor = Object.getOwnPropertyDescriptor(document, 'activeElement')

    Object.defineProperty(document, 'activeElement', {
      configurable: true,
      get: () => input,
    })

    dialog.shown = true
    dialog.isOpen.set(true)

    try {
      dialog.close('secret')

      expect(blurSpy).toHaveBeenCalledTimes(1)
      expect(dialog.closeTimer).not.toBeNull()

      vi.advanceTimersByTime(32)
      await dialog.updateComplete

      expect(dialog.isOpen()).toBe(false)
    } finally {
      vi.useRealTimers()
      if (activeElementDescriptor) {
        Object.defineProperty(document, 'activeElement', activeElementDescriptor)
      } else {
        delete (document as Document & {activeElement?: Element | null}).activeElement
      }
    }
  })
})
