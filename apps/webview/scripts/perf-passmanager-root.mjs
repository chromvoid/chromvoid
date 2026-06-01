import {chromium} from 'playwright'

const url = process.env['PASSMANAGER_PERF_URL'] ?? 'http://localhost:4400/?surface=passwords&pm=root'

function createDeepFindScript() {
  return `
    const deepFind = (root, selector) => {
      const found = root.querySelector(selector)
      if (found) return found
      for (const el of root.querySelectorAll('*')) {
        if (el.shadowRoot) {
          const inner = deepFind(el.shadowRoot, selector)
          if (inner) return inner
        }
      }
      return null
    }
  `
}

const browser = await chromium.launch({headless: true})
const page = await browser.newPage({viewport: {width: 1440, height: 960}})

await page.addInitScript(() => {
  window.__pmPerf = {
    paints: {},
    lcp: 0,
    cls: 0,
    longTasks: [],
  }

  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        window.__pmPerf.paints[entry.name] = entry.startTime
      }
    }).observe({type: 'paint', buffered: true})
  } catch {}

  try {
    new PerformanceObserver((list) => {
      const entries = list.getEntries()
      const last = entries[entries.length - 1]
      if (last) {
        window.__pmPerf.lcp = last.startTime
      }
    }).observe({type: 'largest-contentful-paint', buffered: true})
  } catch {}

  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (!entry.hadRecentInput) {
          window.__pmPerf.cls += entry.value
        }
      }
    }).observe({type: 'layout-shift', buffered: true})
  } catch {}

  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        window.__pmPerf.longTasks.push({start: entry.startTime, duration: entry.duration})
      }
    }).observe({type: 'longtask', buffered: true})
  } catch {}
})

await page.goto(url, {waitUntil: 'load'})
await page.waitForTimeout(3500)

const startup = await page.evaluate(`
  (() => {
    ${createDeepFindScript()}

    const resources = performance
      .getEntriesByType('resource')
      .map((entry) => ({
        name: entry.name,
        initiatorType: entry.initiatorType,
        transferSize: entry.transferSize ?? 0,
        encodedBodySize: entry.encodedBodySize ?? 0,
        decodedBodySize: entry.decodedBodySize ?? 0,
        duration: entry.duration ?? 0,
      }))

    const findResource = (predicate) => resources.find(predicate) ?? null
    const filterResources = (predicate) => resources.filter(predicate)
    const sumField = (list, key) => list.reduce((total, entry) => total + (entry[key] ?? 0), 0)
    const topResources = (list, limit = 5) =>
      [...list]
        .sort((a, b) => (b.encodedBodySize ?? 0) - (a.encodedBodySize ?? 0))
        .slice(0, limit)
    const toSummary = (entry) =>
      entry
        ? {
            name: entry.name,
            transferSize: entry.transferSize,
            encodedBodySize: entry.encodedBodySize,
            decodedBodySize: entry.decodedBodySize,
            duration: entry.duration,
          }
        : null

    const jsChunks = filterResources((entry) => /\\/chunk-[^/]+\\.js(?:\\?|$)/.test(entry.name))
    const mockStateResources = filterResources((entry) => entry.name.includes('/api/mock-state'))
    const fontFiles = filterResources(
      (entry) =>
        entry.initiatorType === 'font' ||
        /\\.(ttf|woff2?)(?:\\?|$)/.test(entry.name),
    )

    const nav = performance.getEntriesByType('navigation')[0]
    const perf = window.__pmPerf ?? {}
    const passmanager = window.passmanager
    const groups = passmanager?.groups ?? []
    const totalEntries = groups.reduce((count, group) => {
      const searched = typeof group?.searched === 'function' ? group.searched() : []
      return count + searched.filter((item) => item?.constructor?.name === 'Entry').length
    }, 0)
    const blocking = (perf.longTasks ?? []).reduce((sum, task) => sum + Math.max(0, task.duration - 50), 0)
    const maxLongTask = (perf.longTasks ?? []).reduce((max, task) => Math.max(max, task.duration), 0)

    return {
      href: location.href,
      navigation: nav
        ? {
            domContentLoaded: nav.domContentLoadedEventEnd,
            load: nav.loadEventEnd,
            responseEnd: nav.responseEnd,
          }
        : null,
      paints: perf.paints ?? {},
      lcp: perf.lcp ?? 0,
      cls: perf.cls ?? 0,
      longTaskCount: perf.longTasks?.length ?? 0,
      totalBlockingTime: blocking,
      maxLongTask,
      groupsCount: groups.length,
      totalEntries,
      rootResultCount:
        passmanager && typeof passmanager.showElement === 'function' && typeof passmanager.showElement()?.searched === 'function'
          ? passmanager.showElement().searched().length
          : null,
      searchExists: Boolean(deepFind(document, 'pm-search')),
      groupExists: Boolean(deepFind(document, 'pm-group')),
      resources: {
        indexJs: toSummary(findResource((entry) => entry.name.endsWith('/index.js'))),
        jsChunkTotals: {
          count: jsChunks.length,
          transferSize: sumField(jsChunks, 'transferSize'),
          encodedBodySize: sumField(jsChunks, 'encodedBodySize'),
          decodedBodySize: sumField(jsChunks, 'decodedBodySize'),
        },
        jsChunks: topResources(jsChunks).map(toSummary),
        mockState: mockStateResources.map(toSummary),
        fontStylesheet: toSummary(
          findResource((entry) => entry.name.endsWith('/assets/fonts.vendored.css')),
        ),
        fontTotals: {
          count: fontFiles.length,
          transferSize: sumField(fontFiles, 'transferSize'),
          encodedBodySize: sumField(fontFiles, 'encodedBodySize'),
          decodedBodySize: sumField(fontFiles, 'decodedBodySize'),
        },
        fontFiles: topResources(fontFiles).map(toSummary),
      },
    }
  })()
`)

const search = await page.evaluate(`
  (async () => {
    ${createDeepFindScript()}

    const readLongTasks = () => {
      const tasks = Array.isArray(window.__pmPerf?.longTasks) ? window.__pmPerf.longTasks : []
      return tasks.map((task) => ({start: task.start, duration: task.duration}))
    }

    const clearLongTasks = () => {
      if (window.__pmPerf) {
        window.__pmPerf.longTasks = []
      }
    }

    const searchHost = deepFind(document, 'pm-search')
    const searchRoot = searchHost?.shadowRoot ?? null
    const input = searchRoot ? deepFind(searchRoot, 'input') : null

    if (!(input instanceof HTMLInputElement)) {
      return {error: 'search input not found'}
    }

    const getResultCount = () => {
      const passmanager = window.passmanager
      const current = passmanager && typeof passmanager.showElement === 'function' ? passmanager.showElement() : null
      const list = current && typeof current.searched === 'function' ? current.searched() : []
      return Array.isArray(list) ? list.length : null
    }

    const samples = []
    const typeValue = async (value) => {
      clearLongTasks()
      const start = performance.now()
      input.focus()
      input.value = value
      input.dispatchEvent(
        new InputEvent('input', {
          bubbles: true,
          composed: true,
          data: value,
          inputType: 'insertText',
        }),
      )

      await new Promise((resolve) => setTimeout(resolve, 260))
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))

      const tasks = readLongTasks()
      samples.push({
        value,
        duration: performance.now() - start,
        resultCount: getResultCount(),
        longTaskCount: tasks.length,
        maxLongTask: tasks.reduce((max, task) => Math.max(max, task.duration), 0),
        blocking: tasks.reduce((sum, task) => sum + Math.max(0, task.duration - 50), 0),
      })
    }

    await typeValue('a')
    await typeValue('ab')
    await typeValue('')

    return {samples}
  })()
`)

console.log(
  JSON.stringify(
    {
      timestamp: new Date().toISOString(),
      url,
      startup,
      search,
    },
    null,
    2,
  ),
)

await browser.close()
