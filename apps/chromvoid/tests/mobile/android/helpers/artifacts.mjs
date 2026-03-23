import {mkdir, writeFile} from 'node:fs/promises'
import {join} from 'node:path'

export async function ensureSubdir(root, name) {
  const dir = join(root, name)
  await mkdir(dir, {recursive: true})
  return dir
}

export async function writeJson(root, name, value) {
  await writeFile(join(root, name), `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

export async function writeText(root, name, value) {
  await writeFile(join(root, name), value, 'utf8')
}

export async function captureSnapshot(driver, root, label) {
  const screenshotsDir = await ensureSubdir(root, 'screenshots')
  const pagesourceDir = await ensureSubdir(root, 'pagesource')
  const contextsDir = await ensureSubdir(root, 'contexts')

  const screenshot = await driver.takeScreenshot()
  await writeFile(join(screenshotsDir, `${label}.png`), screenshot, 'base64')
  await writeFile(join(pagesourceDir, `${label}.xml`), await driver.getPageSource(), 'utf8')

  let contexts = []
  try {
    contexts = await driver.getContexts({returnDetailedContexts: true, filterByCurrentAndroidApp: true})
  } catch {
    try {
      contexts = await driver.getContexts()
    } catch {
      contexts = []
    }
  }

  await writeFile(join(contextsDir, `${label}.json`), `${JSON.stringify(contexts, null, 2)}\n`, 'utf8')
}
