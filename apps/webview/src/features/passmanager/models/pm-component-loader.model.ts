import {atom, wrap} from '@reatom/core'

import {Entry} from '@project/passmanager/core'
import type {UiComponentWarmupTask} from 'root/app/bootstrap/surface-component-loader'

export type PMExtendedComponentLayout = 'desktop' | 'mobile'

type ExtendedRegistrationModule = {
  registerPassmanagerExtendedComponents: () => void
}

type ExtendedRegistrationLoader = () => Promise<ExtendedRegistrationModule>

const EXTENDED_VIEW_TAGS = {
  createEntry: {
    desktop: 'pm-entry-create-desktop',
    mobile: 'pm-entry-create-mobile',
  },
  createGroup: {
    desktop: 'pm-group-create-desktop',
    mobile: 'pm-group-create-mobile',
  },
  importDialog: {
    desktop: 'pm-import-dialog',
    mobile: 'pm-import-dialog',
  },
  envRuntimeView: {
    desktop: 'pm-env-runtime-page',
    mobile: 'pm-env-runtime-page',
  },
} as const

const EXTENDED_ROOT_TAGS = [
  'pm-entry',
  'pm-entry-mobile',
  ...Object.values(EXTENDED_VIEW_TAGS).flatMap((tags) => [tags.desktop, tags.mobile]),
]

function hasExtendedComponents(): boolean {
  return EXTENDED_ROOT_TAGS.every((tagName) => customElements.get(tagName))
}

function getRequiredTag(showElement: unknown, layout: PMExtendedComponentLayout): string | null {
  if (showElement instanceof Entry) {
    return layout === 'mobile' ? 'pm-entry-mobile' : 'pm-entry'
  }
  if (showElement === 'createEntry') return EXTENDED_VIEW_TAGS.createEntry[layout]
  if (showElement === 'createGroup') return EXTENDED_VIEW_TAGS.createGroup[layout]
  if (showElement === 'importDialog') return EXTENDED_VIEW_TAGS.importDialog[layout]
  if (showElement === 'envRuntimeView') return EXTENDED_VIEW_TAGS.envRuntimeView[layout]
  return null
}

export class PMComponentLoaderModel {
  readonly extendedReady = atom(hasExtendedComponents())
  readonly extendedLoadError = atom<string | null>(null, 'passmanager.extendedComponents.error')
  private extendedPromise: Promise<void> | null = null
  private extendedRequest: Promise<boolean> | null = null

  constructor(
    private readonly loadExtendedRegistration: ExtendedRegistrationLoader = () =>
      import('../components/extended-registration'),
  ) {}

  requiresExtendedComponents(showElement: unknown): boolean {
    return getRequiredTag(showElement, 'desktop') !== null
  }

  isReadyFor(showElement: unknown, layout: PMExtendedComponentLayout): boolean {
    if (this.extendedReady()) return true
    const requiredTag = getRequiredTag(showElement, layout)
    return requiredTag === null || Boolean(customElements.get(requiredTag))
  }

  ensureExtendedComponents(): Promise<void> {
    if (this.extendedReady()) {
      return Promise.resolve()
    }

    if (hasExtendedComponents()) {
      this.extendedReady.set(true)
      return Promise.resolve()
    }

    if (this.extendedPromise) {
      return this.extendedPromise
    }

    this.extendedPromise = this.loadExtendedRegistration()
      .then(
        wrap(({registerPassmanagerExtendedComponents}) => {
          registerPassmanagerExtendedComponents()
          this.extendedReady.set(true)
          this.extendedLoadError.set(null)
        }),
      )
      .catch((error) => {
        this.extendedPromise = null
        throw error
      })

    return this.extendedPromise
  }

  requestExtendedComponents(showElement: unknown, layout: PMExtendedComponentLayout): Promise<boolean> {
    if (this.isReadyFor(showElement, layout)) return Promise.resolve(true)
    if (this.extendedLoadError()) return Promise.resolve(false)
    if (this.extendedRequest) return this.extendedRequest

    const request = this.ensureExtendedComponents()
      .then(() => true)
      .catch(
        wrap((error: unknown) => {
          this.extendedLoadError.set(error instanceof Error ? error.message : String(error))
          return false
        }),
      )
      .finally(() => {
        if (this.extendedRequest === request) {
          this.extendedRequest = null
        }
      })
    this.extendedRequest = request
    return request
  }

  retryExtendedComponents(showElement: unknown, layout: PMExtendedComponentLayout): Promise<boolean> {
    this.extendedLoadError.set(null)
    return this.requestExtendedComponents(showElement, layout)
  }
}

export const pmComponentLoaderModel = new PMComponentLoaderModel()

export function getPassmanagerExtendedWarmupTask(): UiComponentWarmupTask {
  return {
    key: 'passmanager:extended',
    run: () => pmComponentLoaderModel.ensureExtendedComponents(),
  }
}
