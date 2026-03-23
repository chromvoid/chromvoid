import {action, type Atom, type Computed} from '@reatom/core'
import {createDialog} from '../dialog'

export interface CreateAlertDialogOptions {
  idBase?: string
  initialOpen?: boolean
  triggerId?: string
  initialFocusId?: string
  closeOnEscape?: boolean
  closeOnOutsidePointer?: boolean
  closeOnOutsideFocus?: boolean
  ariaLabelledBy?: string
  ariaDescribedBy?: string
  closeOnAction?: boolean
  onCancel?: () => void
  onAction?: () => void
}

export interface AlertDialogState {
  isOpen: Atom<boolean>
  restoreTargetId: Atom<string | null>
  isFocusTrapped: Computed<boolean>
  initialFocusTargetId: Atom<string | null>
}

export interface AlertDialogActions {
  open(): void
  close(): void
  handleKeyDown(event: Pick<KeyboardEvent, 'key'>): void
}

export interface AlertDialogOverlayProps {
  id: string
  hidden: boolean
  'data-open': 'true' | 'false'
  onPointerDownOutside: () => void
  onFocusOutside: () => void
}

export interface AlertDialogContentProps {
  id: string
  role: 'alertdialog'
  tabindex: '-1'
  'aria-modal': 'true'
  'aria-labelledby': string
  'aria-describedby': string
  'data-initial-focus'?: string
  onKeyDown: (event: Pick<KeyboardEvent, 'key'>) => void
}

export interface AlertDialogTitleProps {
  id: string
}

export interface AlertDialogDescriptionProps {
  id: string
}

export interface AlertDialogButtonProps {
  id: string
  role: 'button'
  tabindex: '0'
  onClick: () => void
}

export interface AlertDialogContracts {
  getDialogProps(): AlertDialogContentProps
  getOverlayProps(): AlertDialogOverlayProps
  getTitleProps(): AlertDialogTitleProps
  getDescriptionProps(): AlertDialogDescriptionProps
  getCancelButtonProps(): AlertDialogButtonProps
  getActionButtonProps(): AlertDialogButtonProps
}

export interface AlertDialogModel {
  readonly state: AlertDialogState
  readonly actions: AlertDialogActions
  readonly contracts: AlertDialogContracts
}

export function createAlertDialog(options: CreateAlertDialogOptions = {}): AlertDialogModel {
  const idBase = options.idBase ?? 'alert-dialog'
  const cancelButtonId = `${idBase}-cancel`

  const dialog = createDialog({
    idBase,
    initialOpen: options.initialOpen,
    isModal: true,
    closeOnEscape: options.closeOnEscape,
    closeOnOutsidePointer: options.closeOnOutsidePointer,
    closeOnOutsideFocus: options.closeOnOutsideFocus,
    initialFocusId: options.initialFocusId ?? cancelButtonId,
    ariaLabelledBy: options.ariaLabelledBy,
    ariaDescribedBy: options.ariaDescribedBy,
  })

  if (options.triggerId != null) {
    dialog.actions.setTriggerId(options.triggerId)
  }

  const open = action(() => {
    dialog.actions.open('programmatic')
  }, `${idBase}.open`)

  const close = action(() => {
    dialog.actions.close('programmatic')
  }, `${idBase}.close`)

  const handleKeyDown = action((event: Pick<KeyboardEvent, 'key'>) => {
    dialog.actions.handleKeyDown(event)
  }, `${idBase}.handleKeyDown`)

  const handleCancel = action(() => {
    options.onCancel?.()
    close()
  }, `${idBase}.cancel`)

  const handleAction = action(() => {
    options.onAction?.()

    if (options.closeOnAction !== false) {
      close()
    }
  }, `${idBase}.action`)

  const actions: AlertDialogActions = {
    open,
    close,
    handleKeyDown,
  }

  const contracts: AlertDialogContracts = {
    getDialogProps() {
      const content = dialog.contracts.getContentProps()
      const labelledBy = content['aria-labelledby'] ?? `${idBase}-title`
      const describedBy = content['aria-describedby'] ?? `${idBase}-description`

      return {
        ...content,
        role: 'alertdialog',
        'aria-modal': 'true',
        'aria-labelledby': labelledBy,
        'aria-describedby': describedBy,
      }
    },
    getOverlayProps() {
      return dialog.contracts.getOverlayProps()
    },
    getTitleProps() {
      return dialog.contracts.getTitleProps()
    },
    getDescriptionProps() {
      return dialog.contracts.getDescriptionProps()
    },
    getCancelButtonProps() {
      return {
        id: cancelButtonId,
        role: 'button',
        tabindex: '0',
        onClick: handleCancel,
      }
    },
    getActionButtonProps() {
      return {
        id: `${idBase}-action`,
        role: 'button',
        tabindex: '0',
        onClick: handleAction,
      }
    },
  }

  const state: AlertDialogState = {
    isOpen: dialog.state.isOpen,
    restoreTargetId: dialog.state.restoreTargetId,
    isFocusTrapped: dialog.state.isFocusTrapped,
    initialFocusTargetId: dialog.state.initialFocusTargetId,
  }

  return {
    state,
    actions,
    contracts,
  }
}
