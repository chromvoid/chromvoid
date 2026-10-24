import {resolve} from 'node:path'
import {createRequire} from 'node:module'
import {readdirSync} from 'node:fs'

const root = resolve(import.meta.dir, '../../../..')
const uiRequire = createRequire(resolve(root, 'packages/uikit/package.json'))
const assets = new Map([
  ['/', resolve(import.meta.dir, 'index.html')],
  ['/styles.css', resolve(import.meta.dir, 'styles.css')],
  ['/tokens.css', resolve(root, 'packages/uikit/src/theme/tokens.css')],
  ['/brand.css', resolve(root, 'packages/theme/src/brand.css')],
  ['/air-design.css', resolve(root, 'packages/theme/src/air-design.css')],
  ['/brand.svg', resolve(root, 'apps/webview/src/assets/chromvoid-icon.svg')],
  ['/concepts', resolve(import.meta.dir, '../concepts/index.html')],
  ['/screens', resolve(import.meta.dir, '../screenshots/index.html')],
])
const screenshotDirectory = resolve(import.meta.dir, '../screenshots')
for (const filename of readdirSync(screenshotDirectory)) {
  if (/^[a-z0-9-]+\.png$/.test(filename))
    assets.set(`/screens/${filename}`, resolve(screenshotDirectory, filename))
}
const server = Bun.serve({
  hostname: '127.0.0.1',
  port: 4320,
  async fetch(request) {
    if (!['GET', 'HEAD'].includes(request.method)) return new Response(null, {status: 405})
    const path = new URL(request.url).pathname
    const headers = {'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'}
    if (path === '/app.js') {
      const result = await Bun.build({
        entrypoints: [resolve(import.meta.dir, 'app.js')],
        target: 'browser',
        plugins: [
          {
            name: 'existing-ui-dependencies',
            setup(build) {
              build.onResolve({filter: /^(@reatom\/core|lit\/directives\/unsafe-svg\.js)$/}, (args) => ({
                path: uiRequire.resolve(args.path),
              }))
            },
          },
        ],
      })
      if (!result.success) {
        console.error(result.logs)
        return new Response('Prototype build failed', {status: 500})
      }
      return new Response(request.method === 'HEAD' ? null : result.outputs[0], {
        headers: {...headers, 'Content-Type': 'text/javascript'},
      })
    }
    const target = assets.get(path)
    if (!target) return new Response('Not found', {status: 404})
    const file = Bun.file(target)
    return new Response(request.method === 'HEAD' ? null : file, {
      headers: {...headers, 'Content-Type': file.type},
    })
  },
})
console.log(`Android Air design studio: ${server.url}`)
