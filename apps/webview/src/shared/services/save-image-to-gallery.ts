import {isSuccess, type RpcResult} from '@chromvoid/scheme'

import {tauriInvoke} from 'root/core/transport/tauri/ipc'

type SaveImageToGalleryResult = {
  name: string
  uri: string
}

export async function saveImageToGallery(
  fileId: number,
  fileName: string,
  mimeType?: string,
): Promise<SaveImageToGalleryResult> {
  const response = await tauriInvoke<RpcResult<SaveImageToGalleryResult>>('catalog_save_image_to_gallery', {
    args: {
      nodeId: fileId,
      fileName,
      mimeType: mimeType ?? null,
    },
  })

  if (!isSuccess(response)) {
    const message = response.error || 'catalog:save-image-to-gallery failed'
    const code = response.code ? ` (${response.code})` : ''
    throw new Error(`${message}${code}`)
  }

  return response.result
}
