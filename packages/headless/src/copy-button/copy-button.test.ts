import {describe, expect, it, vi, beforeEach, afterEach} from 'vitest'
import {createCopyButton} from './index'

describe('createCopyButton', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  const mockClipboard = () => ({
    writeText: vi.fn().mockResolvedValue(undefined),
  })

  // ---------------------------------------------------------------------------
  // Initial state
  // ---------------------------------------------------------------------------
  describe('initial state', () => {
    it('defaults to idle status, not disabled, not copying', () => {
      const cb = createCopyButton({clipboard: mockClipboard()})
      expect(cb.state.status()).toBe('idle')
      expect(cb.state.isDisabled()).toBe(false)
      expect(cb.state.isCopying()).toBe(false)
      expect(cb.state.isIdle()).toBe(true)
      expect(cb.state.isSuccess()).toBe(false)
      expect(cb.state.isError()).toBe(false)
      expect(cb.state.isUnavailable()).toBe(false)
      expect(cb.state.feedbackDuration()).toBe(1500)
      expect(cb.state.value()).toBe('')
    })

    it('accepts initial options', () => {
      const cb = createCopyButton({
        value: 'hello',
        feedbackDuration: 3000,
        isDisabled: true,
        clipboard: mockClipboard(),
      })
      expect(cb.state.value()).toBe('hello')
      expect(cb.state.feedbackDuration()).toBe(3000)
      expect(cb.state.isDisabled()).toBe(true)
      expect(cb.state.isUnavailable()).toBe(true)
    })
  })

  // ---------------------------------------------------------------------------
  // copy() — success path
  // ---------------------------------------------------------------------------
  describe('copy() success path', () => {
    it('writes value to clipboard and transitions to success', async () => {
      const clip = mockClipboard()
      const cb = createCopyButton({value: 'secret', clipboard: clip})

      const p = cb.actions.copy()
      await p

      expect(clip.writeText).toHaveBeenCalledWith('secret')
      expect(cb.state.status()).toBe('success')
      expect(cb.state.isSuccess()).toBe(true)
    })

    it('reverts to idle after feedbackDuration', async () => {
      const cb = createCopyButton({
        value: 'test',
        feedbackDuration: 2000,
        clipboard: mockClipboard(),
      })

      await cb.actions.copy()
      expect(cb.state.status()).toBe('success')

      vi.advanceTimersByTime(1999)
      expect(cb.state.status()).toBe('success')

      vi.advanceTimersByTime(1)
      expect(cb.state.status()).toBe('idle')
    })

    it('calls onCopy callback with resolved value on success', async () => {
      const onCopy = vi.fn()
      const cb = createCopyButton({
        value: 'data',
        clipboard: mockClipboard(),
        onCopy,
      })

      await cb.actions.copy()
      expect(onCopy).toHaveBeenCalledWith('data')
      expect(onCopy).toHaveBeenCalledTimes(1)
    })
  })

  // ---------------------------------------------------------------------------
  // copy() — error path (clipboard fails)
  // ---------------------------------------------------------------------------
  describe('copy() error path — clipboard failure', () => {
    it('transitions to error when clipboard.writeText rejects', async () => {
      const clip = {writeText: vi.fn().mockRejectedValue(new Error('denied'))}
      const cb = createCopyButton({value: 'test', clipboard: clip})

      await cb.actions.copy()
      expect(cb.state.status()).toBe('error')
      expect(cb.state.isError()).toBe(true)
    })

    it('reverts to idle after feedbackDuration on error', async () => {
      const clip = {writeText: vi.fn().mockRejectedValue(new Error('denied'))}
      const cb = createCopyButton({
        value: 'test',
        feedbackDuration: 1000,
        clipboard: clip,
      })

      await cb.actions.copy()
      expect(cb.state.status()).toBe('error')

      vi.advanceTimersByTime(1000)
      expect(cb.state.status()).toBe('idle')
    })

    it('calls onError callback on failure', async () => {
      const error = new Error('denied')
      const onError = vi.fn()
      const clip = {writeText: vi.fn().mockRejectedValue(error)}
      const cb = createCopyButton({value: 'test', clipboard: clip, onError})

      await cb.actions.copy()
      expect(onError).toHaveBeenCalledWith(error)
      expect(onError).toHaveBeenCalledTimes(1)
    })

    it('does not call onCopy on failure', async () => {
      const onCopy = vi.fn()
      const clip = {writeText: vi.fn().mockRejectedValue(new Error('fail'))}
      const cb = createCopyButton({value: 'x', clipboard: clip, onCopy})

      await cb.actions.copy()
      expect(onCopy).not.toHaveBeenCalled()
    })
  })

  // ---------------------------------------------------------------------------
  // copy() — async value getter
  // ---------------------------------------------------------------------------
  describe('copy() with async value getter', () => {
    it('resolves async getter and writes result to clipboard', async () => {
      const clip = mockClipboard()
      const getter = async () => 'async-value'
      const cb = createCopyButton({value: getter, clipboard: clip})

      await cb.actions.copy()

      expect(clip.writeText).toHaveBeenCalledWith('async-value')
      expect(cb.state.status()).toBe('success')
    })

    it('transitions to error when async getter throws', async () => {
      const clip = mockClipboard()
      const error = new Error('getter failed')
      const onError = vi.fn()
      const getter = async () => {
        throw error
      }
      const cb = createCopyButton({value: getter, clipboard: clip, onError})

      await cb.actions.copy()

      expect(clip.writeText).not.toHaveBeenCalled()
      expect(cb.state.status()).toBe('error')
      expect(onError).toHaveBeenCalledWith(error)
    })
  })

  // ---------------------------------------------------------------------------
  // isCopying signal
  // ---------------------------------------------------------------------------
  describe('isCopying', () => {
    it('is true during async resolution, false after', async () => {
      let resolveClip!: () => void
      const clip = {
        writeText: vi.fn().mockImplementation(
          () => new Promise<void>((resolve) => {
            resolveClip = resolve
          }),
        ),
      }
      const cb = createCopyButton({value: 'test', clipboard: clip})

      const p = cb.actions.copy()
      // During the async operation, isCopying should be true
      expect(cb.state.isCopying()).toBe(true)
      expect(cb.state.isUnavailable()).toBe(true)

      resolveClip()
      await p

      expect(cb.state.isCopying()).toBe(false)
    })
  })

  // ---------------------------------------------------------------------------
  // copy() guards
  // ---------------------------------------------------------------------------
  describe('copy() guards', () => {
    it('is a no-op when isDisabled is true', async () => {
      const clip = mockClipboard()
      const onCopy = vi.fn()
      const cb = createCopyButton({
        value: 'test',
        isDisabled: true,
        clipboard: clip,
        onCopy,
      })

      await cb.actions.copy()

      expect(clip.writeText).not.toHaveBeenCalled()
      expect(onCopy).not.toHaveBeenCalled()
      expect(cb.state.status()).toBe('idle')
    })

    it('is a no-op when isCopying is true (re-entrant guard)', async () => {
      let resolveClip!: () => void
      const clip = {
        writeText: vi.fn().mockImplementation(
          () => new Promise<void>((resolve) => {
            resolveClip = resolve
          }),
        ),
      }
      const cb = createCopyButton({value: 'test', clipboard: clip})

      const p1 = cb.actions.copy()
      expect(cb.state.isCopying()).toBe(true)

      // Second call while first is in-flight should be no-op
      const p2 = cb.actions.copy()
      expect(clip.writeText).toHaveBeenCalledTimes(1)

      resolveClip()
      await p1
      await p2
    })
  })

  // ---------------------------------------------------------------------------
  // setDisabled action
  // ---------------------------------------------------------------------------
  describe('setDisabled action', () => {
    it('sets disabled state', () => {
      const cb = createCopyButton({clipboard: mockClipboard()})
      expect(cb.state.isDisabled()).toBe(false)

      cb.actions.setDisabled(true)
      expect(cb.state.isDisabled()).toBe(true)
      expect(cb.state.isUnavailable()).toBe(true)

      cb.actions.setDisabled(false)
      expect(cb.state.isDisabled()).toBe(false)
      expect(cb.state.isUnavailable()).toBe(false)
    })
  })

  // ---------------------------------------------------------------------------
  // setFeedbackDuration action
  // ---------------------------------------------------------------------------
  describe('setFeedbackDuration action', () => {
    it('updates feedback duration', () => {
      const cb = createCopyButton({clipboard: mockClipboard()})
      cb.actions.setFeedbackDuration(3000)
      expect(cb.state.feedbackDuration()).toBe(3000)
    })

    it('clamps negative values to 0', () => {
      const cb = createCopyButton({clipboard: mockClipboard()})
      cb.actions.setFeedbackDuration(-500)
      expect(cb.state.feedbackDuration()).toBe(0)
    })

    it('clamps initial negative value to 0', () => {
      const cb = createCopyButton({feedbackDuration: -100, clipboard: mockClipboard()})
      expect(cb.state.feedbackDuration()).toBe(0)
    })
  })

  // ---------------------------------------------------------------------------
  // setValue action
  // ---------------------------------------------------------------------------
  describe('setValue action', () => {
    it('updates the value', () => {
      const cb = createCopyButton({clipboard: mockClipboard()})
      cb.actions.setValue('new-value')
      expect(cb.state.value()).toBe('new-value')
    })

    it('accepts a function value', () => {
      const getter = async () => 'lazy'
      const cb = createCopyButton({clipboard: mockClipboard()})
      cb.actions.setValue(getter)
      expect(cb.state.value()).toBe(getter)
    })
  })

  // ---------------------------------------------------------------------------
  // reset() action
  // ---------------------------------------------------------------------------
  describe('reset() action', () => {
    it('forces status to idle and cancels pending revert timer', async () => {
      const cb = createCopyButton({
        value: 'test',
        feedbackDuration: 5000,
        clipboard: mockClipboard(),
      })

      await cb.actions.copy()
      expect(cb.state.status()).toBe('success')

      cb.actions.reset()
      expect(cb.state.status()).toBe('idle')

      // The cancelled timer should not change anything
      vi.advanceTimersByTime(5000)
      expect(cb.state.status()).toBe('idle')
    })

    it('clears isCopying if currently in-flight', async () => {
      let resolveClip!: () => void
      const clip = {
        writeText: vi.fn().mockImplementation(
          () => new Promise<void>((resolve) => {
            resolveClip = resolve
          }),
        ),
      }
      const cb = createCopyButton({value: 'test', clipboard: clip})

      const p = cb.actions.copy()
      expect(cb.state.isCopying()).toBe(true)

      cb.actions.reset()
      expect(cb.state.isCopying()).toBe(false)
      expect(cb.state.status()).toBe('idle')

      resolveClip()
      await p
      // Should remain idle — the copy was cancelled by reset
      expect(cb.state.status()).toBe('idle')
    })
  })

  // ---------------------------------------------------------------------------
  // Timer management
  // ---------------------------------------------------------------------------
  describe('timer management', () => {
    it('new copy() cancels previous revert timer', async () => {
      const clip = mockClipboard()
      const cb = createCopyButton({
        value: 'test',
        feedbackDuration: 2000,
        clipboard: clip,
      })

      // First copy
      await cb.actions.copy()
      expect(cb.state.status()).toBe('success')

      // Advance only 1000ms (not enough to revert)
      vi.advanceTimersByTime(1000)
      expect(cb.state.status()).toBe('success')

      // Second copy — should cancel the first timer
      await cb.actions.copy()
      expect(cb.state.status()).toBe('success')

      // Advance 1500ms — first timer would have fired at 2000ms from first copy
      // but it was cancelled; second timer still has 500ms left
      vi.advanceTimersByTime(1500)
      expect(cb.state.status()).toBe('success')

      // Another 500ms — second timer fires
      vi.advanceTimersByTime(500)
      expect(cb.state.status()).toBe('idle')
    })

    it('feedbackDuration of 0 still reverts via setTimeout 0', async () => {
      const cb = createCopyButton({
        value: 'test',
        feedbackDuration: 0,
        clipboard: mockClipboard(),
      })

      await cb.actions.copy()
      expect(cb.state.status()).toBe('success')

      vi.advanceTimersByTime(0)
      expect(cb.state.status()).toBe('idle')
    })
  })

  // ---------------------------------------------------------------------------
  // getButtonProps() contract
  // ---------------------------------------------------------------------------
  describe('getButtonProps()', () => {
    it('returns correct defaults for idle state', () => {
      const cb = createCopyButton({clipboard: mockClipboard()})
      const props = cb.contracts.getButtonProps()

      expect(props.role).toBe('button')
      expect(props.tabindex).toBe('0')
      expect(props['aria-disabled']).toBe('false')
      expect(typeof props.onClick).toBe('function')
      expect(typeof props.onKeyDown).toBe('function')
      expect(typeof props.onKeyUp).toBe('function')
    })

    it('reflects isUnavailable in aria-disabled and tabindex', () => {
      const cb = createCopyButton({isDisabled: true, clipboard: mockClipboard()})
      const props = cb.contracts.getButtonProps()

      expect(props['aria-disabled']).toBe('true')
      expect(props.tabindex).toBe('-1')
    })

    it('onClick calls copy()', async () => {
      const clip = mockClipboard()
      const cb = createCopyButton({value: 'test', clipboard: clip})
      const props = cb.contracts.getButtonProps()

      props.onClick(new Event('click'))
      // Let the microtask settle
      await vi.advanceTimersByTimeAsync(0)

      expect(clip.writeText).toHaveBeenCalledWith('test')
    })

    it('Enter keydown triggers copy', async () => {
      const clip = mockClipboard()
      const cb = createCopyButton({value: 'enter-test', clipboard: clip})
      const props = cb.contracts.getButtonProps()

      props.onKeyDown({key: 'Enter', preventDefault: vi.fn()} as unknown as KeyboardEvent)
      await vi.advanceTimersByTimeAsync(0)

      expect(clip.writeText).toHaveBeenCalledWith('enter-test')
    })

    it('Space keyup triggers copy', async () => {
      const clip = mockClipboard()
      const cb = createCopyButton({value: 'space-test', clipboard: clip})
      const props = cb.contracts.getButtonProps()

      // keydown should preventDefault but NOT trigger copy
      const preventDefaultSpy = vi.fn()
      props.onKeyDown({key: ' ', preventDefault: preventDefaultSpy} as unknown as KeyboardEvent)
      expect(preventDefaultSpy).toHaveBeenCalledTimes(1)
      expect(clip.writeText).not.toHaveBeenCalled()

      // keyup should trigger copy
      props.onKeyUp({key: ' '} as unknown as KeyboardEvent)
      await vi.advanceTimersByTimeAsync(0)

      expect(clip.writeText).toHaveBeenCalledWith('space-test')
    })

    it('Space keydown does not preventDefault when unavailable', () => {
      const cb = createCopyButton({isDisabled: true, clipboard: mockClipboard()})
      const props = cb.contracts.getButtonProps()
      const preventDefaultSpy = vi.fn()

      props.onKeyDown({key: ' ', preventDefault: preventDefaultSpy} as unknown as KeyboardEvent)
      expect(preventDefaultSpy).not.toHaveBeenCalled()
    })

    describe('aria-label resolution', () => {
      it('omits aria-label when ariaLabel option is not set', () => {
        const cb = createCopyButton({clipboard: mockClipboard()})
        expect(cb.contracts.getButtonProps()['aria-label']).toBeUndefined()
      })

      it('returns ariaLabel as-is when idle', () => {
        const cb = createCopyButton({ariaLabel: 'Copy password', clipboard: mockClipboard()})
        expect(cb.contracts.getButtonProps()['aria-label']).toBe('Copy password')
      })

      it('returns "Copied" when status is success', async () => {
        const cb = createCopyButton({
          value: 'test',
          ariaLabel: 'Copy password',
          clipboard: mockClipboard(),
        })

        await cb.actions.copy()
        expect(cb.contracts.getButtonProps()['aria-label']).toBe('Copied')
      })

      it('returns "Copy failed" when status is error', async () => {
        const clip = {writeText: vi.fn().mockRejectedValue(new Error('fail'))}
        const cb = createCopyButton({
          value: 'test',
          ariaLabel: 'Copy password',
          clipboard: clip,
        })

        await cb.actions.copy()
        expect(cb.contracts.getButtonProps()['aria-label']).toBe('Copy failed')
      })
    })
  })

  // ---------------------------------------------------------------------------
  // getStatusProps() contract
  // ---------------------------------------------------------------------------
  describe('getStatusProps()', () => {
    it('always returns role=status, aria-live=polite, aria-atomic=true', () => {
      const cb = createCopyButton({clipboard: mockClipboard()})
      const props = cb.contracts.getStatusProps()

      expect(props.role).toBe('status')
      expect(props['aria-live']).toBe('polite')
      expect(props['aria-atomic']).toBe('true')
    })

    it('returns same attributes regardless of state', async () => {
      const cb = createCopyButton({value: 'test', clipboard: mockClipboard()})

      await cb.actions.copy()
      const props = cb.contracts.getStatusProps()

      expect(props.role).toBe('status')
      expect(props['aria-live']).toBe('polite')
      expect(props['aria-atomic']).toBe('true')
    })
  })

  // ---------------------------------------------------------------------------
  // getIconContainerProps() contract
  // ---------------------------------------------------------------------------
  describe('getIconContainerProps()', () => {
    it('copy icon visible when idle, others hidden', () => {
      const cb = createCopyButton({clipboard: mockClipboard()})

      expect(cb.contracts.getIconContainerProps('copy')).toEqual({
        'aria-hidden': 'true',
      })
      expect(cb.contracts.getIconContainerProps('success')).toEqual({
        'aria-hidden': 'true',
        hidden: true,
      })
      expect(cb.contracts.getIconContainerProps('error')).toEqual({
        'aria-hidden': 'true',
        hidden: true,
      })
    })

    it('success icon visible when success, others hidden', async () => {
      const cb = createCopyButton({value: 'test', clipboard: mockClipboard()})
      await cb.actions.copy()

      expect(cb.contracts.getIconContainerProps('copy')).toEqual({
        'aria-hidden': 'true',
        hidden: true,
      })
      expect(cb.contracts.getIconContainerProps('success')).toEqual({
        'aria-hidden': 'true',
      })
      expect(cb.contracts.getIconContainerProps('error')).toEqual({
        'aria-hidden': 'true',
        hidden: true,
      })
    })

    it('error icon visible when error, others hidden', async () => {
      const clip = {writeText: vi.fn().mockRejectedValue(new Error('fail'))}
      const cb = createCopyButton({value: 'test', clipboard: clip})
      await cb.actions.copy()

      expect(cb.contracts.getIconContainerProps('copy')).toEqual({
        'aria-hidden': 'true',
        hidden: true,
      })
      expect(cb.contracts.getIconContainerProps('success')).toEqual({
        'aria-hidden': 'true',
        hidden: true,
      })
      expect(cb.contracts.getIconContainerProps('error')).toEqual({
        'aria-hidden': 'true',
      })
    })
  })

  // ---------------------------------------------------------------------------
  // Injectable clipboard adapter
  // ---------------------------------------------------------------------------
  describe('injectable clipboard adapter', () => {
    it('uses provided clipboard adapter instead of navigator.clipboard', async () => {
      const clip = mockClipboard()
      const cb = createCopyButton({value: 'injected', clipboard: clip})

      await cb.actions.copy()

      expect(clip.writeText).toHaveBeenCalledWith('injected')
    })
  })
})
