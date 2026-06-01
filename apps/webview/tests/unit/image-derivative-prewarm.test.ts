import {afterEach, describe, expect, it, vi} from 'vitest'

import {clearAppContext, createMockAppContext, initAppContext} from '../../src/shared/services/app-context'
import {
  cancelImageDerivativePrewarmJobs,
  hasPendingUploadedImageDerivativePrewarm,
  prewarmImageDerivative,
  prewarmUploadedImageDerivativeWhenVisible,
  registerUploadedImageForDerivativePrewarm,
  resetImageDerivativePrewarmForTests,
} from '../../src/features/media/components/image-derivative-prewarm'
import {
  getImageDisplaySchedulerDebugSnapshot,
  resetImageDisplaySchedulerForTests,
} from '../../src/features/media/components/image-display-scheduler'

type DerivativeOutput = {
  bytes: Uint8Array
  mimeType: string
  name: string
  chunkSize: number
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return {promise, resolve}
}

function derivativeOutput(name = 'image.webp'): DerivativeOutput {
  return {
    bytes: new TextEncoder().encode('webp'),
    mimeType: 'image/webp',
    name,
    chunkSize: 4096,
  }
}

afterEach(() => {
  resetImageDerivativePrewarmForTests()
  resetImageDisplaySchedulerForTests()
  clearAppContext()
})

describe('image derivative prewarm', () => {
  it('records uploaded images without scheduling derivative work immediately', () => {
    registerUploadedImageForDerivativePrewarm({
      id: 42,
      name: 'photo.jpg',
      mimeType: 'image/jpeg',
    })
    registerUploadedImageForDerivativePrewarm({
      id: 43,
      name: 'notes.txt',
      mimeType: 'text/plain',
    })

    expect(hasPendingUploadedImageDerivativePrewarm(42)).toBe(true)
    expect(hasPendingUploadedImageDerivativePrewarm(43)).toBe(false)
  })

  it('prewarms uploaded image derivatives only when the image becomes visible', async () => {
    const pending = deferred<DerivativeOutput>()
    const previewImage = vi.fn(() => pending.promise)
    initAppContext(
      createMockAppContext({
        ws: {
          kind: 'tauri',
          previewImage,
        } as any,
      }),
    )

    registerUploadedImageForDerivativePrewarm({
      id: 44,
      name: 'visible.jpg',
      mimeType: 'image/jpeg',
    })

    const prewarm = prewarmUploadedImageDerivativeWhenVisible({
      id: 44,
      name: 'visible.jpg',
      mimeType: 'image/jpeg',
    })

    await vi.waitFor(() => {
      expect(previewImage).toHaveBeenCalledTimes(1)
    })
    expect(previewImage).toHaveBeenCalledWith(44, {
      fileName: 'visible.jpg',
      mimeType: 'image/jpeg',
      lastModified: null,
    })

    pending.resolve(derivativeOutput())
    await prewarm

    expect(hasPendingUploadedImageDerivativePrewarm(44)).toBe(false)
  })

  it('uses the scheduler prewarm cap and cancels stale prewarm jobs', async () => {
    const first = deferred<DerivativeOutput>()
    const second = deferred<DerivativeOutput>()
    const previewImage = vi
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)
    initAppContext(
      createMockAppContext({
        ws: {
          kind: 'tauri',
          previewImage,
        } as any,
      }),
    )

    const firstPrewarm = prewarmImageDerivative({
      id: 45,
      name: 'first.jpg',
      mimeType: 'image/jpeg',
    })
    const secondPrewarm = prewarmImageDerivative({
      id: 46,
      name: 'second.jpg',
      mimeType: 'image/jpeg',
    })

    await vi.waitFor(() => {
      expect(previewImage).toHaveBeenCalledTimes(1)
    })
    expect(getImageDisplaySchedulerDebugSnapshot()).toMatchObject({
      activeByType: {prewarm: 1},
      queuedByType: {prewarm: 1},
    })

    cancelImageDerivativePrewarmJobs()

    await expect(secondPrewarm).rejects.toMatchObject({name: 'AbortError'})
    await expect(firstPrewarm).rejects.toMatchObject({name: 'AbortError'})

    first.resolve(derivativeOutput('first.webp'))
    second.resolve(derivativeOutput('second.webp'))
  })
})
