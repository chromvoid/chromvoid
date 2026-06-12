import {afterEach, describe, expect, it, vi} from 'vitest'

function mockRuntimeBootstrapSuccessModules(): void {
  vi.doMock('../../src/app/bootstrap/runtime-capabilities-sync', () => ({
    setupRuntimeCapabilitiesSync: vi.fn(),
  }))
  vi.doMock('../../src/app/bootstrap/mobile-visual-viewport', () => ({
    setupMobileVisualViewportSync: vi.fn(),
  }))
  vi.doMock('../../src/app/bootstrap/mobile-keyboard-focus-scroll', () => ({
    setupMobileKeyboardFocusScroll: vi.fn(),
  }))
  vi.doMock('../../src/app/bootstrap/pinch-zoom-prevention', () => ({
    setupPinchZoomPrevention: vi.fn(),
  }))
  vi.doMock('../../src/app/bootstrap/mobile-lifecycle', () => ({
    setupMobileLifecycle: vi.fn(),
  }))
  vi.doMock('../../src/app/bootstrap/android-password-save-handoff', () => ({
    setupAndroidPasswordSaveHandoff: vi.fn(),
  }))
  vi.doMock('../../src/app/bootstrap/android-share-files-handoff', () => ({
    setupAndroidShareFilesHandoff: vi.fn(),
  }))
  vi.doMock('../../src/app/bootstrap/android-media-session', () => ({
    setupAndroidMediaSessionBridge: vi.fn(),
  }))
  vi.doMock('../../src/app/bootstrap/android-audio-warmup', () => ({
    setupAndroidAudioWarmup: vi.fn(),
  }))
}

function mockInitializeStaticSideEffects(): void {
  vi.doMock('../../src/app/bootstrap/surface-component-loader', () => ({
    configureSurfaceComponentLoader: vi.fn(),
    ensureDashboardSurfaceComponents: vi.fn(() => Promise.resolve()),
  }))
  vi.doMock('../../src/app/bootstrap/ui-component-idle-warmup', () => ({
    startUiComponentIdleWarmup: vi.fn(),
  }))
  vi.doMock('../../src/app/navigation/android-system-back.model', () => ({
    androidSystemBackModel: {
      registerGlobalHandler: vi.fn(),
    },
  }))
  vi.doMock('../../src/routes/biometric-app-gate/biometric-app-gate.model', () => ({
    biometricAppGateModel: {
      connect: vi.fn(),
    },
  }))
}

describe('Initialize bootstrap failure safety', () => {
  afterEach(async () => {
    try {
      const {clearAppContext} = await import('../../src/shared/services/app-context')
      clearAppContext()
    } catch {}
    vi.unstubAllGlobals()
    vi.resetModules()
    vi.restoreAllMocks()
  })

  it('turns deferred data bootstrap failure into an explicit retry route', async () => {
    vi.resetModules()
    mockInitializeStaticSideEffects()
    mockRuntimeBootstrapSuccessModules()
    vi.doMock('../../src/app/bootstrap/passmanager-reload', () => ({
      setupPassmanagerReload: vi.fn(),
    }))
    vi.doMock('../../src/app/bootstrap/ssh-agent-handler', () => ({
      setupSshAgentHandler: vi.fn(),
    }))
    vi.doMock('../../src/app/bootstrap/catalog-sync', () => ({
      setupCatalogSync: vi.fn(() => {
        throw new Error('catalog setup failed')
      }),
    }))

    const {init} = await import('../../src/app/bootstrap/Initialize')
    const {getAppContext} = await import('../../src/shared/services/app-context')

    init()
    const {router, store} = getAppContext()

    await vi.waitFor(() => {
      expect(store.bootstrapFatalError()).toBe('Data bootstrap failed: catalog setup failed')
    })

    expect(store.lastErrorMessage()).toBe('Data bootstrap failed: catalog setup failed')
    expect(router.route()).toBe('no-connection')
  })
})
