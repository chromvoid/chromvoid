declare module '@tauri-apps/plugin-dialog' {
  export function save(options?: {
    defaultPath?: string
    filters?: Array<{name?: string; extensions?: string[]}>
  }): Promise<string | null>
}

declare module '@tauri-apps/api/core' {
  export function invoke<T = unknown>(command: string, args?: Record<string, unknown>): Promise<T>
}
