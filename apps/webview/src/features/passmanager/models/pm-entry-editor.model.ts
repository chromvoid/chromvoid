import {action, atom, computed} from '@reatom/core'

export type PMEntryEditorSurface =
  | 'entry'
  | 'title'
  | 'username'
  | 'password'
  | 'website'
  | 'note'
  | 'otp'
  | 'ssh'
  | 'tags'
  | 'payment-card'

class PMEntryEditorModel {
  readonly activeEntryId = atom<string | undefined>(undefined, 'passmanager.entryEditor.activeEntryId')
  readonly activeSurface = atom<PMEntryEditorSurface | null>(null, 'passmanager.entryEditor.activeSurface')
  readonly dirtyEntryId = atom<string | undefined>(undefined, 'passmanager.entryEditor.dirtyEntryId')
  readonly active = computed(
    () => this.activeSurface() !== null && this.activeEntryId() !== undefined,
    'passmanager.entryEditor.active',
  )
  readonly dirty = computed(() => this.dirtyEntryId() !== undefined, 'passmanager.entryEditor.dirty')

  readonly openSurface = action((entryId: string, surface: PMEntryEditorSurface) => {
    this.activeEntryId.set(entryId)
    this.activeSurface.set(surface)
  }, 'passmanager.entryEditor.openSurface')

  readonly markDirty = action((entryId: string, dirty: boolean) => {
    if (dirty) {
      this.dirtyEntryId.set(entryId)
      return
    }

    if (this.dirtyEntryId() === entryId) {
      this.dirtyEntryId.set(undefined)
    }
  }, 'passmanager.entryEditor.markDirty')

  readonly clearDirty = action((entryId?: string) => {
    if (entryId !== undefined && this.dirtyEntryId() !== entryId) {
      return
    }

    this.dirtyEntryId.set(undefined)
  }, 'passmanager.entryEditor.clearDirty')

  readonly closeSurface = action((entryId?: string) => {
    if (!this.active()) {
      return false
    }

    if (entryId !== undefined && this.activeEntryId() !== entryId) {
      return false
    }

    this.activeEntryId.set(undefined)
    this.activeSurface.set(null)
    this.clearDirty(entryId)
    return true
  }, 'passmanager.entryEditor.closeSurface')

  readonly resetForEntryChange = action((entryId: string | undefined) => {
    if (entryId !== this.activeEntryId()) {
      this.activeEntryId.set(undefined)
      this.activeSurface.set(null)
      this.clearDirty()
    }
  }, 'passmanager.entryEditor.resetForEntryChange')

  isActiveForEntry(entryId: string, surface?: PMEntryEditorSurface): boolean {
    if (this.activeEntryId() !== entryId) {
      return false
    }

    return surface ? this.activeSurface() === surface : this.activeSurface() !== null
  }

  reset(): void {
    this.activeEntryId.set(undefined)
    this.activeSurface.set(null)
    this.dirtyEntryId.set(undefined)
  }
}

export const pmEntryEditorModel = new PMEntryEditorModel()
