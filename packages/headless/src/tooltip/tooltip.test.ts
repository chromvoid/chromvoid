import {afterEach, describe, expect, it, vi} from 'vitest'
import {createTooltip} from './index'

describe('createTooltip', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  // ─── Hover mode ────────────────────────────────────────────────────────────

  it('handles hover open/close lifecycle with delays', () => {
    vi.useFakeTimers()

    const model = createTooltip({
      idBase: 'tooltip-hover',
      showDelay: 20,
      hideDelay: 10,
    })

    model.actions.handlePointerEnter()
    vi.advanceTimersByTime(19)
    expect(model.state.isOpen()).toBe(false)

    vi.advanceTimersByTime(1)
    expect(model.state.isOpen()).toBe(true)

    model.actions.handlePointerLeave()
    vi.advanceTimersByTime(9)
    expect(model.state.isOpen()).toBe(true)

    vi.advanceTimersByTime(1)
    expect(model.state.isOpen()).toBe(false)
  })

  it('opens and closes immediately with zero delays', () => {
    const model = createTooltip({
      idBase: 'tooltip-zero',
      showDelay: 0,
      hideDelay: 0,
    })

    model.actions.handlePointerEnter()
    expect(model.state.isOpen()).toBe(true)

    model.actions.handlePointerLeave()
    expect(model.state.isOpen()).toBe(false)
  })

  it('cancels pending hide when pointer re-enters', () => {
    vi.useFakeTimers()

    const model = createTooltip({
      idBase: 'tooltip-reenter',
      showDelay: 0,
      hideDelay: 50,
    })

    model.actions.handlePointerEnter()
    expect(model.state.isOpen()).toBe(true)

    model.actions.handlePointerLeave()
    vi.advanceTimersByTime(25)
    expect(model.state.isOpen()).toBe(true)

    model.actions.handlePointerEnter()
    vi.advanceTimersByTime(50)
    expect(model.state.isOpen()).toBe(true)
  })

  it('cancels pending show when pointer leaves before delay', () => {
    vi.useFakeTimers()

    const model = createTooltip({
      idBase: 'tooltip-cancel-show',
      showDelay: 50,
      hideDelay: 0,
    })

    model.actions.handlePointerEnter()
    vi.advanceTimersByTime(25)
    expect(model.state.isOpen()).toBe(false)

    model.actions.handlePointerLeave()
    vi.advanceTimersByTime(50)
    expect(model.state.isOpen()).toBe(false)
  })

  // ─── Focus mode ────────────────────────────────────────────────────────────

  it('handles focus open/close lifecycle', () => {
    vi.useFakeTimers()

    const model = createTooltip({
      idBase: 'tooltip-focus',
      showDelay: 5,
      hideDelay: 5,
    })

    model.actions.handleFocus()
    vi.advanceTimersByTime(5)
    expect(model.state.isOpen()).toBe(true)

    model.actions.handleBlur()
    vi.advanceTimersByTime(5)
    expect(model.state.isOpen()).toBe(false)
  })

  it('opens on focus with zero delay', () => {
    const model = createTooltip({
      idBase: 'tooltip-focus-zero',
      showDelay: 0,
      hideDelay: 0,
    })

    model.actions.handleFocus()
    expect(model.state.isOpen()).toBe(true)

    model.actions.handleBlur()
    expect(model.state.isOpen()).toBe(false)
  })

  // ─── Click mode ────────────────────────────────────────────────────────────

  it('handleClick opens when closed (click mode)', () => {
    const model = createTooltip({
      idBase: 'tooltip-click-open',
      trigger: 'click',
    })

    expect(model.state.isOpen()).toBe(false)
    model.actions.handleClick()
    expect(model.state.isOpen()).toBe(true)
  })

  it('handleClick closes when open (click mode)', () => {
    const model = createTooltip({
      idBase: 'tooltip-click-close',
      trigger: 'click',
      initialOpen: true,
    })

    expect(model.state.isOpen()).toBe(true)
    model.actions.handleClick()
    expect(model.state.isOpen()).toBe(false)
  })

  it('handleClick is no-op when disabled', () => {
    const model = createTooltip({
      idBase: 'tooltip-click-disabled',
      trigger: 'click',
      isDisabled: true,
    })

    model.actions.handleClick()
    expect(model.state.isOpen()).toBe(false)
  })

  it('Escape still closes when in click mode', () => {
    const model = createTooltip({
      idBase: 'tooltip-click-escape',
      trigger: 'click',
      initialOpen: true,
    })

    model.actions.handleKeyDown({key: 'Escape'})
    expect(model.state.isOpen()).toBe(false)
  })

  it('handleClick clears pending timers', () => {
    vi.useFakeTimers()

    const model = createTooltip({
      idBase: 'tooltip-click-timers',
      trigger: 'click',
      showDelay: 100,
    })

    // handleClick toggles immediately and cancels any pending timers
    model.actions.handleClick()
    expect(model.state.isOpen()).toBe(true)

    model.actions.handleClick()
    expect(model.state.isOpen()).toBe(false)

    // No timer should fire after toggle
    vi.advanceTimersByTime(200)
    expect(model.state.isOpen()).toBe(false)
  })

  it('handleClick is no-op when click is not in trigger modes', () => {
    const model = createTooltip({
      idBase: 'tooltip-click-noop',
      trigger: 'hover focus',
    })

    model.actions.handleClick()
    expect(model.state.isOpen()).toBe(false)
  })

  // ─── Manual mode ───────────────────────────────────────────────────────────

  it('show() opens the tooltip with showDelay', () => {
    vi.useFakeTimers()

    const model = createTooltip({
      idBase: 'tooltip-show',
      trigger: 'manual',
      showDelay: 30,
    })

    model.actions.show()
    expect(model.state.isOpen()).toBe(false)
    vi.advanceTimersByTime(30)
    expect(model.state.isOpen()).toBe(true)
  })

  it('show() with zero showDelay opens immediately', () => {
    const model = createTooltip({
      idBase: 'tooltip-show-zero',
      trigger: 'manual',
      showDelay: 0,
    })

    model.actions.show()
    expect(model.state.isOpen()).toBe(true)
  })

  it('show() is no-op when disabled', () => {
    const model = createTooltip({
      idBase: 'tooltip-show-disabled',
      trigger: 'manual',
      isDisabled: true,
    })

    model.actions.show()
    expect(model.state.isOpen()).toBe(false)
  })

  it('hide() closes the tooltip with hideDelay', () => {
    vi.useFakeTimers()

    const model = createTooltip({
      idBase: 'tooltip-hide',
      trigger: 'manual',
      initialOpen: true,
      hideDelay: 30,
    })

    model.actions.hide()
    expect(model.state.isOpen()).toBe(true)
    vi.advanceTimersByTime(30)
    expect(model.state.isOpen()).toBe(false)
  })

  it('hide() with zero hideDelay closes immediately', () => {
    const model = createTooltip({
      idBase: 'tooltip-hide-zero',
      trigger: 'manual',
      initialOpen: true,
      hideDelay: 0,
    })

    model.actions.hide()
    expect(model.state.isOpen()).toBe(false)
  })

  it('handlePointerEnter has no effect when manual is the only mode', () => {
    const model = createTooltip({
      idBase: 'tooltip-manual-ptr',
      trigger: 'manual',
      showDelay: 0,
    })

    model.actions.handlePointerEnter()
    expect(model.state.isOpen()).toBe(false)
  })

  it('handlePointerLeave has no effect when manual is the only mode', () => {
    const model = createTooltip({
      idBase: 'tooltip-manual-ptr-leave',
      trigger: 'manual',
      initialOpen: true,
      hideDelay: 0,
    })

    model.actions.handlePointerLeave()
    expect(model.state.isOpen()).toBe(true)
  })

  it('handleFocus has no effect when manual is the only mode', () => {
    const model = createTooltip({
      idBase: 'tooltip-manual-focus',
      trigger: 'manual',
      showDelay: 0,
    })

    model.actions.handleFocus()
    expect(model.state.isOpen()).toBe(false)
  })

  it('handleBlur has no effect when manual is the only mode', () => {
    const model = createTooltip({
      idBase: 'tooltip-manual-blur',
      trigger: 'manual',
      initialOpen: true,
      hideDelay: 0,
    })

    model.actions.handleBlur()
    expect(model.state.isOpen()).toBe(true)
  })

  it('handleClick has no effect when manual is the only mode', () => {
    const model = createTooltip({
      idBase: 'tooltip-manual-click',
      trigger: 'manual',
    })

    model.actions.handleClick()
    expect(model.state.isOpen()).toBe(false)
  })

  // ─── Conditional trigger props ──────────────────────────────────────────────

  it('getTriggerProps: hover mode includes pointer handlers, no onClick', () => {
    const model = createTooltip({
      idBase: 'tooltip-tp-hover',
      trigger: 'hover',
    })

    const props = model.contracts.getTriggerProps()
    expect(props.onPointerEnter).toBeDefined()
    expect(props.onPointerLeave).toBeDefined()
    expect((props as Record<string, unknown>).onClick).toBeUndefined()
    expect((props as Record<string, unknown>).onFocus).toBeUndefined()
    expect((props as Record<string, unknown>).onBlur).toBeUndefined()
  })

  it('getTriggerProps: focus mode includes focus handlers, no pointer handlers', () => {
    const model = createTooltip({
      idBase: 'tooltip-tp-focus',
      trigger: 'focus',
    })

    const props = model.contracts.getTriggerProps()
    expect(props.onFocus).toBeDefined()
    expect(props.onBlur).toBeDefined()
    expect((props as Record<string, unknown>).onPointerEnter).toBeUndefined()
    expect((props as Record<string, unknown>).onPointerLeave).toBeUndefined()
    expect((props as Record<string, unknown>).onClick).toBeUndefined()
  })

  it('getTriggerProps: click mode includes onClick, no pointer/focus handlers', () => {
    const model = createTooltip({
      idBase: 'tooltip-tp-click',
      trigger: 'click',
    })

    const props = model.contracts.getTriggerProps()
    expect((props as Record<string, unknown>).onClick).toBeDefined()
    expect((props as Record<string, unknown>).onPointerEnter).toBeUndefined()
    expect((props as Record<string, unknown>).onPointerLeave).toBeUndefined()
    expect((props as Record<string, unknown>).onFocus).toBeUndefined()
    expect((props as Record<string, unknown>).onBlur).toBeUndefined()
  })

  it('getTriggerProps: manual-only mode returns only id, aria-describedby, onKeyDown', () => {
    const model = createTooltip({
      idBase: 'tooltip-tp-manual',
      trigger: 'manual',
    })

    const props = model.contracts.getTriggerProps()
    expect(props.id).toBeDefined()
    expect(props.onKeyDown).toBeDefined()
    expect((props as Record<string, unknown>).onPointerEnter).toBeUndefined()
    expect((props as Record<string, unknown>).onPointerLeave).toBeUndefined()
    expect((props as Record<string, unknown>).onFocus).toBeUndefined()
    expect((props as Record<string, unknown>).onBlur).toBeUndefined()
    expect((props as Record<string, unknown>).onClick).toBeUndefined()
  })

  it('getTriggerProps: hover+focus default mode has all four interaction handlers, no onClick', () => {
    // Default trigger is 'hover focus'
    const model = createTooltip({
      idBase: 'tooltip-tp-default',
    })

    const props = model.contracts.getTriggerProps()
    expect(props.onPointerEnter).toBeDefined()
    expect(props.onPointerLeave).toBeDefined()
    expect(props.onFocus).toBeDefined()
    expect(props.onBlur).toBeDefined()
    expect((props as Record<string, unknown>).onClick).toBeUndefined()
  })

  it('getTriggerProps: click+hover mode has pointer and click handlers', () => {
    const model = createTooltip({
      idBase: 'tooltip-tp-click-hover',
      trigger: 'click hover',
    })

    const props = model.contracts.getTriggerProps()
    expect(props.onPointerEnter).toBeDefined()
    expect(props.onPointerLeave).toBeDefined()
    expect((props as Record<string, unknown>).onClick).toBeDefined()
    expect((props as Record<string, unknown>).onFocus).toBeUndefined()
    expect((props as Record<string, unknown>).onBlur).toBeUndefined()
  })

  it('getTriggerProps: onKeyDown is always present regardless of mode', () => {
    const modes = ['hover', 'focus', 'click', 'manual', 'hover focus', 'click focus']
    for (const trigger of modes) {
      const model = createTooltip({idBase: `tooltip-kd-${trigger.replace(' ', '-')}`, trigger})
      const props = model.contracts.getTriggerProps()
      expect(props.onKeyDown).toBeDefined()
    }
  })

  // ─── handlePointerEnter/Leave no-op when hover not in trigger ──────────────

  it('handlePointerEnter is no-op when hover not in trigger modes', () => {
    const model = createTooltip({
      idBase: 'tooltip-ptr-noop',
      trigger: 'focus',
      showDelay: 0,
    })

    model.actions.handlePointerEnter()
    expect(model.state.isOpen()).toBe(false)
  })

  it('handlePointerLeave is no-op when hover not in trigger modes', () => {
    const model = createTooltip({
      idBase: 'tooltip-ptr-leave-noop',
      trigger: 'focus',
      initialOpen: true,
      hideDelay: 0,
    })

    model.actions.handlePointerLeave()
    expect(model.state.isOpen()).toBe(true)
  })

  it('handleFocus is no-op when focus not in trigger modes', () => {
    const model = createTooltip({
      idBase: 'tooltip-focus-noop',
      trigger: 'hover',
      showDelay: 0,
    })

    model.actions.handleFocus()
    expect(model.state.isOpen()).toBe(false)
  })

  it('handleBlur is no-op when focus not in trigger modes', () => {
    const model = createTooltip({
      idBase: 'tooltip-blur-noop',
      trigger: 'hover',
      initialOpen: true,
      hideDelay: 0,
    })

    model.actions.handleBlur()
    expect(model.state.isOpen()).toBe(true)
  })

  // ─── Keyboard ──────────────────────────────────────────────────────────────

  it('dismisses on Escape key', () => {
    const model = createTooltip({
      idBase: 'tooltip-escape',
      initialOpen: true,
    })

    model.actions.handleKeyDown({key: 'Escape'})
    expect(model.state.isOpen()).toBe(false)
  })

  it('Escape cancels pending show timer', () => {
    vi.useFakeTimers()

    const model = createTooltip({
      idBase: 'tooltip-esc-pending',
      showDelay: 100,
    })

    model.actions.handlePointerEnter()
    vi.advanceTimersByTime(50)
    expect(model.state.isOpen()).toBe(false)

    model.actions.handleKeyDown({key: 'Escape'})
    vi.advanceTimersByTime(100)
    expect(model.state.isOpen()).toBe(false)
  })

  it('ignores non-Escape keys', () => {
    const model = createTooltip({
      idBase: 'tooltip-other-keys',
      initialOpen: true,
    })

    model.actions.handleKeyDown({key: 'Enter'})
    expect(model.state.isOpen()).toBe(true)

    model.actions.handleKeyDown({key: 'Tab'})
    expect(model.state.isOpen()).toBe(true)

    model.actions.handleKeyDown({key: ' '})
    expect(model.state.isOpen()).toBe(true)
  })

  // ─── ARIA ──────────────────────────────────────────────────────────────────

  it('aria-describedby links trigger to tooltip ID when not disabled', () => {
    const model = createTooltip({
      idBase: 'tooltip-aria',
    })

    const trigger = model.contracts.getTriggerProps()
    const tooltip = model.contracts.getTooltipProps()

    expect(trigger['aria-describedby']).toBe(tooltip.id)
    expect(trigger['aria-describedby']).toBe('tooltip-aria-content')
  })

  it('aria-describedby persists regardless of open state', () => {
    const model = createTooltip({
      idBase: 'tooltip-aria-persist',
      showDelay: 0,
      hideDelay: 0,
    })

    expect(model.state.isOpen()).toBe(false)
    expect(model.contracts.getTriggerProps()['aria-describedby']).toBe(
      'tooltip-aria-persist-content'
    )

    model.actions.open()
    expect(model.state.isOpen()).toBe(true)
    expect(model.contracts.getTriggerProps()['aria-describedby']).toBe(
      'tooltip-aria-persist-content'
    )

    model.actions.close()
    expect(model.state.isOpen()).toBe(false)
    expect(model.contracts.getTriggerProps()['aria-describedby']).toBe(
      'tooltip-aria-persist-content'
    )
  })

  it('tooltip has role=tooltip and is not in tab order', () => {
    const model = createTooltip({
      idBase: 'tooltip-tab',
    })

    const props = model.contracts.getTooltipProps()
    expect(props.role).toBe('tooltip')
    expect(props.tabindex).toBe('-1')
  })

  it('hidden prop reflects isOpen state', () => {
    const model = createTooltip({
      idBase: 'tooltip-hidden',
      initialOpen: false,
    })

    expect(model.contracts.getTooltipProps().hidden).toBe(true)

    model.actions.open()
    expect(model.contracts.getTooltipProps().hidden).toBe(false)

    model.actions.close()
    expect(model.contracts.getTooltipProps().hidden).toBe(true)
  })

  // ─── Disabled ──────────────────────────────────────────────────────────────

  it('closes tooltip when disabled', () => {
    const model = createTooltip({
      idBase: 'tooltip-disabled',
      initialOpen: true,
    })

    model.actions.setDisabled(true)
    expect(model.state.isOpen()).toBe(false)
    expect(model.contracts.getTriggerProps()['aria-describedby']).toBeUndefined()
  })

  it('prevents opening when disabled', () => {
    const model = createTooltip({
      idBase: 'tooltip-disabled-open',
      isDisabled: true,
    })

    model.actions.handlePointerEnter()
    expect(model.state.isOpen()).toBe(false)

    model.actions.handleFocus()
    expect(model.state.isOpen()).toBe(false)

    model.actions.open()
    expect(model.state.isOpen()).toBe(false)
  })

  it('show() is no-op when disabled', () => {
    const model = createTooltip({
      idBase: 'tooltip-show-disabled2',
      isDisabled: true,
    })

    model.actions.show()
    expect(model.state.isOpen()).toBe(false)
  })

  it('re-enables opening after setDisabled(false)', () => {
    const model = createTooltip({
      idBase: 'tooltip-reenable',
      isDisabled: true,
      showDelay: 0,
    })

    model.actions.setDisabled(false)
    model.actions.handlePointerEnter()
    expect(model.state.isOpen()).toBe(true)
    expect(model.contracts.getTriggerProps()['aria-describedby']).toBe(
      'tooltip-reenable-content'
    )
  })

  // ─── Defaults ──────────────────────────────────────────────────────────────

  it('uses sensible defaults when no options provided', () => {
    const model = createTooltip()

    expect(model.state.isOpen()).toBe(false)
    expect(model.state.isDisabled()).toBe(false)

    const trigger = model.contracts.getTriggerProps()
    expect(trigger.id).toBe('tooltip-trigger')
    expect(trigger['aria-describedby']).toBe('tooltip-content')
    // Default trigger is 'hover focus' — should have pointer and focus handlers
    expect(trigger.onPointerEnter).toBeDefined()
    expect(trigger.onPointerLeave).toBeDefined()
    expect(trigger.onFocus).toBeDefined()
    expect(trigger.onBlur).toBeDefined()
    expect((trigger as Record<string, unknown>).onClick).toBeUndefined()
  })
})
