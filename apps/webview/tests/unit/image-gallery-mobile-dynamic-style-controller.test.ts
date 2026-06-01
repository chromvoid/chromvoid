import {describe, expect, it, vi} from 'vitest'

import {MobileGalleryDynamicStyleController} from '../../src/features/media/components/image-gallery-mobile/image-gallery-mobile-dynamic-style-controller'
import type {DynamicStyleSnapshot} from '../../src/features/media/components/image-gallery-mobile/image-gallery-mobile.model'

const BASE_STYLES: DynamicStyleSnapshot = {
  imageTranslateX: '0px',
  imageTranslateY: '0px',
  imageScale: '1',
  imageTransition: 'transform 0.18s ease-out',
  viewportTranslateY: '0px',
  viewportOpacity: '1',
}

describe('mobile gallery dynamic style controller', () => {
  it('applies initial styles once, updates later styles, and disconnects', () => {
    const host = document.createElement('div')
    const setProperty = vi.spyOn(host.style, 'setProperty')
    let listener: ((styles: DynamicStyleSnapshot) => void) | null = null
    const unsubscribe = vi.fn()
    let styles = BASE_STYLES
    const controller = new MobileGalleryDynamicStyleController({
      host,
      getStyles: () => styles,
      subscribeStyles: (nextListener) => {
        listener = nextListener
        nextListener(styles)
        return unsubscribe
      },
    })

    controller.connect()

    expect(setProperty).toHaveBeenCalledTimes(6)
    expect(host.style.getPropertyValue('--image-gallery-mobile-image-transition')).toBe(
      'transform 0.18s ease-out',
    )

    styles = {...BASE_STYLES, imageScale: '2'}
    listener?.(styles)

    expect(setProperty).toHaveBeenCalledTimes(12)

    controller.disconnect()
    listener?.({...BASE_STYLES, imageScale: '3'})

    expect(unsubscribe).toHaveBeenCalledTimes(1)
    expect(setProperty).toHaveBeenCalledTimes(12)
  })
})
