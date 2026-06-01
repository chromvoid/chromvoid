import path from 'node:path'
import {type ViteDevServer, createServer} from 'vite'

let server: ViteDevServer | undefined

export async function ensureViteStarted(): Promise<ViteDevServer> {
  if (server) return server

  const getExternalServerStub = () =>
    (server = {
      async listen() {
        return this
      },
      async close() {},
    } as unknown as ViteDevServer)

  // Check to see if an external dev server is running on 4400
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 1000)
    const res = await fetch('http://localhost:4400/index.html', {
      signal: controller.signal,
    })
    clearTimeout(timeout)
    if (res.ok) {
      // The external server is already working – return the plug
      return getExternalServerStub()
    }
  } catch {
    // Inaccessible – let’s take your server down
  }

  server = await createServer({
    root: path.resolve(__dirname, '../../src'),
    server: {port: 4400},
    configFile: path.resolve(__dirname, '../../vite.config.ts'),
    logLevel: 'error',
  })
  try {
    await server.listen()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (!message.includes('Port 4400 is already in use')) {
      throw error
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 1000)
    try {
      const res = await fetch('http://localhost:4400/index.html', {
        signal: controller.signal,
      })
      if (res.ok) {
        await server.close()
        return getExternalServerStub()
      }
    } finally {
      clearTimeout(timeout)
    }

    throw error
  }
  return server
}

export async function stopVite() {
  await server?.close()
  server = undefined
}
