import {afterEach, describe, expect, it, vi} from 'vitest'
import {createCarousel} from './index'

describe('createCarousel', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('supports manual navigation and wraps between slides', () => {
    const carousel = createCarousel({
      slides: [{id: 's1'}, {id: 's2'}, {id: 's3'}],
      initialActiveSlideIndex: 1,
    })

    carousel.actions.moveNext()
    expect(carousel.state.activeSlideIndex()).toBe(2)

    carousel.actions.moveNext()
    expect(carousel.state.activeSlideIndex()).toBe(0)

    carousel.actions.movePrev()
    expect(carousel.state.activeSlideIndex()).toBe(2)
  })

  it('pauses autoplay on focus and resumes on blur when not explicitly paused', () => {
    vi.useFakeTimers()

    const carousel = createCarousel({
      slides: [{id: 's1'}, {id: 's2'}, {id: 's3'}],
      autoplay: true,
      autoplayIntervalMs: 100,
    })

    vi.advanceTimersByTime(100)
    expect(carousel.state.activeSlideIndex()).toBe(1)

    carousel.actions.handleFocusIn()
    expect(carousel.state.isPaused()).toBe(true)

    vi.advanceTimersByTime(300)
    expect(carousel.state.activeSlideIndex()).toBe(1)

    carousel.actions.handleFocusOut()
    expect(carousel.state.isPaused()).toBe(false)

    vi.advanceTimersByTime(100)
    expect(carousel.state.activeSlideIndex()).toBe(2)
  })

  it('keeps rotation stopped after explicit pause until explicit play', () => {
    vi.useFakeTimers()

    const carousel = createCarousel({
      slides: [{id: 's1'}, {id: 's2'}, {id: 's3'}],
      autoplay: true,
      autoplayIntervalMs: 100,
    })

    carousel.actions.pause()
    expect(carousel.state.isPaused()).toBe(true)

    carousel.actions.handleFocusIn()
    carousel.actions.handleFocusOut()
    carousel.actions.handlePointerEnter()
    carousel.actions.handlePointerLeave()

    vi.advanceTimersByTime(300)
    expect(carousel.state.activeSlideIndex()).toBe(0)

    carousel.actions.play()
    vi.advanceTimersByTime(100)
    expect(carousel.state.activeSlideIndex()).toBe(1)
  })

  it('switches aria-live to polite on manual navigation and off on autoplay', () => {
    vi.useFakeTimers()

    const carousel = createCarousel({
      slides: [{id: 's1'}, {id: 's2'}, {id: 's3'}],
      autoplay: true,
      autoplayIntervalMs: 100,
    })

    expect(carousel.contracts.getRootProps()['aria-live']).toBe('off')

    carousel.actions.moveNext()
    expect(carousel.contracts.getRootProps()['aria-live']).toBe('polite')

    vi.advanceTimersByTime(100)
    expect(carousel.contracts.getRootProps()['aria-live']).toBe('off')
  })

  it('maps aria-hidden for visible and non-visible slides', () => {
    const carousel = createCarousel({
      slides: [{id: 's1'}, {id: 's2'}, {id: 's3'}],
      visibleSlides: 1,
      initialActiveSlideIndex: 1,
    })

    expect(carousel.contracts.getSlideProps(0)['aria-hidden']).toBe('true')
    expect(carousel.contracts.getSlideProps(1)['aria-hidden']).toBe('false')
    expect(carousel.contracts.getSlideProps(2)['aria-hidden']).toBe('true')
  })

  it('keeps indicator state synchronized with activeSlideIndex', () => {
    const carousel = createCarousel({
      idBase: 'hero',
      slides: [{id: 's1'}, {id: 's2'}, {id: 's3'}],
      initialActiveSlideIndex: 0,
    })

    expect(carousel.contracts.getIndicatorProps(0)).toMatchObject({
      'aria-current': 'true',
      'data-active': 'true',
      'aria-controls': 'hero-slide-0',
    })

    expect(carousel.contracts.getIndicatorProps(1)).toMatchObject({
      'aria-current': undefined,
      'data-active': 'false',
    })

    carousel.actions.moveTo(2)

    expect(carousel.contracts.getIndicatorProps(2)).toMatchObject({
      'aria-current': 'true',
      'data-active': 'true',
    })
  })

  it('returns required APG root and control contracts', () => {
    const carousel = createCarousel({
      idBase: 'gallery',
      ariaLabel: 'Featured content',
      slides: [{id: 's1'}, {id: 's2'}],
    })

    expect(carousel.contracts.getRootProps()).toMatchObject({
      id: 'gallery-root',
      role: 'region',
      'aria-roledescription': 'carousel',
      'aria-label': 'Featured content',
    })

    expect(carousel.contracts.getNextButtonProps()).toMatchObject({
      role: 'button',
      'aria-controls': 'gallery-slides',
      'aria-label': 'Next slide',
    })

    expect(carousel.contracts.getPlayPauseButtonProps()).toMatchObject({
      role: 'button',
      'aria-label': 'Stop slide rotation',
    })
    expect(carousel.contracts.getPlayPauseButtonProps()).not.toHaveProperty('aria-pressed')
  })

  it('navigates to first and last slides via Home and End keys', () => {
    const carousel = createCarousel({
      slides: [{id: 's1'}, {id: 's2'}, {id: 's3'}, {id: 's4'}],
      initialActiveSlideIndex: 2,
    })

    carousel.actions.handleKeyDown({key: 'Home'})
    expect(carousel.state.activeSlideIndex()).toBe(0)

    carousel.actions.handleKeyDown({key: 'End'})
    expect(carousel.state.activeSlideIndex()).toBe(3)
  })

  it('navigates via ArrowLeft and ArrowRight keyboard keys', () => {
    const carousel = createCarousel({
      slides: [{id: 's1'}, {id: 's2'}, {id: 's3'}],
      initialActiveSlideIndex: 0,
    })

    carousel.actions.handleKeyDown({key: 'ArrowRight'})
    expect(carousel.state.activeSlideIndex()).toBe(1)

    carousel.actions.handleKeyDown({key: 'ArrowLeft'})
    expect(carousel.state.activeSlideIndex()).toBe(0)
  })

  it('pauses autoplay on pointer hover and resumes on leave', () => {
    vi.useFakeTimers()

    const carousel = createCarousel({
      slides: [{id: 's1'}, {id: 's2'}, {id: 's3'}],
      autoplay: true,
      autoplayIntervalMs: 100,
    })

    vi.advanceTimersByTime(100)
    expect(carousel.state.activeSlideIndex()).toBe(1)

    carousel.actions.handlePointerEnter()
    expect(carousel.state.isPaused()).toBe(true)

    vi.advanceTimersByTime(300)
    expect(carousel.state.activeSlideIndex()).toBe(1)

    carousel.actions.handlePointerLeave()
    expect(carousel.state.isPaused()).toBe(false)

    vi.advanceTimersByTime(100)
    expect(carousel.state.activeSlideIndex()).toBe(2)
  })

  it('uses aria-live polite and isPaused false when autoplay is disabled', () => {
    const carousel = createCarousel({
      slides: [{id: 's1'}, {id: 's2'}, {id: 's3'}],
      autoplay: false,
    })

    expect(carousel.state.isPaused()).toBe(false)
    expect(carousel.contracts.getRootProps()['aria-live']).toBe('polite')

    carousel.actions.handleFocusIn()
    expect(carousel.state.isPaused()).toBe(false)

    carousel.actions.moveNext()
    expect(carousel.contracts.getRootProps()['aria-live']).toBe('polite')
  })

  it('sets aria-live to polite for keyboard navigation during autoplay', () => {
    vi.useFakeTimers()

    const carousel = createCarousel({
      slides: [{id: 's1'}, {id: 's2'}, {id: 's3'}],
      autoplay: true,
      autoplayIntervalMs: 200,
    })

    expect(carousel.contracts.getRootProps()['aria-live']).toBe('off')

    carousel.actions.handleKeyDown({key: 'ArrowRight'})
    expect(carousel.contracts.getRootProps()['aria-live']).toBe('polite')

    vi.advanceTimersByTime(200)
    expect(carousel.contracts.getRootProps()['aria-live']).toBe('off')
  })

  it('computes visibleSlideIndices correctly for multi-slide visibility', () => {
    const carousel = createCarousel({
      slides: [{id: 's1'}, {id: 's2'}, {id: 's3'}, {id: 's4'}],
      visibleSlides: 2,
      initialActiveSlideIndex: 0,
    })

    expect(carousel.state.visibleSlideIndices()).toEqual([0, 1])

    carousel.actions.moveTo(2)
    expect(carousel.state.visibleSlideIndices()).toEqual([2, 3])

    // Wraps: active=3, visible=[3,0]
    carousel.actions.moveTo(3)
    expect(carousel.state.visibleSlideIndices()).toEqual([3, 0])

    // aria-hidden maps correctly for multi-slide
    expect(carousel.contracts.getSlideProps(3)['aria-hidden']).toBe('false')
    expect(carousel.contracts.getSlideProps(0)['aria-hidden']).toBe('false')
    expect(carousel.contracts.getSlideProps(1)['aria-hidden']).toBe('true')
    expect(carousel.contracts.getSlideProps(2)['aria-hidden']).toBe('true')
  })

  it('togglePlay switches between paused and playing states', () => {
    vi.useFakeTimers()

    const carousel = createCarousel({
      slides: [{id: 's1'}, {id: 's2'}, {id: 's3'}],
      autoplay: true,
      autoplayIntervalMs: 100,
    })

    carousel.actions.togglePlay()
    vi.advanceTimersByTime(200)
    expect(carousel.state.activeSlideIndex()).toBe(0) // paused, no advance

    carousel.actions.togglePlay()
    vi.advanceTimersByTime(100)
    expect(carousel.state.activeSlideIndex()).toBe(1) // resumed
  })

  it('exposes lifecycle event handlers on getRootProps', () => {
    const carousel = createCarousel({
      slides: [{id: 's1'}, {id: 's2'}],
    })

    const rootProps = carousel.contracts.getRootProps()
    expect(typeof rootProps.onFocusIn).toBe('function')
    expect(typeof rootProps.onFocusOut).toBe('function')
    expect(typeof rootProps.onPointerEnter).toBe('function')
    expect(typeof rootProps.onPointerLeave).toBe('function')
  })

  it('keeps play/pause button label stable during transient hover pause', () => {
    vi.useFakeTimers()

    const carousel = createCarousel({
      slides: [{id: 's1'}, {id: 's2'}, {id: 's3'}],
      autoplay: true,
      autoplayIntervalMs: 100,
    })

    // Initially playing — label should say "Stop"
    expect(carousel.contracts.getPlayPauseButtonProps()['aria-label']).toBe('Stop slide rotation')
    expect(carousel.contracts.getPlayPauseButtonProps()).not.toHaveProperty('aria-pressed')

    // Hover pauses rotation transiently — but button should still say "Stop"
    // because the user hasn't explicitly paused
    carousel.actions.handlePointerEnter()
    expect(carousel.state.isPaused()).toBe(true) // rotation is paused
    expect(carousel.contracts.getPlayPauseButtonProps()['aria-label']).toBe('Stop slide rotation')
    expect(carousel.contracts.getPlayPauseButtonProps()).not.toHaveProperty('aria-pressed')

    // User explicitly pauses — now label flips
    carousel.actions.pause()
    expect(carousel.contracts.getPlayPauseButtonProps()['aria-label']).toBe('Start slide rotation')
    expect(carousel.contracts.getPlayPauseButtonProps()).not.toHaveProperty('aria-pressed')
  })

  it('does not autoplay with a single slide', () => {
    vi.useFakeTimers()

    const carousel = createCarousel({
      slides: [{id: 's1'}],
      autoplay: true,
      autoplayIntervalMs: 100,
    })

    vi.advanceTimersByTime(500)
    expect(carousel.state.activeSlideIndex()).toBe(0)
  })
})
