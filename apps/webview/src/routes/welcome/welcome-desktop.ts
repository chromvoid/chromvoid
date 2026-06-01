import {css} from 'lit'

import {welcomeStyles} from './welcome.styles'
import {WelcomePageLayoutBase} from './welcome-layout-base'

export class WelcomePageDesktopLayout extends WelcomePageLayoutBase {
  static elementName = 'welcome-page-desktop-layout'
  protected readonly layoutVariant = 'desktop' as const

  static styles = [
    welcomeStyles,
    css`
      .container {
        width: min(900px, 100%);
      }
    `,
  ]
}
