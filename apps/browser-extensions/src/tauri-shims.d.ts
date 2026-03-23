declare module '@tauri-apps/plugin-dialog' {
  export type SaveDialogFilter = {
    name: string
    extensions: string[]
  }

  export type SaveDialogOptions = {
    defaultPath?: string
    filters?: SaveDialogFilter[]
  }

  export function save(options?: SaveDialogOptions): Promise<string | null>
}

declare module '@tauri-apps/api/core' {
  export function invoke<T = unknown>(command: string, args?: Record<string, unknown>): Promise<T>
}
