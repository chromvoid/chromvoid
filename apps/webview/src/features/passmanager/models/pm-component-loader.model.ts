import {atom} from '@reatom/core'

import {Entry} from '@project/passmanager/core'
import type {UiComponentWarmupTask} from 'root/app/bootstrap/surface-component-loader'

function hasExtendedComponents(): boolean {
  return Boolean(customElements.get('pm-entry') && customElements.get('pm-group-create-desktop'))
}

class PMComponentLoaderModel {
  readonly extendedReady = atom(hasExtendedComponents())
  private extendedPromise: Promise<void> | null = null

  requiresExtendedComponents(showElement: unknown): boolean {
    return (
      showElement instanceof Entry ||
      showElement === 'createEntry' ||
      showElement === 'createGroup' ||
      showElement === 'importDialog'
    )
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

    this.extendedPromise = import('../components/extended-registration')
      .then(({registerPassmanagerExtendedComponents}) => {
        registerPassmanagerExtendedComponents()
        this.extendedReady.set(true)
      })
      .catch((error) => {
        this.extendedPromise = null
        throw error
      })

    return this.extendedPromise
  }
}

export const pmComponentLoaderModel = new PMComponentLoaderModel()

export function getPassmanagerExtendedWarmupTask(): UiComponentWarmupTask {
  return {
    key: 'passmanager:extended',
    run: () => pmComponentLoaderModel.ensureExtendedComponents(),
  }
}
