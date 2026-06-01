import {ReatomLitElement} from '@chromvoid/uikit/reatom-lit'
import {type CommandPaletteMode, type CommandPaletteOpenDetail} from 'root/shared/services/command-palette'
import {
  beginMobileFilePickerSession,
  type MobileFilePickerSession,
} from 'root/shared/services/mobile-file-picker-session'
import {sharedStyles} from 'root/shared/ui/shared-styles'

import {renderCommandBar} from './command-bar.render'
import {commandBarStyles} from './command-bar.styles'
import {commandBarModel} from '../models/command-bar.model'
import {emitFileManagerCommand} from '../services/file-manager-commands'

export class CommandBarBase extends ReatomLitElement {
  static styles = [sharedStyles, ...commandBarStyles]
  private filePickerSession: MobileFilePickerSession | null = null
  private detachRuntime?: () => void
  private readonly handleOpenRequestListener = (e: Event) => this.handleOpenRequest(e)

  private readonly model = commandBarModel

  get query() {
    return this.model.query
  }

  get selectedIndex() {
    return this.model.selectedIndex
  }

  private handleOpenRequest(e: Event) {
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
    this.detachRuntime = this.model.attachRuntime({
      requestOpen: () => this.setAttribute('open', ''),
      requestClose: () => this.removeAttribute('open'),
      focusSearchInput: () => {
        this.shadowRoot?.querySelector<HTMLInputElement>('.search-input')?.focus()
      },
      openFileInput: () => {
        this.openFileInput()
      },
      endFilePickerSession: () => {
        this.endFilePickerSession()
      },
      dispatchCommand: (command) => emitFileManagerCommand(command),
    })
    this.model.connect()
    window.addEventListener('keydown', this.model.onKeyDown)
    window.addEventListener('command-bar:open', this.handleOpenRequestListener)
  }

  override disconnectedCallback() {
    window.removeEventListener('keydown', this.model.onKeyDown)
    window.removeEventListener('command-bar:open', this.handleOpenRequestListener)
    this.endFilePickerSession()
    this.model.disconnect()
    this.detachRuntime?.()
    this.detachRuntime = undefined
    super.disconnectedCallback()
  }

  private openFileInput() {
    const input = this.shadowRoot?.querySelector<HTMLInputElement>('.file-input')
    if (!input) return

    this.beginFilePickerSession()
    try {
      input.click()
    } catch {
      this.endFilePickerSession()
    }
  }

  private beginFilePickerSession() {
    this.endFilePickerSession()
    this.filePickerSession = beginMobileFilePickerSession()
  }

  private endFilePickerSession() {
    this.filePickerSession?.end()
    this.filePickerSession = null
  }

  override render() {
    return renderCommandBar(this.model)
  }
}
