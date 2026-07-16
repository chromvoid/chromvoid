import {describe, expect, it, vi} from 'vitest'
import {context} from '@reatom/core'

import {PMComponentLoaderModel} from '../../src/features/passmanager/models/pm-component-loader.model'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve
  })
  return {promise, resolve}
}

describe('PMComponentLoaderModel', () => {
  it('uses readiness for the current view and layout instead of the whole extended bundle', () => {
    if (!customElements.get('pm-entry-create-desktop')) {
      customElements.define('pm-entry-create-desktop', class extends HTMLElement {})
    }
    const loadRegistration = vi.fn()
    const model = new PMComponentLoaderModel(loadRegistration)

    expect(model.isReadyFor('createEntry', 'desktop')).toBe(true)
    expect(model.isReadyFor('createEntry', 'mobile')).toBe(false)
    expect(model.isReadyFor('envRuntimeView', 'desktop')).toBe(false)
    expect(loadRegistration).not.toHaveBeenCalled()
  })

  it('deduplicates concurrent lifecycle requests', async () => {
    const registration = deferred<{registerPassmanagerExtendedComponents: () => void}>()
    const registerPassmanagerExtendedComponents = vi.fn()
    const loadRegistration = vi.fn(() => registration.promise)
    const model = new PMComponentLoaderModel(loadRegistration)

    const first = model.requestExtendedComponents('createGroup', 'mobile')
    const second = model.requestExtendedComponents('createGroup', 'mobile')

    expect(loadRegistration).toHaveBeenCalledTimes(1)
    expect(second).toBe(first)

    registration.resolve({registerPassmanagerExtendedComponents})

    await expect(first).resolves.toBe(true)
    expect(registerPassmanagerExtendedComponents).toHaveBeenCalledTimes(1)
    expect(model.extendedReady()).toBe(true)
    expect(model.extendedLoadError()).toBeNull()
  })

  it('records a rejected lifecycle request without leaving a rejected promise', async () => {
    const loadRegistration = vi.fn(() => Promise.reject(new Error('registration failed')))
    const model = new PMComponentLoaderModel(loadRegistration)

    await expect(model.requestExtendedComponents('envRuntimeView', 'desktop')).resolves.toBe(false)

    expect(loadRegistration).toHaveBeenCalledTimes(1)
    expect(model.extendedReady()).toBe(false)
    expect(model.extendedLoadError()).toBe('registration failed')
  })

  it('commits readiness in the reactive context that requested registration', async () => {
    const registration = deferred<{registerPassmanagerExtendedComponents: () => void}>()
    const model = new PMComponentLoaderModel(() => registration.promise)
    const frame = context.start()

    const request = frame.run(() => model.ensureExtendedComponents())
    registration.resolve({registerPassmanagerExtendedComponents: vi.fn()})
    await request

    expect(frame.run(() => model.extendedReady())).toBe(true)
    expect(model.extendedReady()).toBe(false)
  })

  it('records lifecycle errors in the reactive context that requested registration', async () => {
    const model = new PMComponentLoaderModel(() => Promise.reject(new Error('registration failed')))
    const frame = context.start()

    await expect(frame.run(() => model.requestExtendedComponents('envRuntimeView', 'desktop'))).resolves.toBe(
      false,
    )

    expect(frame.run(() => model.extendedLoadError())).toBe('registration failed')
    expect(model.extendedLoadError()).toBeNull()
  })
})
