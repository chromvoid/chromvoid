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
      const {pickTextFileTargetViaTauri, writeTextFileViaTauri} = await import(
        'root/core/transport/tauri/tauri-binary-ops'
      )
      const target = await pickTextFileTargetViaTauri({
        defaultPath: filename,
        filters: [{name: 'JSON', extensions: ['json']}],
      })
      if (!target) return false

      await writeTextFileViaTauri(target.token, json)
      return true
    } catch {
      downloadJsonBrowser(json, filename)
      return true
    }
  }

  downloadJsonBrowser(json, filename)
  return true
}
