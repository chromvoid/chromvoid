import {ReatomLitElement} from '@chromvoid/uikit/reatom-lit'

import {settingsPageModel} from './settings.model'

export abstract class SettingsPageLayoutBase extends ReatomLitElement {
  protected readonly model = settingsPageModel

  connectedCallback(): void {
    super.connectedCallback()
    document.addEventListener('visibilitychange', this)
    window.addEventListener('focus', this)
    void this.model.load()
  }

  disconnectedCallback(): void {
    document.removeEventListener('visibilitychange', this)
    window.removeEventListener('focus', this)
    super.disconnectedCallback()
  }

  handleEvent(event: Event): void {
    if (event.type === 'focus' || (event.type === 'visibilitychange' && document.visibilityState === 'visible')) {
      void this.model.refreshCredentialProviderStatus()
      void this.model.refreshAndroidQuickLockTileStatus()
      void this.model.refreshSshAgentStatus()
    }
  }
}
