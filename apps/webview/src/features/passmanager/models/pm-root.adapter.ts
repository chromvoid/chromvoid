import {atom} from '@reatom/core'

import {Entry, Group, ManagerRoot} from '@project/passmanager/core'
import type {SubscribedSignal} from '../service/subscribed-signal'

export type PMRootShowElement =
  | ManagerRoot
  | Group
  | Entry
  | 'createEntry'
  | 'createGroup'
  | 'importDialog'
  | 'otpView'
  | undefined

export const passmanagerRoot = atom<ManagerRoot | undefined>(undefined)

export function setPassmanagerRoot(root: ManagerRoot | undefined): void {
  passmanagerRoot.set(root)
}

export function clearPassmanagerRoot(): void {
  passmanagerRoot.set(undefined)
}

export function getPassmanagerRoot(): ManagerRoot | undefined {
  return passmanagerRoot()
}

export function getPassmanagerShowElement(): PMRootShowElement {
  return getPassmanagerRoot()?.showElement?.() as PMRootShowElement
}

export function getPassmanagerShowElementSignal(): SubscribedSignal<PMRootShowElement> | undefined {
  return getPassmanagerRoot()?.showElement as SubscribedSignal<PMRootShowElement> | undefined
}

export function isPassmanagerReadOnly(): boolean {
  return getPassmanagerRoot()?.isReadOnly?.() ?? false
}

export function isPassmanagerReadOnlyOrMissing(): boolean {
  return getPassmanagerRoot()?.isReadOnly?.() ?? true
}

export function isPassmanagerLoading(): boolean {
  return getPassmanagerRoot()?.isLoading?.() ?? false
}
