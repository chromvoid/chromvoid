import {action, atom, type Atom} from '@reatom/core'
import {createValueRange, clampValue, type ValueRangeState} from '../core/value-range'

export type WindowSplitterOrientation = 'horizontal' | 'vertical'

export interface CreateWindowSplitterOptions {
  idBase?: string
  min?: number
  max?: number
  position?: number
  step?: number
  orientation?: WindowSplitterOrientation
  ariaLabel?: string
  ariaLabelledBy?: string
  primaryPaneId?: string
  secondaryPaneId?: string
  isFixed?: boolean
  formatValueText?: (value: number) => string
  onPositionChange?: (value: number) => void
  snap?: string
  snapThreshold?: number
}

export interface WindowSplitterState {
  position: Atom<number>
  min: Atom<number>
  max: Atom<number>
  orientation: Atom<WindowSplitterOrientation>
  isDragging: Atom<boolean>
}

export interface WindowSplitterActions {
  setPosition(value: number): void
  moveStep(direction: -1 | 1): void
  moveToMin(): void
  moveToMax(): void
  startDragging(): void
  stopDragging(): void
  handleKeyDown(event: Pick<KeyboardEvent, 'key'>): void
}

export interface WindowSplitterProps {
  id: string
  role: 'separator'
  tabindex: '0'
  'aria-valuenow': string
  'aria-valuemin': string
  'aria-valuemax': string
  'aria-valuetext'?: string
  'aria-orientation': WindowSplitterOrientation
  'aria-controls': string
  'aria-label'?: string
  'aria-labelledby'?: string
  onKeyDown: (event: Pick<KeyboardEvent, 'key'>) => void
}

export interface WindowSplitterPaneProps {
  id: string
  'data-pane': 'primary' | 'secondary'
  'data-orientation': WindowSplitterOrientation
}

export interface WindowSplitterContracts {
  getSplitterProps(): WindowSplitterProps
  getPrimaryPaneProps(): WindowSplitterPaneProps
  getSecondaryPaneProps(): WindowSplitterPaneProps
}

export interface WindowSplitterModel {
  readonly state: WindowSplitterState
  readonly actions: WindowSplitterActions
  readonly contracts: WindowSplitterContracts
}

function parseSnapPoints(snap: string, min: number, max: number): number[] {
  return snap
    .trim()
    .split(/\s+/)
    .map((s) => {
      if (s.endsWith('%')) {
        const pct = parseFloat(s) / 100
        return min + pct * (max - min)
      }
      return parseFloat(s)
    })
    .filter((n) => !isNaN(n))
}

function resolveSnap(
  value: number,
  snap: string | undefined,
  snapThreshold: number,
  min: number,
  max: number,
): number {
  if (!snap) return value
  const points = parseSnapPoints(snap, min, max)
  if (points.length === 0) return value
  const firstPoint = points[0]
  if (firstPoint === undefined) return value

  let nearest = firstPoint
  let minDist = Math.abs(value - nearest)
  for (const p of points) {
    const d = Math.abs(value - p)
    if (d < minDist) {
      minDist = d
      nearest = p
    }
  }
  return minDist <= snapThreshold ? nearest : value
}

const updatePosition = (
  valueAtom: ValueRangeState['value'],
  update: () => void,
  onPositionChange?: (value: number) => void,
) => {
  const previous = valueAtom()
  update()
  const next = valueAtom()

  if (next !== previous) {
    onPositionChange?.(next)
  }
}

export function createWindowSplitter(options: CreateWindowSplitterOptions = {}): WindowSplitterModel {
  const idBase = options.idBase ?? 'window-splitter'
  const orientationAtom = atom<WindowSplitterOrientation>(
    options.orientation ?? 'horizontal',
    `${idBase}.orientation`,
  )
  const isDraggingAtom = atom<boolean>(false, `${idBase}.isDragging`)
  const isFixed = options.isFixed ?? false
  const snapThreshold = options.snapThreshold ?? 12

  const min = options.min ?? 0
  const max = options.max ?? 100

  const range = createValueRange({
    idBase: `${idBase}.range`,
    min,
    max,
    step: options.step,
    initialValue: options.position,
  })

  const applySnappedPosition = (value: number) => {
    const currentMin = range.state.min()
    const currentMax = range.state.max()
    // clampValue is applied by setValue internally, but we need to snap after clamping
    const clamped = clampValue(value, currentMin, currentMax)
    const snapped = resolveSnap(clamped, options.snap, snapThreshold, currentMin, currentMax)
    range.actions.setValue(snapped)
  }

  const setPosition = action((value: number) => {
    updatePosition(
      range.state.value,
      () => {
        applySnappedPosition(value)
      },
      options.onPositionChange,
    )
  }, `${idBase}.setPosition`)

  const moveStep = action((direction: -1 | 1) => {
    updatePosition(
      range.state.value,
      () => {
        if (direction > 0) {
          range.actions.increment()
        } else {
          range.actions.decrement()
        }
      },
      options.onPositionChange,
    )
  }, `${idBase}.moveStep`)

  const moveToMin = action(() => {
    updatePosition(
      range.state.value,
      () => {
        range.actions.setFirst()
      },
      options.onPositionChange,
    )
  }, `${idBase}.moveToMin`)

  const moveToMax = action(() => {
    updatePosition(
      range.state.value,
      () => {
        range.actions.setLast()
      },
      options.onPositionChange,
    )
  }, `${idBase}.moveToMax`)

  const toggleFixed = () => {
    if (!isFixed) return

    const currentMin = range.state.min()
    const currentMax = range.state.max()
    const midpoint = currentMin + (currentMax - currentMin) / 2

    if (range.state.value() <= midpoint) {
      moveToMax()
    } else {
      moveToMin()
    }
  }

  const startDragging = action(() => {
    isDraggingAtom.set(true)
  }, `${idBase}.startDragging`)

  const stopDragging = action(() => {
    isDraggingAtom.set(false)
  }, `${idBase}.stopDragging`)

  const handleKeyDown = action((event: Pick<KeyboardEvent, 'key'>) => {
    const orientation = orientationAtom()

    switch (event.key) {
      case 'ArrowLeft':
        if (!isFixed && orientation === 'vertical') {
          moveStep(-1)
        }
        return
      case 'ArrowRight':
        if (!isFixed && orientation === 'vertical') {
          moveStep(1)
        }
        return
      case 'ArrowUp':
        if (!isFixed && orientation === 'horizontal') {
          moveStep(-1)
        }
        return
      case 'ArrowDown':
        if (!isFixed && orientation === 'horizontal') {
          moveStep(1)
        }
        return
      case 'Home':
        moveToMin()
        return
      case 'End':
        moveToMax()
        return
      case 'Enter':
        toggleFixed()
        return
      default:
        return
    }
  }, `${idBase}.handleKeyDown`)

  const actions: WindowSplitterActions = {
    setPosition,
    moveStep,
    moveToMin,
    moveToMax,
    startDragging,
    stopDragging,
    handleKeyDown,
  }

  const splitterId = `${idBase}-separator`
  const primaryPaneId = options.primaryPaneId ?? `${idBase}-pane-primary`
  const secondaryPaneId = options.secondaryPaneId ?? `${idBase}-pane-secondary`
  const controlsIds = `${primaryPaneId} ${secondaryPaneId}`

  const contracts: WindowSplitterContracts = {
    getSplitterProps() {
      const value = range.state.value()

      return {
        id: splitterId,
        role: 'separator',
        tabindex: '0',
        'aria-valuenow': String(value),
        'aria-valuemin': String(range.state.min()),
        'aria-valuemax': String(range.state.max()),
        'aria-valuetext': options.formatValueText?.(value),
        'aria-orientation': orientationAtom(),
        'aria-controls': controlsIds,
        'aria-label': options.ariaLabel,
        'aria-labelledby': options.ariaLabelledBy,
        onKeyDown: handleKeyDown,
      }
    },
    getPrimaryPaneProps() {
      return {
        id: primaryPaneId,
        'data-pane': 'primary',
        'data-orientation': orientationAtom(),
      }
    },
    getSecondaryPaneProps() {
      return {
        id: secondaryPaneId,
        'data-pane': 'secondary',
        'data-orientation': orientationAtom(),
      }
    },
  }

  const state: WindowSplitterState = {
    position: range.state.value,
    min: range.state.min,
    max: range.state.max,
    orientation: orientationAtom,
    isDragging: isDraggingAtom,
  }

  return {
    state,
    actions,
    contracts,
  }
}
