import path from 'node:path'
import {type ViteDevServer, createServer} from 'vite'

let server: ViteDevServer | undefined

export async function ensureViteStarted(): Promise<ViteDevServer> {
  if (server) return server

  // Проверяем, не запущен ли уже внешний dev-сервер на 4400
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 1000)
    const res = await fetch('http://localhost:4400/index.html', {
      signal: controller.signal,
    })
    clearTimeout(timeout)
    if (res.ok) {
      // Внешний сервер уже работает – возвращаем заглушку
      return (server = {
        async listen() {
          return this
        },
        async close() {},
      } as unknown as ViteDevServer)
    }
  } catch {
    // недоступен – поднимем свой сервер ниже
  }

  server = await createServer({
    root: path.resolve(__dirname, '../../src'),
    server: {port: 4400},
    configFile: path.resolve(__dirname, '../../vite.config.ts'),
    logLevel: 'error',
  })
  await server.listen()
  return server
}

export async function stopVite() {
  await server?.close()
  server = undefined
}
