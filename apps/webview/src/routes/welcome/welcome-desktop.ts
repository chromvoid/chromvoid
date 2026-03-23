import {css} from 'lit'

import {welcomeStyles} from './welcome.styles'
import {renderWelcomeToolsSection} from './sections/tools'
import {WelcomePageLayoutBase} from './welcome-layout-base'
import type {WelcomeToolsSectionOptions} from './welcome-layout-base'

export class WelcomePageDesktopLayout extends WelcomePageLayoutBase {
  static elementName = 'welcome-page-desktop-layout'

  static styles = [
    welcomeStyles,
    css`
      .container {
        width: min(900px, 100%);
      }
    `,
  ]

  protected renderToolsSection(options: WelcomeToolsSectionOptions) {
    return renderWelcomeToolsSection(options)
  }
}
