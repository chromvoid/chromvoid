import type {Atom} from '@reatom/core'

export type HeadlessId = string

export interface HeadlessState {
  activeId: Atom<HeadlessId | null>
  selectedIds: Atom<HeadlessId[]>
  isOpen: Atom<boolean>
}

export interface HeadlessApi {
  open(): void
  close(): void
  setActive(id: HeadlessId | null): void
  toggleSelected(id: HeadlessId): void
  clearSelected(): void
}

export interface HeadlessModel {
  readonly state: HeadlessState
  readonly api: HeadlessApi
}

export * from './selection'
export * from './value-range'
