import type {ManagerSaver} from '@project/passmanager/types'

import {
  SURFACE_IDS,
  type SurfaceId,
  type ResolvedFilesDocumentState,
  type ResolvedOverlayState,
} from 'root/app/navigation/navigation.types'
import type {Routes} from 'root/app/router/router'
import {moduleAccessModel} from 'root/core/pro/module-access.model'
import {writeAndroidUnlockDebug} from 'root/shared/services/android-unlock-debug'

type LoaderDeps = {
  managerSaver?: ManagerSaver
}

const deps: LoaderDeps = {}
const loadCache = new Map<string, Promise<void>>()

export type UiComponentWarmupTask = {
  key: string
  run: () => Promise<void>
}

function once(key: string, load: () => Promise<void>): Promise<void> {
  const cached = loadCache.get(key)
  if (cached) {
    return cached
  }

  const promise = load().catch((error) => {
    loadCache.delete(key)
    throw error
  })
  loadCache.set(key, promise)
  return promise
}

export function configureSurfaceComponentLoader(input: {managerSaver: ManagerSaver}): void {
  deps.managerSaver = input.managerSaver
}

function ensureWelcomeRouteComponents(): Promise<void> {
  return once('route:welcome', async () => {
    const module = await import('root/routes/welcome.route')
    module.WelcomePage.define()
  })
}

function ensureNoConnectionRouteComponents(): Promise<void> {
  return once('route:no-connection', async () => {
    const module = await import('root/routes/no-connection.route')
    module.NoConnection.define()
  })
}

function ensureDetailsOverlayComponents(): Promise<void> {
  return once('overlay:details', async () => {
    const module = await import('root/features/file-manager/components/file-details-panel')
    module.FileDetailsPanel.define()
  })
}

function ensureGalleryOverlayComponents(): Promise<void> {
  return once('overlay:gallery', async () => {
    const [desktop, mobile] = await Promise.all([
      import('root/features/media/components/image-gallery-v2/image-gallery-desktop'),
      import('root/features/media/components/image-gallery-mobile/image-gallery-mobile'),
    ])
    desktop.ImageGallery.define()
    mobile.ImageGalleryMobile.define()
  })
}

function ensurePreviewOverlayComponents(): Promise<void> {
  return once('overlay:preview', async () => {
    const previewModule = await import('root/features/file-manager/components/file-preview')
    previewModule.FilePreview.define()
  })
}

function ensureVideoOverlayComponents(): Promise<void> {
  return once('overlay:video', async () => {
    const [desktop, mobile] = await Promise.all([
      import('root/features/media/components/video-player'),
      import('root/features/media/components/video-player-mobile'),
    ])
    desktop.VideoPlayer.define()
    mobile.VideoPlayerMobile.define()
  })
}

function ensureMarkdownDocumentComponents(): Promise<void> {
  return once('document:markdown', async () => {
    const [pageModule, markdownModule] = await Promise.all([
      import('root/features/file-manager/components/markdown-document-page'),
      import('root/features/file-manager/components/markdown-preview'),
    ])
    pageModule.MarkdownDocumentPage.define()
    markdownModule.MarkdownPreview.define()
  })
}

function ensurePasswordsSurfaceComponents(): Promise<void> {
  return once('surface:passwords', async () => {
    if (!deps.managerSaver) {
      throw new Error('Password manager saver is not configured')
    }
    const module = await import('root/features/passmanager/registration')
    module.registerPassManagerComponents(deps.managerSaver)
  })
}

function ensureFilesSurfaceComponents(): Promise<void> {
  return once('surface:files', async () => {
    writeAndroidUnlockDebug('surface-loader', 'surface:files import:start')
    const [_, fileManager] = await Promise.all([
      import('root/pages/components'),
      import('root/features/file-manager/file-manager'),
    ])
    writeAndroidUnlockDebug('surface-loader', 'surface:files import:done')
    fileManager.FileManager.define()
    writeAndroidUnlockDebug('surface-loader', 'surface:files define:done')
  })
}

function ensureNotesSurfaceComponents(): Promise<void> {
  return once('surface:notes', async () => {
    const module = await import('root/features/file-manager/components/notes-quick-view')
    module.NotesQuickViewControls.define()
    module.NotesQuickView.define()
    module.NotesQuickViewMobile.define()
  })
}

function ensurePasskeysSurfaceComponents(): Promise<void> {
  return once('surface:passkeys', async () => {
    const module = await import('root/routes/passkeys/passkeys-page')
    module.PasskeysPage.define()
  })
}

function ensureRemoteSurfaceComponents(): Promise<void> {
  return once('surface:remote', async () => {
    const module = await import('root/routes/remote/remote-page')
    module.RemotePage.define()
  })
}

function ensureGatewaySurfaceComponents(): Promise<void> {
  return once('surface:gateway', async () => {
    const module = await import('root/routes/gateway/gateway-page')
    module.GatewayPage.define()
  })
}

function ensureRemoteStorageSurfaceComponents(): Promise<void> {
  return once('surface:remote-storage', async () => {
    const module = await import('root/routes/remote-storage.route')
    module.RemoteStoragePage.define()
  })
}

function ensureSettingsSurfaceComponents(): Promise<void> {
  return once('surface:settings', async () => {
    const module = await import('root/routes/settings/settings-page')
    module.SettingsPage.define()
  })
}

function createSurfaceWarmupTask(surface: SurfaceId): UiComponentWarmupTask {
  return {
    key: `surface:${surface}`,
    run: () => ensureDashboardSurfaceComponents(surface),
  }
}

export function getSurfaceComponentWarmupTasks(): UiComponentWarmupTask[] {
  return [
    {key: 'route:welcome', run: ensureWelcomeRouteComponents},
    {key: 'route:no-connection', run: ensureNoConnectionRouteComponents},
    ...SURFACE_IDS.map(createSurfaceWarmupTask),
    {key: 'overlay:details', run: ensureDetailsOverlayComponents},
    {key: 'overlay:gallery', run: ensureGalleryOverlayComponents},
    {key: 'overlay:preview', run: ensurePreviewOverlayComponents},
    {key: 'overlay:video', run: ensureVideoOverlayComponents},
    {key: 'document:markdown', run: ensureMarkdownDocumentComponents},
  ]
}

export async function ensureRouteComponents(
  route: Routes,
  surface: SurfaceId,
  overlay: ResolvedOverlayState,
  document: ResolvedFilesDocumentState = {kind: 'closed'},
): Promise<void> {
  const tasks: Promise<void>[] = []

  if (route === 'welcome') {
    tasks.push(ensureWelcomeRouteComponents())
  } else if (route === 'no-connection') {
    tasks.push(ensureNoConnectionRouteComponents())
  } else if (route === 'dashboard') {
    tasks.push(ensureDashboardSurfaceComponents(surface))
  }

  if (overlay.kind === 'details') {
    tasks.push(ensureDetailsOverlayComponents())
  } else if (overlay.kind === 'gallery') {
    tasks.push(ensureGalleryOverlayComponents())
  } else if (overlay.kind === 'preview') {
    tasks.push(ensurePreviewOverlayComponents())
  } else if (overlay.kind === 'video') {
    tasks.push(ensureVideoOverlayComponents())
  }

  if (document.kind === 'markdown' || (document.kind === 'pending' && document.requestedKind === 'markdown')) {
    tasks.push(ensureMarkdownDocumentComponents())
  }

  if (tasks.length === 0) {
    return
  }

  await Promise.all(tasks)
}

export async function ensureDashboardSurfaceComponents(surface: SurfaceId): Promise<void> {
  const access = moduleAccessModel.surfaceAccess(surface)
  if (access && access.status !== 'enabled') {
    return
  }

  switch (surface) {
    case 'passwords': {
      await ensurePasswordsSurfaceComponents()
      return
    }

    case 'files': {
      await ensureFilesSurfaceComponents()
      return
    }

    case 'notes': {
      await ensureNotesSurfaceComponents()
      return
    }

    case 'passkeys': {
      await ensurePasskeysSurfaceComponents()
      return
    }

    case 'remote': {
      await ensureRemoteSurfaceComponents()
      return
    }

    case 'gateway': {
      await ensureGatewaySurfaceComponents()
      return
    }

    case 'remote-storage': {
      await ensureRemoteStorageSurfaceComponents()
      return
    }
    case 'settings': {
      await ensureSettingsSurfaceComponents()
      return
    }
  }
}
