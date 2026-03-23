import {defineConfig} from 'vitepress'
import {liveDemoPlugin} from './markdown/liveDemo'

const description =
  'ChromVoid UIKit is a Lit-based component layer over @chromvoid/headless-ui with reusable theme tokens and accessible interactions.'

export default defineConfig({
  title: 'ChromVoid UIKit',
  description,
  lang: 'en-US',
  cleanUrls: true,
  lastUpdated: true,
  head: [
    ['meta', {name: 'theme-color', content: '#0b0d12'}],
    ['meta', {property: 'og:title', content: 'ChromVoid UIKit'}],
    ['meta', {property: 'og:description', content: description}],
  ],
  themeConfig: {
    nav: [
      {text: 'Guide', link: '/guide/getting-started'},
      {text: 'Components', link: '/components/'},
    ],
    sidebar: [
      {
        text: 'Guide',
        items: [
          {text: 'Getting Started', link: '/guide/getting-started'},
          {text: 'Theming', link: '/guide/theming'},
        ],
      },
      {
        text: 'Components',
        items: [
          {text: 'Overview', link: '/components/'},
          {text: 'cv-accordion', link: '/components/accordion'},
          {text: 'cv-alert', link: '/components/alert'},
          {text: 'cv-breadcrumb', link: '/components/breadcrumb'},
          {text: 'cv-button', link: '/components/button'},
          {text: 'cv-carousel', link: '/components/carousel'},
          {text: 'cv-checkbox', link: '/components/checkbox'},
          {text: 'cv-combobox', link: '/components/combobox'},
          {text: 'cv-context-menu', link: '/components/context-menu'},
          {text: 'cv-dialog', link: '/components/dialog'},
          {text: 'cv-disclosure', link: '/components/disclosure'},
          {text: 'cv-feed', link: '/components/feed'},
          {text: 'cv-grid', link: '/components/grid'},
          {text: 'cv-landmark', link: '/components/landmark'},
          {text: 'cv-link', link: '/components/link'},
          {text: 'cv-listbox', link: '/components/listbox'},
          {text: 'cv-menu', link: '/components/menu'},
          {text: 'cv-meter', link: '/components/meter'},
          {text: 'cv-option', link: '/components/option'},
          {text: 'cv-select', link: '/components/select'},
          {text: 'cv-sidebar', link: '/components/sidebar'},
          {text: 'cv-switch', link: '/components/switch'},
          {text: 'cv-tabs', link: '/components/tabs'},
        ],
      },
    ],
    search: {
      provider: 'local',
    },
    outline: [2, 3],
  },
  markdown: {
    config: (md) => {
      liveDemoPlugin(md)
    },
  },
  vue: {
    template: {
      compilerOptions: {
        isCustomElement: (tag) => tag.startsWith('cv-'),
      },
    },
  },
})
