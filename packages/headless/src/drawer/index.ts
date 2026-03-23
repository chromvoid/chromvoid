import {atom, type Atom} from '@reatom/core'
import {
  createDialog,
  type CreateDialogOptions,
  type DialogState,
  type DialogActions,
  type DialogTriggerProps,
  type DialogOverlayProps,
  type DialogContentProps,
  type DialogTitleProps,
  type DialogDescriptionProps,
  type DialogCloseButtonProps,
  type DialogHeaderCloseButtonProps,
} from '../dialog'

export type DrawerPlacement = 'start' | 'end' | 'top' | 'bottom'

export interface CreateDrawerOptions extends CreateDialogOptions {
  placement?: DrawerPlacement
}

export interface DrawerPanelProps extends DialogContentProps {
  'data-placement': DrawerPlacement
}

export interface DrawerState extends DialogState {
  placement: Atom<DrawerPlacement>
}

export interface DrawerActions extends DialogActions {
  setPlacement(placement: DrawerPlacement): void
}

export interface DrawerContracts {
  getTriggerProps(): DialogTriggerProps
  getOverlayProps(): DialogOverlayProps
  getPanelProps(): DrawerPanelProps
  getTitleProps(): DialogTitleProps
  getDescriptionProps(): DialogDescriptionProps
  getCloseButtonProps(): DialogCloseButtonProps
  getHeaderCloseButtonProps(): DialogHeaderCloseButtonProps
}

export interface DrawerModel {
  readonly state: DrawerState
  readonly actions: DrawerActions
  readonly contracts: DrawerContracts
}

export function createDrawer(options: CreateDrawerOptions = {}): DrawerModel {
  const idBase = options.idBase ?? 'drawer'

  const dialog = createDialog({
    ...options,
    idBase,
  })

  const placementAtom = atom<DrawerPlacement>(
    options.placement ?? 'end',
    `${idBase}.placement`,
  )

  const state: DrawerState = {
    ...dialog.state,
    placement: placementAtom,
  }

  const actions: DrawerActions = {
    ...dialog.actions,
    setPlacement(placement: DrawerPlacement) {
      placementAtom.set(placement)
    },
  }

  const contracts: DrawerContracts = {
    getTriggerProps: dialog.contracts.getTriggerProps,
    getOverlayProps: dialog.contracts.getOverlayProps,
    getPanelProps() {
      return {
        ...dialog.contracts.getContentProps(),
        'data-placement': placementAtom(),
      }
    },
    getTitleProps: dialog.contracts.getTitleProps,
    getDescriptionProps: dialog.contracts.getDescriptionProps,
    getCloseButtonProps: dialog.contracts.getCloseButtonProps,
    getHeaderCloseButtonProps: dialog.contracts.getHeaderCloseButtonProps,
  }

  return {
    state,
    actions,
    contracts,
  }
}
