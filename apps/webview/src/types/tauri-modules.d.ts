declare module '@tauri-apps/plugin-dialog' {
  export type DialogFilter = {
    name?: string
    extensions?: string[]
  }

  export type SaveDialogOptions = {
    defaultPath?: string
    filters?: DialogFilter[]
  }

  export type OpenDialogOptions = {
    directory?: boolean
    multiple?: boolean
    defaultPath?: string
    title?: string
    filters?: DialogFilter[]
    [key: string]: unknown
  }

  export function save(options?: SaveDialogOptions): Promise<string | null>
  export function open(options?: OpenDialogOptions): Promise<string | string[] | null>
}

declare module '@tauri-apps/api/core' {
  export function invoke<T = unknown>(cmd: string, args?: Record<string, unknown>): Promise<T>
}
