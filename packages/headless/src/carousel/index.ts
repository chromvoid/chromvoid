import {action, atom, computed, type Atom, type Computed} from '@reatom/core'

export interface CarouselSlide {
  id: string
  label?: string
  disabled?: boolean
}

export interface CarouselKeyboardEventLike {
  key: string
}

export interface CreateCarouselOptions {
  slides: readonly CarouselSlide[]
  idBase?: string
  ariaLabel?: string
  ariaLabelledBy?: string
  autoplay?: boolean
  autoplayIntervalMs?: number
  visibleSlides?: number
  initialActiveSlideIndex?: number
  initialPaused?: boolean
}

export interface CarouselState {
  activeSlideIndex: Atom<number>
  isPaused: Computed<boolean>
  slideCount: Computed<number>
  visibleSlideIndices: Computed<number[]>
}

export interface CarouselActions {
  moveNext(): void
  movePrev(): void
  moveTo(index: number): void
  play(): void
  pause(): void
  togglePlay(): void
  handleKeyDown(event: CarouselKeyboardEventLike): void
  handleFocusIn(): void
  handleFocusOut(): void
  handlePointerEnter(): void
  handlePointerLeave(): void
}

export interface CarouselRootProps {
  id: string
  role: 'region'
  'aria-roledescription': 'carousel'
  'aria-label'?: string
  'aria-labelledby'?: string
  'aria-live': 'off' | 'polite'
  onFocusIn: () => void
  onFocusOut: () => void
  onPointerEnter: () => void
  onPointerLeave: () => void
}

export interface CarouselSlideGroupProps {
  id: string
  role: 'group'
  'aria-label'?: string
}

export interface CarouselSlideProps {
  id: string
  role: 'group'
  'aria-roledescription': 'slide'
  'aria-label': string
  'aria-hidden': 'true' | 'false'
  'data-active': 'true' | 'false'
}

export interface CarouselControlButtonProps {
  id: string
  role: 'button'
  tabindex: '0'
  'aria-controls': string
  'aria-label': string
  onClick: () => void
}

export type CarouselPlayPauseButtonProps = CarouselControlButtonProps

export interface CarouselIndicatorProps {
  id: string
  role: 'button'
  tabindex: '0'
  'aria-controls': string
  'aria-label': string
  'aria-current'?: 'true'
  'data-active': 'true' | 'false'
  onClick: () => void
}

export interface CarouselContracts {
  getRootProps(): CarouselRootProps
  getSlideGroupProps(): CarouselSlideGroupProps
  getSlideProps(index: number): CarouselSlideProps
  getNextButtonProps(): CarouselControlButtonProps
  getPrevButtonProps(): CarouselControlButtonProps
  getPlayPauseButtonProps(): CarouselPlayPauseButtonProps
  getIndicatorProps(index: number): CarouselIndicatorProps
}

export interface CarouselModel {
  readonly state: CarouselState
  readonly actions: CarouselActions
  readonly contracts: CarouselContracts
}

const clampIndex = (value: number, count: number) => {
  if (count <= 0) return 0
  return Math.min(Math.max(value, 0), count - 1)
}

export function createCarousel(options: CreateCarouselOptions): CarouselModel {
  const idBase = options.idBase ?? 'carousel'
  const autoplayEnabled = options.autoplay ?? false
  const autoplayIntervalMs = Math.max(options.autoplayIntervalMs ?? 5000, 1)
  const visibleSlides = Math.max(options.visibleSlides ?? 1, 1)

  const slides = [...options.slides]
  const slideCountAtom = computed(() => slides.length, `${idBase}.slideCount`)

  const initialActiveSlideIndex = clampIndex(options.initialActiveSlideIndex ?? 0, slides.length)
  const activeSlideIndexAtom = atom<number>(initialActiveSlideIndex, `${idBase}.activeSlideIndex`)

  const isPointerInsideAtom = atom<boolean>(false, `${idBase}.isPointerInside`)
  const isFocusWithinAtom = atom<boolean>(false, `${idBase}.isFocusWithin`)
  const userPausedAtom = atom<boolean>(options.initialPaused ?? false, `${idBase}.userPaused`)
  const liveModeAtom = atom<'off' | 'polite'>(
    autoplayEnabled ? 'off' : 'polite',
    `${idBase}.liveMode`,
  )

  const isPausedAtom = computed(
    () => autoplayEnabled && (userPausedAtom() || isPointerInsideAtom() || isFocusWithinAtom()),
    `${idBase}.isPaused`,
  )

  const visibleSlideIndicesAtom = computed(() => {
    const count = slideCountAtom()
    if (count === 0) return []

    const start = clampIndex(activeSlideIndexAtom(), count)
    const length = Math.min(visibleSlides, count)
    return Array.from({length}, (_, offset) => (start + offset) % count)
  }, `${idBase}.visibleSlideIndices`)

  let rotationTimer: ReturnType<typeof setTimeout> | null = null

  const clearRotationTimer = () => {
    if (rotationTimer == null) return
    clearTimeout(rotationTimer)
    rotationTimer = null
  }

  const isAutoplayRunning = () => autoplayEnabled && !isPausedAtom() && slideCountAtom() > 1

  const setActiveByIndex = (index: number, source: 'manual' | 'auto' | 'programmatic') => {
    const count = slideCountAtom()
    if (count <= 0) {
      activeSlideIndexAtom.set(0)
      return
    }

    const target = ((index % count) + count) % count
    activeSlideIndexAtom.set(target)

    if (!autoplayEnabled) {
      liveModeAtom.set('polite')
      return
    }

    if (source === 'manual') {
      liveModeAtom.set('polite')
    }

    if (source === 'auto') {
      liveModeAtom.set('off')
    }
  }

  const syncAutoplay = () => {
    clearRotationTimer()

    if (!isAutoplayRunning()) {
      return
    }

    rotationTimer = setTimeout(() => {
      rotationTimer = null
      setActiveByIndex(activeSlideIndexAtom() + 1, 'auto')
      syncAutoplay()
    }, autoplayIntervalMs)
  }

  const moveNext = action(() => {
    setActiveByIndex(activeSlideIndexAtom() + 1, 'manual')
    syncAutoplay()
  }, `${idBase}.moveNext`)

  const movePrev = action(() => {
    setActiveByIndex(activeSlideIndexAtom() - 1, 'manual')
    syncAutoplay()
  }, `${idBase}.movePrev`)

  const moveTo = action((index: number) => {
    setActiveByIndex(index, 'manual')
    syncAutoplay()
  }, `${idBase}.moveTo`)

  const play = action(() => {
    userPausedAtom.set(false)
    syncAutoplay()
  }, `${idBase}.play`)

  const pause = action(() => {
    userPausedAtom.set(true)
    clearRotationTimer()
  }, `${idBase}.pause`)

  const togglePlay = action(() => {
    if (userPausedAtom()) {
      play()
    } else {
      pause()
    }
  }, `${idBase}.togglePlay`)

  const handleFocusIn = action(() => {
    isFocusWithinAtom.set(true)
    clearRotationTimer()
  }, `${idBase}.handleFocusIn`)

  const handleFocusOut = action(() => {
    isFocusWithinAtom.set(false)
    syncAutoplay()
  }, `${idBase}.handleFocusOut`)

  const handlePointerEnter = action(() => {
    isPointerInsideAtom.set(true)
    clearRotationTimer()
  }, `${idBase}.handlePointerEnter`)

  const handlePointerLeave = action(() => {
    isPointerInsideAtom.set(false)
    syncAutoplay()
  }, `${idBase}.handlePointerLeave`)

  const handleKeyDown = action((event: CarouselKeyboardEventLike) => {
    switch (event.key) {
      case 'ArrowRight':
        moveNext()
        return
      case 'ArrowLeft':
        movePrev()
        return
      case 'Home':
        moveTo(0)
        return
      case 'End':
        moveTo(slideCountAtom() - 1)
        return
      default:
        return
    }
  }, `${idBase}.handleKeyDown`)

  const rootId = `${idBase}-root`
  const slideGroupId = `${idBase}-slides`
  const slideId = (index: number) => `${idBase}-slide-${index}`

  const actions: CarouselActions = {
    moveNext,
    movePrev,
    moveTo,
    play,
    pause,
    togglePlay,
    handleKeyDown,
    handleFocusIn,
    handleFocusOut,
    handlePointerEnter,
    handlePointerLeave,
  }

  const contracts: CarouselContracts = {
    getRootProps() {
      return {
        id: rootId,
        role: 'region',
        'aria-roledescription': 'carousel',
        'aria-label': options.ariaLabel,
        'aria-labelledby': options.ariaLabelledBy,
        'aria-live': liveModeAtom(),
        onFocusIn: handleFocusIn,
        onFocusOut: handleFocusOut,
        onPointerEnter: handlePointerEnter,
        onPointerLeave: handlePointerLeave,
      }
    },
    getSlideGroupProps() {
      return {
        id: slideGroupId,
        role: 'group',
        'aria-label': 'Slides',
      }
    },
    getSlideProps(index: number) {
      const count = slideCountAtom()
      if (index < 0 || index >= count) {
        throw new Error(`Unknown carousel slide index: ${index}`)
      }

      const visible = visibleSlideIndicesAtom().includes(index)

      return {
        id: slideId(index),
        role: 'group',
        'aria-roledescription': 'slide',
        'aria-label': slides[index]?.label ?? `${index + 1} of ${count}`,
        'aria-hidden': visible ? 'false' : 'true',
        'data-active': index === activeSlideIndexAtom() ? 'true' : 'false',
      }
    },
    getNextButtonProps() {
      return {
        id: `${idBase}-next`,
        role: 'button',
        tabindex: '0',
        'aria-controls': slideGroupId,
        'aria-label': 'Next slide',
        onClick: moveNext,
      }
    },
    getPrevButtonProps() {
      return {
        id: `${idBase}-prev`,
        role: 'button',
        tabindex: '0',
        'aria-controls': slideGroupId,
        'aria-label': 'Previous slide',
        onClick: movePrev,
      }
    },
    getPlayPauseButtonProps() {
      const paused = userPausedAtom()

      return {
        id: `${idBase}-play-pause`,
        role: 'button',
        tabindex: '0',
        'aria-controls': slideGroupId,
        'aria-label': paused ? 'Start slide rotation' : 'Stop slide rotation',
        onClick: togglePlay,
      }
    },
    getIndicatorProps(index: number) {
      const count = slideCountAtom()
      if (index < 0 || index >= count) {
        throw new Error(`Unknown carousel indicator index: ${index}`)
      }

      const isActive = activeSlideIndexAtom() === index

      return {
        id: `${idBase}-indicator-${index}`,
        role: 'button',
        tabindex: '0',
        'aria-controls': slideId(index),
        'aria-label': `Go to slide ${index + 1}`,
        'aria-current': isActive ? 'true' : undefined,
        'data-active': isActive ? 'true' : 'false',
        onClick: () => moveTo(index),
      }
    },
  }

  const state: CarouselState = {
    activeSlideIndex: activeSlideIndexAtom,
    isPaused: isPausedAtom,
    slideCount: slideCountAtom,
    visibleSlideIndices: visibleSlideIndicesAtom,
  }

  syncAutoplay()

  return {
    state,
    actions,
    contracts,
  }
}
