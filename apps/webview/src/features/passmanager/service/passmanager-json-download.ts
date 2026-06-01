import {isTauriRuntime} from 'root/core/runtime/runtime'

function downloadJsonBrowser(json: string, filename: string): void {
  const blob = new Blob([json], {type: 'application/json'})
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.rel = 'noopener'
  anchor.style.display = 'none'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000)
}

export async function downloadPassmanagerJson(
  jsonData: unknown,
  filename = 'passmanager-export.json',
): Promise<boolean> {
  const json = JSON.stringify(jsonData, null, 2)

  if (isTauriRuntime()) {
    try {
      const {save} = await import('@tauri-apps/plugin-dialog')
      const targetPath = await save({
        defaultPath: filename,
        filters: [{name: 'JSON', extensions: ['json']}],
      })
      if (!targetPath) return false

      const {invoke} = await import('@tauri-apps/api/core')
      await invoke('write_text_file', {path: targetPath, content: json})
      return true
    } catch {
      downloadJsonBrowser(json, filename)
      return true
    }
  }

  downloadJsonBrowser(json, filename)
  return true
}
