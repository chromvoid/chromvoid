export type FileManagerCommand =
  | {kind: 'create-dir'}
  | {kind: 'create-markdown-note'}
  | {kind: 'upload-files'; files: FileList}
  | {kind: 'upload-paths'; paths: string[]}
  | {kind: 'native-upload'}

const listeners = new Set<(command: FileManagerCommand) => void>()

export function emitFileManagerCommand(command: FileManagerCommand): void {
  for (const listener of [...listeners]) {
    listener(command)
  }
}

export function subscribeFileManagerCommand(listener: (command: FileManagerCommand) => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
