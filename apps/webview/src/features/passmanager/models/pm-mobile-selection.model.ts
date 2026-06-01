import {atom, computed} from '@reatom/core'
import {pmMobileDebug} from './pm-mobile-debug'

export type PMSelectionKind = 'entry' | 'group'
export type PMSelectionMode = 'idle' | 'selection'

type SuppressedTap = {
  kind: PMSelectionKind
  id: string
  token: number
  until: number
} | null

class PMMobileSelectionModel {
  private static readonly POST_LONG_PRESS_SUPPRESS_MS = 700

  readonly mode = atom<PMSelectionMode>('idle', 'passmanager.mobileSelection.mode')
  readonly selectedEntryIds = atom<string[]>([], 'passmanager.mobileSelection.selectedEntryIds')
  readonly selectedGroupIds = atom<string[]>([], 'passmanager.mobileSelection.selectedGroupIds')
  readonly suppressedTap = atom<SuppressedTap>(null, 'passmanager.mobileSelection.suppressedTap')

  readonly active = computed(() => this.mode() === 'selection')
  readonly selectedCount = computed(
    () => this.selectedEntryIds().length + this.selectedGroupIds().length,
  )
  readonly hasSingleSelection = computed(() => this.selectedCount() === 1)
  readonly singleSelectionKind = computed<PMSelectionKind | null>(() => {
    if (!this.hasSingleSelection()) return null
    if (this.selectedEntryIds().length === 1) return 'entry'
    if (this.selectedGroupIds().length === 1) return 'group'
    return null
  })
  readonly singleSelectionId = computed<string | null>(() => {
    const kind = this.singleSelectionKind()
    if (kind === 'entry') return this.selectedEntryIds()[0] ?? null
    if (kind === 'group') return this.selectedGroupIds()[0] ?? null
    return null
  })

  enterWithEntry(entryId: string, token?: number): void {
    this.mode.set('selection')
    this.selectedEntryIds.set([entryId])
    this.selectedGroupIds.set([])
    if (typeof token === 'number') {
      this.suppressTap('entry', entryId, token)
    } else {
      this.suppressedTap.set(null)
    }
    this.debugState('enterWithEntry', {entryId, token})
  }

  enterWithGroup(groupId: string, token?: number): void {
    this.mode.set('selection')
    this.selectedEntryIds.set([])
    this.selectedGroupIds.set([groupId])
    if (typeof token === 'number') {
      this.suppressTap('group', groupId, token)
    } else {
      this.suppressedTap.set(null)
    }
    this.debugState('enterWithGroup', {groupId, token})
  }

  toggleEntry(entryId: string): void {
    this.mode.set('selection')
    this.selectedEntryIds.set(this.toggleId(this.selectedEntryIds(), entryId))
    this.debugState('toggleEntry', {entryId})
  }

  toggleGroup(groupId: string): void {
    this.mode.set('selection')
    this.selectedGroupIds.set(this.toggleId(this.selectedGroupIds(), groupId))
    this.debugState('toggleGroup', {groupId})
  }

  clear(): void {
    this.selectedEntryIds.set([])
    this.selectedGroupIds.set([])
    this.debugState('clear')
  }

  exit(): void {
    this.suppressedTap.set(null)
    this.mode.set('idle')
    this.clear()
    this.debugState('exit')
  }

  isEntrySelected(entryId: string): boolean {
    return this.selectedEntryIds().includes(entryId)
  }

  isGroupSelected(groupId: string): boolean {
    return this.selectedGroupIds().includes(groupId)
  }

  suppressTap(kind: PMSelectionKind, id: string, token: number): void {
    this.suppressedTap.set({
      kind,
      id,
      token,
      until: this.now() + PMMobileSelectionModel.POST_LONG_PRESS_SUPPRESS_MS,
    })
    pmMobileDebug('selection', 'suppressTap', {kind, id, token})
  }

  consumeSuppressedTap(kind: PMSelectionKind, id: string, token: number | null | undefined): boolean {
    const suppression = this.suppressedTap()
    if (!suppression) return false

    if (this.now() > suppression.until) {
      this.suppressedTap.set(null)
      pmMobileDebug('selection', 'consumeSuppressedTap.expired', {kind, id, token})
      return false
    }

    if (suppression.kind !== kind || suppression.id !== id) {
      return false
    }

    if (typeof token === 'number' && suppression.token !== token) {
      return false
    }

    this.suppressedTap.set(null)
    pmMobileDebug('selection', 'consumeSuppressedTap.hit', {kind, id, token})
    return true
  }

  consumePostLongPressClick(kind: PMSelectionKind, id: string): boolean {
    const suppression = this.suppressedTap()
    return this.consumeSuppressedTap(kind, id, suppression?.token)
  }

  private toggleId(ids: string[], nextId: string): string[] {
    return ids.includes(nextId) ? ids.filter((id) => id !== nextId) : [...ids, nextId]
  }

  private now(): number {
    return typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : Date.now()
  }

  private debugState(event: string, details?: Record<string, unknown>): void {
    pmMobileDebug('selection', event, {
      ...details,
      mode: this.mode(),
      selectedEntryIds: this.selectedEntryIds(),
      selectedGroupIds: this.selectedGroupIds(),
      selectedCount: this.selectedCount(),
    })
  }
}

export const pmMobileSelectionModel = new PMMobileSelectionModel()
