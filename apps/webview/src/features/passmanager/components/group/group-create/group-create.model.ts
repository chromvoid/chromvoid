import {computed, state} from '@statx/core'

import {Group} from '@project/passmanager'
import {getFormData} from '@project/utils'
import {pmIconStore} from '../../../models/pm-icon-store'

type PMGroupCreateFormData = {
  entries?: string | string[]
  name: string
}

export class PMGroupCreateModel {
  readonly iconRef = state<string | undefined>(undefined)
  readonly entries = computed(() => window.passmanager?.topLevelEntries ?? [])

  setIconRef(iconRef: string | undefined): void {
    this.iconRef.set(iconRef)
  }

  async submit(form: HTMLFormElement, selectedEntries: string | string[] | undefined): Promise<void> {
    const passmanager = window.passmanager
    if (!passmanager) {
      return
    }

    const data = getFormData<PMGroupCreateFormData>(form)
    const entries = this.normalizeSelectedEntries(selectedEntries)

    passmanager.createGroup({
      name: data.name,
      entries: entries.map((item) => passmanager.getEntry(item)).filter((item) => !!item),
    })

    const selected = passmanager.showElement()
    const iconRef = this.iconRef.peek()
    if (selected instanceof Group && iconRef) {
      selected.updateData({iconRef})
      await pmIconStore.setGroupIcon(selected.name, iconRef)
      await selected.root.save()
    }
  }

  private normalizeSelectedEntries(value: string | string[] | undefined): string[] {
    if (!value) {
      return []
    }

    return Array.isArray(value) ? value : [value]
  }
}
