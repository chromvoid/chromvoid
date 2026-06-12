const {connectLoggerMock, logMock} = vi.hoisted(() => ({
  connectLoggerMock: vi.fn(),
  logMock: vi.fn(),
}))

vi.mock('@reatom/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@reatom/core')>()
  return {
    ...actual,
    connectLogger: connectLoggerMock,
    log: logMock,
  }
})

import {afterEach, describe, expect, it, vi} from 'vitest'

async function importReatomLogging(env: 'dev' | 'prod') {
  vi.resetModules()
  Object.defineProperty(window, 'env', {
    configurable: true,
    writable: true,
    value: env,
  })
  await import('../../src/setup/reatom-logging')
}

describe('reatom logging setup', () => {
  afterEach(() => {
    connectLoggerMock.mockClear()
    delete (globalThis as {LOG?: unknown}).LOG
    vi.resetModules()
  })

  it('connects the debug logger only in dev', async () => {
    await importReatomLogging('dev')

    expect(connectLoggerMock).toHaveBeenCalledTimes(1)
    expect(globalThis.LOG).toBe(logMock)
  })

  it('does not expose debug logger globals in prod', async () => {
    await importReatomLogging('prod')

    expect(connectLoggerMock).not.toHaveBeenCalled()
    expect(globalThis.LOG).toBeUndefined()
  })
})
