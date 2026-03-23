import {XLitElement} from '@statx/lit'
import {type CommandPaletteMode, type CommandPaletteOpenDetail} from 'root/shared/services/command-palette'
import {sharedStyles} from 'root/shared/ui/shared-styles'

import {renderCommandBar} from './command-bar.render'
import {commandBarStyles} from './command-bar.styles'
import {CommandBarModel} from '../models/command-bar.model'
import type {PasswordsMobileCommandProvider} from './command-bar.types'

export class CommandBarBase extends XLitElement {
  static styles = [sharedStyles, ...commandBarStyles]

  private readonly model = new CommandBarModel({
    requestOpen: () => this.setAttribute('open', ''),
    requestClose: () => this.removeAttribute('open'),
    focusSearchInput: () => {
      this.shadowRoot?.querySelector<HTMLInputElement>('.search-input')?.focus()
    },
    openFileInput: () => {
      this.shadowRoot?.querySelector<HTMLInputElement>('.file-input')?.click()
    },
    dispatchCommand: (detail) => {
      window.dispatchEvent(
        new CustomEvent('command-bar:command', {
          detail,
        }),
      )
    },
    getPasswordsMobileCommandProvider: () => this.getPasswordsMobileCommandProvider(),
  })

  get query() {
    return this.model.query
  }

  get selectedIndex() {
    return this.model.selectedIndex
  }

  protected getPasswordsMobileCommandProvider(): PasswordsMobileCommandProvider | null {
    const passwordManager = document.querySelector('password-manager') as HTMLElement | null
    if (!passwordManager) return null
    return (passwordManager as any)?.shadowRoot?.querySelector(
      'password-manager-mobile-layout',
    ) as PasswordsMobileCommandProvider | null
  }

  private readonly onOpenRequest = (e: Event) => {
    const detail = (e as CustomEvent<CommandPaletteOpenDetail | undefined>).detail
    this.model.openFromRequest(detail?.mode ?? 'all')
  }

  open(mode: CommandPaletteMode = 'all') {
    this.model.open(mode)
  }

  close() {
    this.model.close()
  }

  getFilteredCommands() {
    return this.model.getFilteredCommands()
  }

  openFromRequest(mode: CommandPaletteMode = 'all') {
    this.model.openFromRequest(mode)
  }

  override connectedCallback() {
    super.connectedCallback()
    window.addEventListener('keydown', this.model.onKeyDown)
    window.addEventListener('command-bar:open', this.onOpenRequest as EventListener)
  }

  override disconnectedCallback() {
    window.removeEventListener('keydown', this.model.onKeyDown)
    window.removeEventListener('command-bar:open', this.onOpenRequest as EventListener)
    super.disconnectedCallback()
  }

  override render() {
    return renderCommandBar(this.model)
  }
}
