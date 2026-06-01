import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

const tauriInvoke = vi.fn()

vi.mock('root/core/transport/tauri/ipc', () => {
  return {
    tauriInvoke: (...args: unknown[]) => tauriInvoke(...args),
    tauriListen: async () => () => {},
  }
})

type Deferred<T> = {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (reason?: unknown) => void
}

type StrengthResult = {
  ok: true
  result: {
    score: number
    feedback: {
      warning: string
      suggestions: string[]
    }
  }
}

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return {promise, resolve, reject}
}

function createInputEvent(value: string): Event {
  return new CustomEvent('input', {detail: {value}})
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}

describe('WelcomeSetupModel password strength', () => {
  beforeEach(() => {
    tauriInvoke.mockReset()
    ;(globalThis as unknown as {__TAURI_INTERNALS__?: {invoke: () => void}}).__TAURI_INTERNALS__ = {
      invoke: () => {},
    }
  })

  afterEach(() => {
    delete (globalThis as unknown as {__TAURI_INTERNALS__?: unknown}).__TAURI_INTERNALS__
  })

  it('requests password strength from Tauri and applies the response', async () => {
    tauriInvoke.mockResolvedValue({
      ok: true,
      result: {
        score: 2,
        feedback: {
          warning: 'Weak password',
          suggestions: ['Add another word'],
        },
      },
    } satisfies StrengthResult)

    const mod = await import('../../src/routes/welcome/welcome.model')
    const model = new mod.WelcomeSetupModel()

    model.handleMasterPasswordInput(createInputEvent('hunter2'))
    await flushMicrotasks()

    expect(tauriInvoke).toHaveBeenCalledWith('password_strength_estimate', {password: 'hunter2'})
    expect(model.passwordStrength()).toEqual({
      score: 2,
      feedback: {
        warning: 'Weak password',
        suggestions: ['Add another word'],
      },
    })
  })

  it('resets to neutral state for empty input without IPC', async () => {
    const mod = await import('../../src/routes/welcome/welcome.model')
    const model = new mod.WelcomeSetupModel()

    model.passwordStrength.set({
      score: 4,
      feedback: {
        warning: 'Strong password',
        suggestions: ['Keep it'],
      },
    })

    model.handleMasterPasswordInput(createInputEvent(''))
    await flushMicrotasks()

    expect(tauriInvoke).not.toHaveBeenCalled()
    expect(model.passwordStrength()).toEqual({
      score: 0,
      feedback: {
        warning: '',
        suggestions: [],
      },
    })
  })

  it('ignores stale responses when newer input finishes first', async () => {
    const first = createDeferred<StrengthResult>()
    const second = createDeferred<StrengthResult>()
    tauriInvoke
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise)

    const mod = await import('../../src/routes/welcome/welcome.model')
    const model = new mod.WelcomeSetupModel()

    model.handleMasterPasswordInput(createInputEvent('first'))
    model.handleMasterPasswordInput(createInputEvent('second'))

    second.resolve({
      ok: true,
      result: {
        score: 4,
        feedback: {
          warning: '',
          suggestions: [],
        },
      },
    })
    await flushMicrotasks()

    first.resolve({
      ok: true,
      result: {
        score: 1,
        feedback: {
          warning: 'Too weak',
          suggestions: ['Use more words'],
        },
      },
    })
    await flushMicrotasks()

    expect(model.passwordStrength()).toEqual({
      score: 4,
      feedback: {
        warning: '',
        suggestions: [],
      },
    })
  })

  it('keeps a neutral meter when Tauri runtime is unavailable', async () => {
    delete (globalThis as unknown as {__TAURI_INTERNALS__?: unknown}).__TAURI_INTERNALS__

    const mod = await import('../../src/routes/welcome/welcome.model')
    const model = new mod.WelcomeSetupModel()

    model.passwordStrength.set({
      score: 3,
      feedback: {
        warning: 'Prior value',
        suggestions: ['Should reset'],
      },
    })

    expect(() => {
      model.handleMasterPasswordInput(createInputEvent('no-runtime'))
    }).not.toThrow()
    await flushMicrotasks()

    expect(tauriInvoke).not.toHaveBeenCalled()
    expect(model.passwordStrength()).toEqual({
      score: 0,
      feedback: {
        warning: '',
        suggestions: [],
      },
    })
  })
})
