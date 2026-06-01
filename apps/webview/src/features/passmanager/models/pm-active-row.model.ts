import {atom} from '@reatom/core'

type PMActiveRowMap = Record<string, string | null>

class PMActiveRowModel {
  readonly activeItemIdByContainer = atom<PMActiveRowMap>({}, 'passmanager.activeRow.activeByContainer')

  setActive(containerId: string, itemId: string | null): void {
    this.activeItemIdByContainer.set(this.updateMap(this.activeItemIdByContainer(), containerId, itemId))
  }

  getActive(containerId: string): string | null {
    return this.activeItemIdByContainer()[containerId] ?? null
  }

  clearContainer(containerId: string): void {
    this.activeItemIdByContainer.set(this.updateMap(this.activeItemIdByContainer(), containerId, null))
  }

  clearAll(): void {
    this.activeItemIdByContainer.set({})
  }

  private updateMap(map: PMActiveRowMap, containerId: string, itemId: string | null): PMActiveRowMap {
    if (!containerId) {
      return map
    }

    if (itemId == null) {
      if (!(containerId in map)) {
        return map
      }

      const next = {...map}
      delete next[containerId]
      return next
    }

    if (map[containerId] === itemId) {
      return map
    }

    return {
      ...map,
      [containerId]: itemId,
    }
  }
}

export const pmActiveRowModel = new PMActiveRowModel()
