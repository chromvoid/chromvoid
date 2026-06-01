import {atom} from '@reatom/core'

export class ImageGalleryDesktopModel {
  readonly infoPanelOpen = atom(false, 'media.imageGalleryV2.desktop.infoPanelOpen')

  openInfoPanel() {
    this.infoPanelOpen.set(true)
  }

  closeInfoPanel() {
    this.infoPanelOpen.set(false)
  }

  toggleInfoPanel() {
    this.infoPanelOpen.set(!this.infoPanelOpen())
  }

  reset() {
    this.closeInfoPanel()
  }
}
