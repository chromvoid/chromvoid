import {statSync} from 'node:fs'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'

const MAX_POPUP_BYTES = 700 * 1024
const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const popupPath = join(projectRoot, 'dist', 'popup.js')
const bytes = statSync(popupPath).size

if (bytes > MAX_POPUP_BYTES) {
  throw new Error(`popup.js is ${bytes} bytes; budget is ${MAX_POPUP_BYTES} bytes`)
}

console.log(`✓ popup.js ${bytes} bytes (budget ${MAX_POPUP_BYTES})`)
