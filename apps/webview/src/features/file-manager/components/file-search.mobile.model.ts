import {atom} from '@reatom/core'

export class FileSearchMobileModel {
  readonly sheetOpen = atom(false, 'fileSearch.mobile.sheetOpen')

  openSheet(): void {
    this.sheetOpen.set(true)
  }

  syncSheetOpen(open: unknown): void {
    if (typeof open !== 'boolean') return
    this.sheetOpen.set(open)
  }
}
