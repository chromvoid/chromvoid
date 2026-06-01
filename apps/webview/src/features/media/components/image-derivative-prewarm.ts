import {tryGetAppContext} from 'root/shared/services/app-context'
import {resolveFileFormat} from 'root/utils/file-format-registry'
import type {GalleryDisplayVariant} from './image-gallery-v2/gallery.types'
import {
  getDefaultImageDisplayJobPriority,
  scheduleImageDisplayJob,
} from './image-display-scheduler'

export type ImageDerivativePrewarmVariant = Extract<
  GalleryDisplayVariant,
  'preview-image' | 'thumbnail-image'
>

export type ImageDerivativePrewarmTarget = {
  id: number
  name: string
  mimeType?: string | null
  lastModified?: number | null
}

export type ImageDerivativePrewarmOptions = {
  variant?: ImageDerivativePrewarmVariant
  signal?: AbortSignal
  intentId?: string
}

const pendingUploadedImagePrewarmTargets = new Map<number, ImageDerivativePrewarmTarget>()
const activePrewarmControllers = new Set<AbortController>()

function createAbortError() {
  return new DOMException('Aborted', 'AbortError')
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw createAbortError()
  }
}

function linkAbortSignal(source: AbortSignal | undefined, target: AbortController): () => void {
  if (!source) {
    return () => {}
  }

  if (source.aborted) {
    target.abort()
    return () => {}
  }

  const handleAbort = () => target.abort()
  source.addEventListener('abort', handleAbort, {once: true})
  return () => source.removeEventListener('abort', handleAbort)
}

export function isImageDerivativePrewarmCandidate(target: ImageDerivativePrewarmTarget): boolean {
  const format = resolveFileFormat({name: target.name, mimeType: target.mimeType})
  return (
    format.openBehavior.kind === 'gallery' ||
    (format.openBehavior.kind === 'preview' && format.openBehavior.mode === 'image')
  )
}

export function registerUploadedImageForDerivativePrewarm(target: ImageDerivativePrewarmTarget): void {
  if (!isImageDerivativePrewarmCandidate(target)) {
    return
  }

  pendingUploadedImagePrewarmTargets.set(target.id, target)
}

export function hasPendingUploadedImageDerivativePrewarm(imageId: number): boolean {
  return pendingUploadedImagePrewarmTargets.has(imageId)
}

export async function prewarmImageDerivative(
  target: ImageDerivativePrewarmTarget,
  options: ImageDerivativePrewarmOptions = {},
): Promise<void> {
  if (!isImageDerivativePrewarmCandidate(target)) {
    return
  }

  const appContext = tryGetAppContext()
  if (!appContext?.ws || appContext.ws.kind !== 'tauri') {
    return
  }

  const variant = options.variant ?? 'preview-image'
  const operation =
    variant === 'thumbnail-image'
      ? appContext.ws.thumbnailImage?.bind(appContext.ws)
      : appContext.ws.previewImage?.bind(appContext.ws)

  if (!operation) {
    return
  }

  const controller = new AbortController()
  const releaseAbortSignal = linkAbortSignal(options.signal, controller)
  activePrewarmControllers.add(controller)

  try {
    await scheduleImageDisplayJob(
      {
        jobType: 'prewarm',
        priority: getDefaultImageDisplayJobPriority('prewarm'),
        intentId:
          options.intentId ??
          `prewarm:${variant}:${target.id}:${target.lastModified ?? 0}`,
        signal: controller.signal,
      },
      async (signal) => {
        throwIfAborted(signal)
        await operation(target.id, {
          fileName: target.name,
          mimeType: target.mimeType,
          lastModified: target.lastModified ?? null,
        })
        throwIfAborted(signal)
      },
    )
  } finally {
    activePrewarmControllers.delete(controller)
    releaseAbortSignal()
  }
}

export async function prewarmUploadedImageDerivativeWhenVisible(
  target: ImageDerivativePrewarmTarget,
  options: ImageDerivativePrewarmOptions = {},
): Promise<boolean> {
  const pendingTarget = pendingUploadedImagePrewarmTargets.get(target.id)
  if (!pendingTarget) {
    return false
  }

  await prewarmImageDerivative(
    {
      ...pendingTarget,
      name: target.name || pendingTarget.name,
      mimeType: target.mimeType ?? pendingTarget.mimeType,
      lastModified: target.lastModified ?? pendingTarget.lastModified,
    },
    options,
  )
  pendingUploadedImagePrewarmTargets.delete(target.id)
  return true
}

export function cancelImageDerivativePrewarmJobs(): void {
  pendingUploadedImagePrewarmTargets.clear()
  for (const controller of activePrewarmControllers) {
    controller.abort()
  }
  activePrewarmControllers.clear()
}

export function resetImageDerivativePrewarmForTests(): void {
  cancelImageDerivativePrewarmJobs()
  pendingUploadedImagePrewarmTargets.clear()
}
