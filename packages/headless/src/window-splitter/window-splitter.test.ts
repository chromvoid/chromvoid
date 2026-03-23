import {describe, expect, it, vi} from 'vitest'
import {createWindowSplitter} from './index'

describe('createWindowSplitter', () => {
  it('clamps position on setPosition and supports moveToMin/moveToMax', () => {
    const splitter = createWindowSplitter({
      idBase: 'splitter-clamp',
      min: 10,
      max: 90,
      position: 50,
      step: 5,
    })

    splitter.actions.setPosition(120)
    expect(splitter.state.position()).toBe(90)

    splitter.actions.setPosition(-5)
    expect(splitter.state.position()).toBe(10)

    splitter.actions.moveToMax()
    expect(splitter.state.position()).toBe(90)

    splitter.actions.moveToMin()
    expect(splitter.state.position()).toBe(10)
  })

  it('vertical orientation: ArrowRight increments, ArrowLeft decrements', () => {
    const splitter = createWindowSplitter({
      idBase: 'splitter-vertical-lr',
      orientation: 'vertical',
      min: 0,
      max: 100,
      position: 50,
      step: 5,
    })

    splitter.actions.handleKeyDown({key: 'ArrowRight'})
    expect(splitter.state.position()).toBe(55)

    splitter.actions.handleKeyDown({key: 'ArrowLeft'})
    expect(splitter.state.position()).toBe(50)
  })

  it('vertical orientation: ArrowUp/ArrowDown are no-ops', () => {
    const splitter = createWindowSplitter({
      idBase: 'splitter-vertical-ud-noop',
      orientation: 'vertical',
      min: 0,
      max: 100,
      position: 50,
      step: 5,
    })

    splitter.actions.handleKeyDown({key: 'ArrowUp'})
    expect(splitter.state.position()).toBe(50)

    splitter.actions.handleKeyDown({key: 'ArrowDown'})
    expect(splitter.state.position()).toBe(50)
  })

  it('horizontal orientation: ArrowDown increments, ArrowUp decrements', () => {
    const splitter = createWindowSplitter({
      idBase: 'splitter-horizontal-ud',
      orientation: 'horizontal',
      min: 0,
      max: 100,
      position: 50,
      step: 5,
    })

    splitter.actions.handleKeyDown({key: 'ArrowDown'})
    expect(splitter.state.position()).toBe(55)

    splitter.actions.handleKeyDown({key: 'ArrowUp'})
    expect(splitter.state.position()).toBe(50)
  })

  it('horizontal orientation: ArrowLeft/ArrowRight are no-ops', () => {
    const splitter = createWindowSplitter({
      idBase: 'splitter-horizontal-lr-noop',
      orientation: 'horizontal',
      min: 0,
      max: 100,
      position: 50,
      step: 5,
    })

    splitter.actions.handleKeyDown({key: 'ArrowLeft'})
    expect(splitter.state.position()).toBe(50)

    splitter.actions.handleKeyDown({key: 'ArrowRight'})
    expect(splitter.state.position()).toBe(50)
  })

  it('maps Home/End keyboard controls (vertical orientation)', () => {
    const splitter = createWindowSplitter({
      idBase: 'splitter-vertical-home-end',
      orientation: 'vertical',
      min: 0,
      max: 100,
      position: 50,
      step: 10,
    })

    splitter.actions.handleKeyDown({key: 'Home'})
    expect(splitter.state.position()).toBe(0)

    splitter.actions.handleKeyDown({key: 'End'})
    expect(splitter.state.position()).toBe(100)
  })

  it('maps Home/End keyboard controls (horizontal orientation)', () => {
    const splitter = createWindowSplitter({
      idBase: 'splitter-horizontal-home-end',
      orientation: 'horizontal',
      min: 0,
      max: 100,
      position: 50,
      step: 10,
    })

    splitter.actions.handleKeyDown({key: 'Home'})
    expect(splitter.state.position()).toBe(0)

    splitter.actions.handleKeyDown({key: 'End'})
    expect(splitter.state.position()).toBe(100)
  })

  it('tracks dragging lifecycle', () => {
    const splitter = createWindowSplitter({
      idBase: 'splitter-drag',
      min: 0,
      max: 100,
      position: 25,
    })

    expect(splitter.state.isDragging()).toBe(false)

    splitter.actions.startDragging()
    expect(splitter.state.isDragging()).toBe(true)

    splitter.actions.stopDragging()
    expect(splitter.state.isDragging()).toBe(false)
  })

  it('keeps aria-valuenow synchronized and links aria-controls', () => {
    const splitter = createWindowSplitter({
      idBase: 'splitter-aria',
      min: 0,
      max: 100,
      position: 30,
      primaryPaneId: 'pane-a',
      secondaryPaneId: 'pane-b',
      ariaLabel: 'Resize panes',
    })

    splitter.actions.moveStep(1)

    expect(splitter.contracts.getSplitterProps()).toMatchObject({
      role: 'separator',
      tabindex: '0',
      'aria-valuenow': '31',
      'aria-valuemin': '0',
      'aria-valuemax': '100',
      'aria-orientation': 'horizontal',
      'aria-controls': 'pane-a pane-b',
      'aria-label': 'Resize panes',
    })

    expect(splitter.contracts.getPrimaryPaneProps()).toMatchObject({
      id: 'pane-a',
      'data-pane': 'primary',
    })
    expect(splitter.contracts.getSecondaryPaneProps()).toMatchObject({
      id: 'pane-b',
      'data-pane': 'secondary',
    })
  })

  it('toggles min/max on Enter when fixed mode is enabled', () => {
    const splitter = createWindowSplitter({
      idBase: 'splitter-fixed',
      min: 0,
      max: 100,
      position: 20,
      isFixed: true,
    })

    splitter.actions.handleKeyDown({key: 'Enter'})
    expect(splitter.state.position()).toBe(100)

    splitter.actions.handleKeyDown({key: 'Enter'})
    expect(splitter.state.position()).toBe(0)
  })

  it('fixed mode: arrow keys are disabled', () => {
    const splitter = createWindowSplitter({
      idBase: 'splitter-fixed-arrows',
      orientation: 'vertical',
      min: 0,
      max: 100,
      position: 50,
      step: 10,
      isFixed: true,
    })

    splitter.actions.handleKeyDown({key: 'ArrowRight'})
    expect(splitter.state.position()).toBe(50)

    splitter.actions.handleKeyDown({key: 'ArrowLeft'})
    expect(splitter.state.position()).toBe(50)

    splitter.actions.handleKeyDown({key: 'ArrowUp'})
    expect(splitter.state.position()).toBe(50)

    splitter.actions.handleKeyDown({key: 'ArrowDown'})
    expect(splitter.state.position()).toBe(50)
  })

  it('calls onPositionChange only when position actually changes', () => {
    const onPositionChange = vi.fn()
    const splitter = createWindowSplitter({
      idBase: 'splitter-callback',
      min: 0,
      max: 2,
      position: 2,
      onPositionChange,
    })

    splitter.actions.moveStep(1)
    splitter.actions.moveStep(-1)
    splitter.actions.moveStep(-1)

    expect(onPositionChange).toHaveBeenCalledTimes(2)
    expect(onPositionChange).toHaveBeenNthCalledWith(1, 1)
    expect(onPositionChange).toHaveBeenNthCalledWith(2, 0)
  })

  it('snaps to nearest snap point within threshold', () => {
    const splitter = createWindowSplitter({
      idBase: 'splitter-snap-within',
      min: 0,
      max: 100,
      snap: '25 50 75',
      snapThreshold: 12,
    })

    // |20 - 25| = 5 <= 12, snap to 25
    splitter.actions.setPosition(20)
    expect(splitter.state.position()).toBe(25)

    // |62 - 50| = 12 <= 12, snap to 50
    splitter.actions.setPosition(62)
    expect(splitter.state.position()).toBe(50)
  })

  it('does not snap when outside threshold', () => {
    const splitter = createWindowSplitter({
      idBase: 'splitter-snap-outside',
      min: 0,
      max: 100,
      snap: '25 50 75',
      snapThreshold: 12,
    })

    // |10 - 25| = 15 > 12, no snap
    splitter.actions.setPosition(10)
    expect(splitter.state.position()).toBe(10)
  })

  it('resolves percentage snap positions', () => {
    const splitter = createWindowSplitter({
      idBase: 'splitter-snap-pct',
      min: 0,
      max: 200,
      snap: '25%',
      snapThreshold: 12,
    })

    // 25% of 200 = 50; |45 - 50| = 5 <= 12, snap to 50
    splitter.actions.setPosition(45)
    expect(splitter.state.position()).toBe(50)
  })

  it('no snap when snap option not set', () => {
    const splitter = createWindowSplitter({
      idBase: 'splitter-snap-none',
      min: 0,
      max: 100,
    })

    splitter.actions.setPosition(37)
    expect(splitter.state.position()).toBe(37)
  })

  it('onPositionChange receives post-snap value', () => {
    const onPositionChange = vi.fn()
    const splitter = createWindowSplitter({
      idBase: 'splitter-snap-callback',
      min: 0,
      max: 100,
      snap: '50',
      snapThreshold: 12,
      onPositionChange,
    })

    // |45 - 50| = 5 <= 12, snaps to 50
    splitter.actions.setPosition(45)
    expect(onPositionChange).toHaveBeenCalledWith(50)
  })
})
