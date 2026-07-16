import {atom} from '@reatom/core'

type PMListScrollTopMap = Record<string, number>

class PMListViewportModel {
  readonly scrollTopByContext = atom<PMListScrollTopMap>(
    {},
    'passmanager.listViewport.scrollTopByContext',
  )

  saveScrollTop(contextKey: string, scrollTop: number): void {
    if (!contextKey || !Number.isFinite(scrollTop)) return

    const nextScrollTop = Math.max(0, scrollTop)
    const current = this.scrollTopByContext()
    if (current[contextKey] === nextScrollTop) return

    this.scrollTopByContext.set({...current, [contextKey]: nextScrollTop})
  }

  getScrollTop(contextKey: string): number | null {
    const scrollTop = this.scrollTopByContext()[contextKey]
    return typeof scrollTop === 'number' ? scrollTop : null
  }

  clearAll(): void {
    this.scrollTopByContext.set({})
  }
}

export const pmListViewportModel = new PMListViewportModel()
