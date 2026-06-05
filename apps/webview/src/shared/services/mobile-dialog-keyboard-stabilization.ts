export const PASSWORD_INPUT_DIALOG_KEYBOARD_STABILIZATION_ATTR =
  'data-password-input-dialog-keyboard-stabilization'
export const PASSWORD_INPUT_DIALOG_KEYBOARD_OFFSET_VAR = '--password-input-dialog-keyboard-offset'
export const PASSWORD_INPUT_DIALOG_PROVISIONAL_KEYBOARD_OFFSET = 'min(42dvh, 360px)'

export type PasswordInputDialogKeyboardOffsetPhase = 'progress' | 'settled'
export type PasswordInputDialogKeyboardViewportMode = 'overlay' | 'native-resize'
export type PasswordInputDialogKeyboardOffsetSource =
  | 'android-native'
  | 'ios-native'
  | 'tauri-visibility'
  | 'visual-viewport'

type PasswordInputDialogKeyboardStabilizationOptions = {
  initialKeyboardOffset?: string
}

type PasswordInputDialogKeyboardSyncOptions = {
  phase?: PasswordInputDialogKeyboardOffsetPhase
  source?: PasswordInputDialogKeyboardOffsetSource
  viewportMode?: PasswordInputDialogKeyboardViewportMode
}

let stabilizedKeyboardInset = 0

function getRoot(): HTMLElement | null {
  return typeof document === 'undefined' ? null : document.documentElement
}

export function enablePasswordInputDialogKeyboardStabilization(
  options: PasswordInputDialogKeyboardStabilizationOptions = {},
): void {
  const root = getRoot()
  if (!root) return

  stabilizedKeyboardInset = 0
  root.setAttribute(PASSWORD_INPUT_DIALOG_KEYBOARD_STABILIZATION_ATTR, '')
  root.style.setProperty(PASSWORD_INPUT_DIALOG_KEYBOARD_OFFSET_VAR, options.initialKeyboardOffset ?? '0px')
}

export function disablePasswordInputDialogKeyboardStabilization(): void {
  const root = getRoot()
  if (!root) return

  stabilizedKeyboardInset = 0
  root.removeAttribute(PASSWORD_INPUT_DIALOG_KEYBOARD_STABILIZATION_ATTR)
  root.style.removeProperty(PASSWORD_INPUT_DIALOG_KEYBOARD_OFFSET_VAR)
}

export function isPasswordInputDialogKeyboardStabilizationActive(): boolean {
  return Boolean(getRoot()?.hasAttribute(PASSWORD_INPUT_DIALOG_KEYBOARD_STABILIZATION_ATTR))
}

export function syncPasswordInputDialogKeyboardOffset(
  keyboardInset: number,
  options: PasswordInputDialogKeyboardSyncOptions = {},
): number | null {
  const root = getRoot()
  if (!root?.hasAttribute(PASSWORD_INPUT_DIALOG_KEYBOARD_STABILIZATION_ATTR)) return null

  const nextInset =
    options.viewportMode === 'native-resize'
      ? 0
      : Number.isFinite(keyboardInset) && keyboardInset > 0
        ? Math.round(keyboardInset)
        : 0
  if (options.source === 'android-native' && options.phase === 'progress') {
    stabilizedKeyboardInset = nextInset
  } else {
    stabilizedKeyboardInset = nextInset === 0 ? 0 : Math.max(stabilizedKeyboardInset, nextInset)
  }
  root.style.setProperty(PASSWORD_INPUT_DIALOG_KEYBOARD_OFFSET_VAR, `${stabilizedKeyboardInset}px`)
  return stabilizedKeyboardInset
}
