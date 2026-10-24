import {resolve, sep} from 'node:path'

// Local design viewer only. Serve the mockup and its existing token stylesheet.
const root = resolve(import.meta.dir, '../../../..')
const prototype = resolve(import.meta.dir)
const tokenFile = resolve(root, 'packages/uikit/src/theme/tokens.css')
const brandFile = resolve(root, 'apps/webview/src/assets/chromvoid-icon.svg')
const uxFile = resolve(prototype, '../ux-spec.md')
const server = Bun.serve({
  hostname: '127.0.0.1',
  port: 4318,
  async fetch(request) {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method not allowed', {status: 405})
    }
    let path: string
    try {
      path = decodeURIComponent(new URL(request.url).pathname)
    } catch {
      return new Response('Bad request', {status: 400})
    }
    if (path.endsWith('/')) path += 'index.html'
    const target = resolve(root, `.${path}`)
    const allowed =
      (target.startsWith(prototype + sep) && /\.(html|css|js)$/.test(target)) ||
      target === tokenFile ||
      target === brandFile ||
      target === uxFile
    if (!allowed) return new Response('Not found', {status: 404})
    const file = Bun.file(target)
    if (!(await file.exists())) return new Response('Not found', {status: 404})
    return new Response(request.method === 'HEAD' ? null : file, {
      headers: {'Content-Type': file.type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'},
    })
  },
})
console.log(`IOS-air design: ${server.url}apps/IOS-air/design/prototype/`)
