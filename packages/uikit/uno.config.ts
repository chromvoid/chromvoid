import {defineConfig, presetWind3} from 'unocss'
import transformerDirectives from '@unocss/transformer-directives'

export default defineConfig({
  presets: [presetWind3({preflight: false})],
  transformers: [transformerDirectives()],
  content: {
    pipeline: {
      include: [/\.ts$/],
    },
  },
  theme: {
    spacing: {
      1: 'var(--cv-space-1)',
      2: 'var(--cv-space-2)',
      3: 'var(--cv-space-3)',
      4: 'var(--cv-space-4)',
      5: 'var(--cv-space-5)',
      6: 'var(--cv-space-6)',
      7: 'var(--cv-space-7)',
      8: 'var(--cv-space-8)',
    },
    borderRadius: {
      sm: 'var(--cv-radius-sm)',
      md: 'var(--cv-radius-md)',
      lg: 'var(--cv-radius-lg)',
      xl: 'var(--cv-radius-xl)',
      pill: 'var(--cv-radius-pill)',
      full: 'var(--cv-radius-full)',
    },
    fontSize: {
      xs: ['var(--cv-font-size-xs)', {}],
      sm: ['var(--cv-font-size-sm)', {}],
      base: ['var(--cv-font-size-base)', {}],
      lg: ['var(--cv-font-size-lg)', {}],
      xl: ['var(--cv-font-size-xl)', {}],
      '2xl': ['var(--cv-font-size-2xl)', {}],
    },
    colors: {
      primary: 'var(--cv-color-primary)',
      accent: 'var(--cv-color-accent)',
      success: 'var(--cv-color-success)',
      warning: 'var(--cv-color-warning)',
      danger: 'var(--cv-color-danger)',
      surface: 'var(--cv-color-surface)',
      border: 'var(--cv-color-border)',
      text: {
        DEFAULT: 'var(--cv-color-text)',
        muted: 'var(--cv-color-text-muted)',
        subtle: 'var(--cv-color-text-subtle)',
      },
    },
    boxShadow: {
      sm: 'var(--cv-shadow-sm)',
      md: 'var(--cv-shadow-md)',
      lg: 'var(--cv-shadow-lg)',
      xl: 'var(--cv-shadow-xl)',
    },
    duration: {
      fast: 'var(--cv-duration-fast)',
      normal: 'var(--cv-duration-normal)',
      slow: 'var(--cv-duration-slow)',
    },
  },
})
