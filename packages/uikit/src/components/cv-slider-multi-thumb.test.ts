import {afterEach, describe, expect, it} from 'vitest'

import {CVSliderMultiThumb} from './cv-slider-multi-thumb'

const settle = async (element: CVSliderMultiThumb) => {
  await element.updateComplete
  await Promise.resolve()
  await element.updateComplete
  await Promise.resolve()
}

const mockTrackRect = (track: HTMLElement, rect: Partial<DOMRect>) => {
  Object.defineProperty(track, 'getBoundingClientRect', {
    configurable: true,
    value: () =>
      ({
        x: rect.x ?? rect.left ?? 0,
        y: rect.y ?? rect.top ?? 0,
        width: rect.width ?? 0,
        height: rect.height ?? 0,
        top: rect.top ?? 0,
        left: rect.left ?? 0,
        right: rect.right ?? (rect.left ?? 0) + (rect.width ?? 0),
        bottom: rect.bottom ?? (rect.top ?? 0) + (rect.height ?? 0),
        toJSON: () => ({}),
      }) as DOMRect,
  })
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('cv-slider-multi-thumb', () => {
  it('handles keyboard updates and emits input/change', async () => {
    CVSliderMultiThumb.define()

    const slider = document.createElement('cv-slider-multi-thumb') as CVSliderMultiThumb
    slider.values = [20, 80]
    slider.step = 5

    const inputValues: number[][] = []
    const changeValues: number[][] = []

    slider.addEventListener('cv-input', (event) => {
      inputValues.push((event as unknown as CustomEvent<{values: number[]}>).detail.values)
    })

    slider.addEventListener('cv-change', (event) => {
      changeValues.push((event as unknown as CustomEvent<{values: number[]}>).detail.values)
    })

    document.body.append(slider)
    await settle(slider)

    const thumbs = Array.from(slider.shadowRoot?.querySelectorAll('[part="thumb"]') ?? []) as HTMLButtonElement[]
    thumbs[0]!.dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowRight', bubbles: true}))
    await settle(slider)

    expect(slider.values).toEqual([25, 80])
    expect(inputValues).toEqual([[25, 80]])
    expect(changeValues).toEqual([[25, 80]])
  })

  it('moves nearest thumb from track pointer drag and emits change on release', async () => {
    CVSliderMultiThumb.define()

    const slider = document.createElement('cv-slider-multi-thumb') as CVSliderMultiThumb
    slider.values = [20, 80]
    slider.min = 0
    slider.max = 100

    const changeValues: number[][] = []
    slider.addEventListener('cv-change', (event) => {
      changeValues.push((event as unknown as CustomEvent<{values: number[]}>).detail.values)
    })

    document.body.append(slider)
    await settle(slider)

    const track = slider.shadowRoot?.querySelector('[part="track"]') as HTMLElement
    mockTrackRect(track, {left: 0, top: 0, width: 200, height: 20})

    track.dispatchEvent(new MouseEvent('mousedown', {clientX: 170, clientY: 10, bubbles: true}))
    document.dispatchEvent(new MouseEvent('mousemove', {clientX: 180, clientY: 10, bubbles: true}))
    document.dispatchEvent(new MouseEvent('mouseup', {clientX: 180, clientY: 10, bubbles: true}))
    await settle(slider)

    expect(slider.values).toEqual([20, 90])
    expect(changeValues.at(-1)).toEqual([20, 90])
  })

  it('keeps thumbs ordered and does not allow crossing', async () => {
    CVSliderMultiThumb.define()

    const slider = document.createElement('cv-slider-multi-thumb') as CVSliderMultiThumb
    slider.values = [40, 60]

    document.body.append(slider)
    await settle(slider)

    const thumbs = Array.from(slider.shadowRoot?.querySelectorAll('[part="thumb"]') ?? []) as HTMLButtonElement[]
    for (let step = 0; step < 40; step += 1) {
      thumbs[1]!.dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowLeft', bubbles: true}))
    }
    await settle(slider)

    expect(slider.values).toEqual([40, 40])
  })

  it('prevents keyboard and pointer updates when disabled', async () => {
    CVSliderMultiThumb.define()

    const slider = document.createElement('cv-slider-multi-thumb') as CVSliderMultiThumb
    slider.values = [30, 70]
    slider.disabled = true

    document.body.append(slider)
    await settle(slider)

    const track = slider.shadowRoot?.querySelector('[part="track"]') as HTMLElement
    mockTrackRect(track, {left: 0, top: 0, width: 200, height: 20})

    const thumbs = Array.from(slider.shadowRoot?.querySelectorAll('[part="thumb"]') ?? []) as HTMLButtonElement[]
    thumbs[0]!.dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowRight', bubbles: true}))
    track.dispatchEvent(new MouseEvent('mousedown', {clientX: 170, clientY: 10, bubbles: true}))
    document.dispatchEvent(new MouseEvent('mouseup', {clientX: 180, clientY: 10, bubbles: true}))
    await settle(slider)

    expect(slider.values).toEqual([30, 70])
    expect(thumbs.every((thumb) => thumb.getAttribute('aria-disabled') === 'true')).toBe(true)
    expect(thumbs.every((thumb) => thumb.getAttribute('tabindex') === '-1')).toBe(true)
  })
})
