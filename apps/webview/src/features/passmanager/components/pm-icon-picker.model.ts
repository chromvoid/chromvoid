import {atom, wrap} from '@reatom/core'

import {type PMIconUploadPhase, type PMStoredIcon, pmIconStore} from '../models/pm-icon-store'

export type PMIconPickerUploadPhase = 'idle' | PMIconUploadPhase | 'refreshing'

export type PMIconPickerUploadState = {
  phase: PMIconPickerUploadPhase
  fileName: string
}

export class PMIconPickerModel {
  readonly dialogOpen = atom(false, 'passmanager.iconPicker.dialogOpen')
  readonly iconError = atom('', 'passmanager.iconPicker.iconError')
  readonly iconUploadState = atom<PMIconPickerUploadState>(
    {phase: 'idle', fileName: ''},
    'passmanager.iconPicker.iconUploadState',
  )
  readonly iconListError = atom('', 'passmanager.iconPicker.iconListError')
  readonly isLoadingIcons = atom(false, 'passmanager.iconPicker.isLoadingIcons')
  readonly storedIcons = atom<PMStoredIcon[]>([], 'passmanager.iconPicker.storedIcons')

  private connected = false
  private revision = 0

  connect(): void {
    if (this.connected) return
    this.connected = true
    void this.loadStoredIcons()
  }

  disconnect(): void {
    if (!this.connected) return
    this.connected = false
    this.revision += 1
    this.isLoadingIcons.set(false)
    this.iconUploadState.set({phase: 'idle', fileName: ''})
  }

  openChooser(): void {
    this.dialogOpen.set(true)
  }

  closeDialog(): void {
    this.dialogOpen.set(false)
  }

  setDialogOpen(open: boolean): void {
    this.dialogOpen.set(open)
  }

  isUploading(): boolean {
    return this.iconUploadState().phase !== 'idle'
  }

  resetIcon(): undefined {
    this.iconError.set('')
    return undefined
  }

  pickStoredIcon(iconRef: string): string | undefined {
    const ref = iconRef.trim()
    if (!ref) return undefined
    this.iconError.set('')
    return ref
  }

  reloadIcons(): void {
    if (this.isUploading()) return
    void this.loadStoredIcons()
  }

  async uploadFile(file: File): Promise<string | null> {
    if (!this.connected) return null
    if (this.isUploading()) return null

    const revision = this.revision
    const fileName = file.name.trim()
    this.iconError.set('')
    this.iconUploadState.set({phase: 'preparing', fileName})

    try {
      const iconRef = await wrap(
        pmIconStore.uploadIcon(file, {
          onPhase: (phase) => {
            if (this.isLive(revision)) {
              this.iconUploadState.set({phase, fileName})
            }
          },
        }),
      )
      if (!this.isLive(revision)) return null

      this.addStoredIcon(iconRef)
      this.iconUploadState.set({phase: 'refreshing', fileName})
      await this.loadStoredIcons()
      if (!this.isLive(revision)) return null

      return iconRef
    } catch (error) {
      if (this.isLive(revision)) {
        this.iconError.set(error instanceof Error ? error.message : String(error))
      }
      return null
    } finally {
      if (this.isLive(revision)) {
        this.iconUploadState.set({phase: 'idle', fileName: ''})
      }
    }
  }

  async loadStoredIcons(): Promise<void> {
    if (!this.connected) return
    const revision = this.revision
    this.isLoadingIcons.set(true)
    this.iconListError.set('')
    try {
      const icons = await wrap(pmIconStore.listIcons())
      if (!this.isLive(revision)) return
      this.storedIcons.set(icons)
    } catch (error) {
      if (this.isLive(revision)) {
        this.iconListError.set(error instanceof Error ? error.message : String(error))
      }
    } finally {
      if (this.isLive(revision)) {
        this.isLoadingIcons.set(false)
      }
    }
  }

  private addStoredIcon(iconRef: string): void {
    const ref = iconRef.trim()
    if (!ref) return
    const current = this.storedIcons()
    if (current.some((icon) => icon.iconRef === ref)) return

    this.storedIcons.set([
      {
        iconRef: ref,
        mimeType: 'image/png',
        width: 0,
        height: 0,
        bytes: 0,
        createdAt: 0,
        updatedAt: 0,
      },
      ...current,
    ])
  }

  private isLive(revision: number): boolean {
    return this.connected && this.revision === revision
  }
}
