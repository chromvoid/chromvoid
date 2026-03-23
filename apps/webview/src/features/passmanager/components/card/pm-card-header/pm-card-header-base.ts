import {XLitElement} from '@statx/lit'

import {html, nothing, type TemplateResult} from 'lit'
import {PMCardHeaderModel} from './pm-card-header.model'

export abstract class PMCardHeaderBase extends XLitElement {
  protected readonly model = new PMCardHeaderModel()

  protected hasAvatarSlot(): boolean {
    return true
  }

  public override connectedCallback(): void {
    super.connectedCallback()
    this.model.setHasAvatarSlot(this.hasAvatarSlot())
  }

  protected renderAvatar(): TemplateResult | typeof nothing {
    if (!this.model.hasAvatarSlot()) {
      return nothing
    }

    return html`
      <div class="avatar">
        <slot name="avatar"></slot>
      </div>
    `
  }

  protected render() {
    return html`
      <header class="header">
        <div class="actions back-nav">
          <slot name="back"></slot>
        </div>
        ${this.renderAvatar()}
        <div class="content">
          <slot></slot>
        </div>
        <nav class="actions">
          <slot name="actions"></slot>
        </nav>
      </header>
    `
  }
}
