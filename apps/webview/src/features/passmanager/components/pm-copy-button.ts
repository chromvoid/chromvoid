import type {TemplateResult} from 'lit'
import {ifDefined} from 'lit/directives/if-defined.js'
import {html} from '@chromvoid/uikit/reatom-lit'

import {i18n} from '@project/passmanager/i18n'
import {passmanagerAutoWipeClipboard} from '../service/passmanager-clipboard'

export type PMCopyButtonValue = string | (() => Promise<string>)

export type PMCopyButtonOptions = {
  value: PMCopyButtonValue
  ariaLabel?: string
  className?: string
  slot?: string
  size?: 'small' | 'medium' | 'large'
  appearance?: 'default' | 'plain'
}

export function renderPMCopyButton(options: PMCopyButtonOptions): TemplateResult {
  return html`
    <cv-copy-button
      class=${ifDefined(options.className)}
      slot=${ifDefined(options.slot)}
      size=${ifDefined(options.size)}
      appearance=${ifDefined(options.appearance)}
      aria-label=${options.ariaLabel ?? i18n('button:copy')}
      .value=${options.value}
      .clipboard=${passmanagerAutoWipeClipboard}
      .successLabel=${i18n('button:copied')}
      .errorLabel=${i18n('announce:copy_error')}
    ></cv-copy-button>
  `
}
