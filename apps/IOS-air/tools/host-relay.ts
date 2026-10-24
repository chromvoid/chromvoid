// Real repository relay on ephemeral ports for the explicit native/desktop integration test.
import {once} from 'node:events'
import {writeFileSync} from 'node:fs'

import {metricsServer, relayServer} from '../../relay/src/index.ts'

for (const server of [relayServer, metricsServer]) {
  if (!server.listening) await once(server, 'listening')
}
const address = relayServer.address()
if (!address || typeof address === 'string') throw new Error('Expected an ephemeral TCP relay')
writeFileSync(process.argv[2], JSON.stringify({url: `ws://127.0.0.1:${address.port}`}))
