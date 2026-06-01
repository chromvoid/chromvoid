import {isTauriRuntime} from 'root/core/runtime/runtime'
import {tauriInvoke} from 'root/core/transport/tauri/ipc'

type MemoryStats = {
  used_js_heap_size?: number
  total_js_heap_size?: number
  js_heap_size_limit?: number
}

type ExtendedPerformance = Performance & {
  memory?: {
    usedJSHeapSize?: number
    totalJSHeapSize?: number
    jsHeapSizeLimit?: number
  }
}

let didResetLog = false

function getMemoryStats(): MemoryStats | null {
  const memory = (performance as ExtendedPerformance).memory
  if (!memory) return null

  return {
    used_js_heap_size: typeof memory.usedJSHeapSize === 'number' ? memory.usedJSHeapSize : undefined,
    total_js_heap_size:
      typeof memory.totalJSHeapSize === 'number' ? memory.totalJSHeapSize : undefined,
    js_heap_size_limit:
      typeof memory.jsHeapSizeLimit === 'number' ? memory.jsHeapSizeLimit : undefined,
  }
}

export function writeAndroidUnlockDebug(scope: string, event: string, meta?: Record<string, unknown>) {
  if (!isTauriRuntime()) return

  const payload = {
    ts: new Date().toISOString(),
    scope,
    event,
    visibility_state: typeof document !== 'undefined' ? document.visibilityState : undefined,
    memory: getMemoryStats(),
    ...meta,
  }

  const message = JSON.stringify(payload)
  const reset = !didResetLog
  didResetLog = true

  void tauriInvoke('unlock_debug_log', {message, reset}).catch(() => {})
}
