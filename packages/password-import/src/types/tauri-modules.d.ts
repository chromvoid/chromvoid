declare module '@tauri-apps/plugin-dialog' {
  export type DialogFilter = {
    name: string
    extensions: string[]
  }

  export type SaveDialogOptions = {
    defaultPath?: string
    filters?: DialogFilter[]
  }

  export function save(options?: SaveDialogOptions): Promise<string | null>
}

declare module '@tauri-apps/api/core' {
  export function invoke<T = unknown>(command: string, args?: Record<string, unknown>): Promise<T>
}
