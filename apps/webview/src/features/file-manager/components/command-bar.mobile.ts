import {CommandBarBase} from './command-bar.base'

export class CommandBarMobile extends CommandBarBase {
  static elementName = 'command-bar'
  static define() {
    if (!customElements.get(this.elementName)) {
      customElements.define(this.elementName, this as unknown as CustomElementConstructor)
    }
  }
}
