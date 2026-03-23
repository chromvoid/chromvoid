import {state} from '@statx/core'

import {Group, type IGroup} from '@project/passmanager'
import {getFormData} from '@project/utils'
import {pmIconStore} from '../../../models/pm-icon-store'

export class PMGroupEditModel {
  readonly editedIconRef = state<string | undefined>(undefined)

  syncFromCurrentGroup(): Group | null {
    const group = this.getCurrentGroup()
    this.editedIconRef.set(group?.iconRef)
    return group
  }

  getCurrentGroup(): Group | null {
    const card = window.passmanager?.showElement()
    return card instanceof Group ? card : null
  }

  setIconRef(iconRef: string | undefined): void {
    this.editedIconRef.set(iconRef)
  }

  async submit(form: HTMLFormElement, card: Group): Promise<void> {
    const data = getFormData(form) as IGroup
    const iconRef = this.editedIconRef.peek()
    const oldPath = card.name
    const newPath = String(data.name ?? '').trim()

    card.updateData({
      name: newPath,
      iconRef,
    })
    if (oldPath && newPath && oldPath !== newPath) {
      await pmIconStore.setGroupIcon(oldPath, null)
    }

    await pmIconStore.setGroupIcon(newPath, iconRef ?? null)
    await card.root.save()
  }
}
