import {fileURLToPath, URL} from 'node:url'
import UnoCSS from 'unocss/vite'
import {defineConfig} from 'vite'

export default defineConfig({
  root: 'demo',
  plugins: [UnoCSS()],
  resolve: {
    alias: [
      {
        find: '@chromvoid/headless-ui',
        replacement: fileURLToPath(new URL('../headless/src/index.ts', import.meta.url)),
      },
      {
        find: /^@chromvoid\/headless-ui\/(.*)$/,
        replacement: fileURLToPath(new URL('../headless/src/$1', import.meta.url)),
      },
    ],
  },
  server: {
    host: '127.0.0.1',
    port: 4173,
  },
  build: {
    target: 'es2022',
    outDir: '../dist-demo',
    emptyOutDir: true,
  },
})
