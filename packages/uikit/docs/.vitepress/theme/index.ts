import type {Theme} from 'vitepress'
import DefaultTheme from 'vitepress/theme'

import '../../../src/theme/tokens.css'
import {registerUikit} from '../../../src/index'
import './custom.css'
import LiveDemo from './components/LiveDemo.vue'

let registered = false

const theme: Theme = {
  ...DefaultTheme,
  enhanceApp(ctx) {
    DefaultTheme.enhanceApp?.(ctx)
    ctx.app.component('LiveDemo', LiveDemo)
    if (!registered && typeof window !== 'undefined') {
      registerUikit()
      registered = true
    }
  },
}

export default theme
