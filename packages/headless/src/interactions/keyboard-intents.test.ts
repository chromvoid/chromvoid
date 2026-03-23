import {describe, expect, it} from 'vitest'
import {mapListboxKeyboardIntent} from './keyboard-intents'

describe('mapListboxKeyboardIntent', () => {
  it('maps vertical ArrowDown to NAV_NEXT', () => {
    const intent = mapListboxKeyboardIntent(
      {
        key: 'ArrowDown',
        shiftKey: false,
        ctrlKey: false,
        metaKey: false,
        altKey: false,
      },
      {
        orientation: 'vertical',
        selectionMode: 'single',
        rangeSelectionEnabled: false,
      },
    )

    expect(intent).toBe('NAV_NEXT')
  })

  it('maps horizontal ArrowRight to NAV_NEXT', () => {
    const intent = mapListboxKeyboardIntent(
      {
        key: 'ArrowRight',
        shiftKey: false,
        ctrlKey: false,
        metaKey: false,
        altKey: false,
      },
      {
        orientation: 'horizontal',
        selectionMode: 'single',
        rangeSelectionEnabled: false,
      },
    )

    expect(intent).toBe('NAV_NEXT')
  })

  it('maps Shift+ArrowDown to RANGE_NEXT when range selection is enabled', () => {
    const intent = mapListboxKeyboardIntent(
      {
        key: 'ArrowDown',
        shiftKey: true,
        ctrlKey: false,
        metaKey: false,
        altKey: false,
      },
      {
        orientation: 'vertical',
        selectionMode: 'multiple',
        rangeSelectionEnabled: true,
      },
    )

    expect(intent).toBe('RANGE_NEXT')
  })

  it('maps Shift+Space to RANGE_SELECT_ACTIVE when range selection is enabled', () => {
    const intent = mapListboxKeyboardIntent(
      {
        key: ' ',
        shiftKey: true,
        ctrlKey: false,
        metaKey: false,
        altKey: false,
      },
      {
        orientation: 'vertical',
        selectionMode: 'multiple',
        rangeSelectionEnabled: true,
      },
    )

    expect(intent).toBe('RANGE_SELECT_ACTIVE')
  })

  it('maps Space to TOGGLE_SELECTION by default', () => {
    const intent = mapListboxKeyboardIntent(
      {
        key: ' ',
        shiftKey: false,
        ctrlKey: false,
        metaKey: false,
        altKey: false,
      },
      {
        orientation: 'vertical',
        selectionMode: 'single',
        rangeSelectionEnabled: false,
      },
    )

    expect(intent).toBe('TOGGLE_SELECTION')
  })

  it('maps Enter to ACTIVATE', () => {
    const intent = mapListboxKeyboardIntent(
      {
        key: 'Enter',
        shiftKey: false,
        ctrlKey: false,
        metaKey: false,
        altKey: false,
      },
      {
        orientation: 'vertical',
        selectionMode: 'single',
        rangeSelectionEnabled: false,
      },
    )

    expect(intent).toBe('ACTIVATE')
  })

  it('maps Ctrl+A to SELECT_ALL in multiple mode', () => {
    const intent = mapListboxKeyboardIntent(
      {
        key: 'a',
        shiftKey: false,
        ctrlKey: true,
        metaKey: false,
        altKey: false,
      },
      {
        orientation: 'vertical',
        selectionMode: 'multiple',
        rangeSelectionEnabled: false,
      },
    )

    expect(intent).toBe('SELECT_ALL')
  })

  it('does not map Ctrl+A to SELECT_ALL in single mode', () => {
    const intent = mapListboxKeyboardIntent(
      {
        key: 'a',
        shiftKey: false,
        ctrlKey: true,
        metaKey: false,
        altKey: false,
      },
      {
        orientation: 'vertical',
        selectionMode: 'single',
        rangeSelectionEnabled: false,
      },
    )

    expect(intent).toBeNull()
  })
})
