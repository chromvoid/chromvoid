import {loadImageByFileId} from 'root/features/media/components/image-loader'
import {getMimeType} from 'root/utils/mime-type'

/**
 * Feature-detect Web Share API with file support
 */
export function canShareFiles(): boolean {
  if (typeof navigator.share !== 'function') return false
  if (typeof navigator.canShare !== 'function') return false

  try {
    const testFile = new File([''], 'test.txt', {type: 'text/plain'})
    return navigator.canShare({files: [testFile]})
  } catch {
    return false
  }
}

/**
 * Downloads a file by fileId and shares it via the Web Share API
 */
export async function shareFile(fileId: number, fileName: string): Promise<void> {
  try {
    const {url} = await loadImageByFileId(fileId, fileName)
    const response = await fetch(url)
    const blob = await response.blob()
    URL.revokeObjectURL(url)

    const mimeType = getMimeType(fileName)
    const file = new File([blob], fileName, {type: mimeType})

    await navigator.share({files: [file]})
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return
    }
    console.error('Failed to share file:', error)
  }
}
