import {action, atom, computed, wrap} from '@reatom/core'

type FileViewerKind = 'empty' | 'image' | 'text' | 'unknown'

export class FileViewerModel {
  private currentImageUrl: string | undefined
  private textLoadVersion = 0

  private readonly fileState = atom<File | undefined>(undefined, 'passmanager.fileViewer.file')
  private readonly imageUrlState = atom('', 'passmanager.fileViewer.imageUrl')
  private readonly textValueState = atom('', 'passmanager.fileViewer.textValue')
  private readonly textLoadingState = atom(false, 'passmanager.fileViewer.textLoading')

  readonly state = {
    file: this.fileState,
    imageUrl: this.imageUrlState,
    textValue: this.textValueState,
    textLoading: this.textLoadingState,
    kind: computed<FileViewerKind>(() => {
      const file = this.fileState()
      if (!file) return 'empty'
      if (file.type.startsWith('image')) return 'image'
      if (file.type.startsWith('text')) return 'text'
      return 'unknown'
    }, 'passmanager.fileViewer.kind'),
  }

  readonly actions = {
    setFile: action((value: File | undefined) => {
      const next = value instanceof File ? value : undefined
      if (next === this.fileState()) return

      this.fileState.set(next)
      this.resetPreviewState()

      if (!next) {
        return
      }

      if (next.type.startsWith('image')) {
        const url = URL.createObjectURL(next)
        this.currentImageUrl = url
        this.imageUrlState.set(url)
        return
      }

      if (next.type.startsWith('text')) {
        const version = this.bumpTextLoadVersion()
        this.textLoadingState.set(true)
        void this.loadTextFile(next, version)
      }
    }, 'passmanager.fileViewer.setFile'),
  }

  disconnect(): void {
    this.bumpTextLoadVersion()
    this.resetPreviewState()
    this.fileState.set(undefined)
  }

  private async loadTextFile(file: File, version: number): Promise<void> {
    try {
      const text = await wrap(file.text())
      if (!this.isCurrentTextLoad(file, version)) return
      this.textValueState.set(text)
    } finally {
      if (this.isCurrentTextLoad(file, version)) {
        this.textLoadingState.set(false)
      }
    }
  }

  private isCurrentTextLoad(file: File, version: number): boolean {
    return this.fileState() === file && this.textLoadVersion === version
  }

  private bumpTextLoadVersion(): number {
    this.textLoadVersion += 1
    return this.textLoadVersion
  }

  private resetPreviewState(): void {
    this.bumpTextLoadVersion()
    this.textLoadingState.set(false)
    this.textValueState.set('')
    if (!this.currentImageUrl) {
      this.imageUrlState.set('')
      return
    }

    URL.revokeObjectURL(this.currentImageUrl)
    this.currentImageUrl = undefined
    this.imageUrlState.set('')
  }
}
