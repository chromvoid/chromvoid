import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {chromium, webkit} from 'playwright'

const bundled = await Bun.build({
  entrypoints: [new URL('../src/index.ts', import.meta.url).pathname],
  target: 'browser',
})
assert.ok(bundled.success, 'The brand mark controller must compile')
const source = await bundled.outputs[0].text()
const svg = await readFile(
  new URL('../../../apps/webview/src/assets/chromvoid-icon.svg', import.meta.url),
  'utf8',
)

for (const [name, browserType] of Object.entries({chromium, webkit})) {
  const browser = await browserType.launch()
  try {
    const page = await browser.newPage({reducedMotion: 'no-preference'})
    await page.setContent(svg)
    const results = await page.evaluate(async (source) => {
      const url = URL.createObjectURL(new Blob([source], {type: 'text/javascript'}))
      const {createBrandMarkController} = await import(url)
      URL.revokeObjectURL(url)
      const svg = document.querySelector('svg')
      const length = svg.querySelector('#spiralTrace').getTotalLength()
      const results = []
      for (const lag of [0, 21]) {
        const controller = createBrandMarkController(svg)
        const originalAnimate = Element.prototype.animate
        let arrival
        let cancellation
        Element.prototype.animate = function (keyframes, options) {
          const animation = originalAnimate.call(this, keyframes, options)
          if (this.classList.contains('brandMarkSignal') && options.duration === 220) {
            arrival = animation
            const originalCancel = animation.cancel.bind(animation)
            animation.cancel = () => {
              cancellation = {
                currentTime: animation.currentTime,
                dashoffset: Number.parseFloat(getComputedStyle(this).strokeDashoffset),
              }
              originalCancel()
            }
          }
          return animation
        }
        try {
          controller.startDerivation()
          await new Promise((resolve) => setTimeout(resolve, 500))
          const startedAt = performance.now()
          const completion = controller.finishDerivation()
          // Reproduce a WAAPI clock behind the deadline, independently of frame scheduling.
          arrival.startTime += lag
          await completion
          results.push({
            lag,
            elapsed: performance.now() - startedAt,
            length,
            cancellation,
            heldEffects: svg.getAnimations({subtree: true}).length,
          })
        } finally {
          controller.destroy()
          Element.prototype.animate = originalAnimate
        }
      }
      return results
    }, source)
    for (const result of results) {
      assert.ok(
        Math.abs(result.cancellation.currentTime - 220) < 0.001,
        `${name}: arrival must finish before cancellation`,
      )
      assert.ok(
        Math.abs(result.cancellation.dashoffset + result.length) < 0.01,
        `${name}: signal must reach the core`,
      )
      assert.equal(result.heldEffects, 0, `${name}: completion must release every effect`)
      console.info(
        `${name}: lag=${result.lag}ms, resolved=${result.elapsed.toFixed(1)}ms, cancelledAt=${result.cancellation.currentTime}ms, dashoffset=${result.cancellation.dashoffset.toFixed(3)}`,
      )
    }
  } finally {
    await browser.close()
  }
}
