import {state} from '@statx/core'

export type DragDropHandlers = {
  onFiles: (files: FileList) => void | Promise<void>
  onActiveChange?: (active: boolean) => void | Promise<void>
}

export class DragDropService {
  private readonly dragCounter = state(0)
  private handlers: DragDropHandlers

  constructor(handlers: DragDropHandlers) {
    this.handlers = handlers
  }

  isActive(): boolean {
    return this.dragCounter() > 0
  }

  private isExternalFileDrag(e: DragEvent): boolean {
    const dt = e.dataTransfer
    if (!dt) return false
    // Показываем overlay только для перетаскивания файлов из вне окна
    // Внутренний DnD помечаем собственным типом 'application/json'
    const types = Array.from(dt.types || [])
    const hasFiles = types.includes('Files')
    const isInternal = types.includes('application/json')
    return hasFiles && !isInternal
  }

  attach(): void {
    document.addEventListener('dragenter', this.handleDragEnter)
    document.addEventListener('dragover', this.handleDragOver)
    document.addEventListener('dragleave', this.handleDragLeave)
    document.addEventListener('drop', this.handleDrop)
  }

  detach(): void {
    document.removeEventListener('dragenter', this.handleDragEnter)
    document.removeEventListener('dragover', this.handleDragOver)
    document.removeEventListener('dragleave', this.handleDragLeave)
    document.removeEventListener('drop', this.handleDrop)
  }

  private handleDragEnter = (e: DragEvent) => {
    if (!this.isExternalFileDrag(e)) return
    e.preventDefault()
    this.dragCounter.set(this.dragCounter() + 1)
    void this.handlers.onActiveChange?.(this.isActive())
  }

  private handleDragOver = (e: DragEvent) => {
    if (!this.isExternalFileDrag(e)) return
    e.preventDefault()
  }

  private handleDragLeave = (e: DragEvent) => {
    if (!this.isExternalFileDrag(e)) return
    const next = Math.max(0, this.dragCounter() - 1)
    this.dragCounter.set(next)
    void this.handlers.onActiveChange?.(this.isActive())
  }

  private handleDrop = async (e: DragEvent) => {
    const isExternal = this.isExternalFileDrag(e)
    if (isExternal) e.preventDefault()
    this.dragCounter.set(0)
    void this.handlers.onActiveChange?.(false)
    if (isExternal) {
      const files = e.dataTransfer?.files
      if (files && files.length > 0) {
        await this.handlers.onFiles(files)
      }
    }
  }
}
