export type FileOpenCommand =
  | {
      kind: 'gallery'
      fileId: number
    }
  | {
      kind: 'document'
      mode: 'markdown'
      fileId: number
    }
  | {
      kind: 'preview'
      fileId: number
    }
  | {
      kind: 'video'
      fileId: number
      fileName: string
    }
  | {
      kind: 'audio'
      fileId: number
      fileName: string
    }

export type FileActionCommand = {
  kind: 'action'
  action: string
  fileId: number
}

export type FileCommand = FileOpenCommand | FileActionCommand

type FileCommandListener = (command: FileCommand) => void

const listeners = new Set<FileCommandListener>()

export function emitFileCommand(command: FileCommand): void {
  for (const listener of listeners) {
    listener(command)
  }
}

export function emitFileOpenCommand(command: FileOpenCommand): void {
  emitFileCommand(command)
}

export function emitFileActionCommand(command: FileActionCommand): void {
  emitFileCommand(command)
}

export function subscribeFileCommand(listener: FileCommandListener): () => void {
  listeners.add(listener)

  return () => {
    listeners.delete(listener)
  }
}
