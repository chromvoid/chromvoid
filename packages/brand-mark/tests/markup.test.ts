// @vitest-environment node
import {JSDOM} from 'jsdom'
import {describe, expect, it} from 'vitest'
import svgSource from '../../../apps/webview/src/assets/chromvoid-icon.svg?raw'
import {createBrandMarkMarkup} from '../src/markup'

describe('inline brand mark markup', () => {
  it('renders deterministic markup without browser globals', () => {
    expect(typeof document).toBe('undefined')
    const markup = createBrandMarkMarkup(svgSource, 'site-header')
    expect(markup).toBe(createBrandMarkMarkup(svgSource, 'site-header'))
    expect(markup).toContain('data-brand-mark-prefix="site-header"')
    expect(markup).toContain('id="site-header-spiralTrace"')
  })

  it('keeps all IDs and paint references local before either controller mounts', () => {
    const {window} = new JSDOM(
      createBrandMarkMarkup(svgSource, 'site-header') + createBrandMarkMarkup(svgSource, 'site-console'),
    )
    const ids = [...window.document.querySelectorAll('[id]')].map((element) => element.id)
    expect(new Set(ids).size).toBe(ids.length)
    const marks = [...window.document.querySelectorAll('svg')]
    expect(marks).toHaveLength(2)
    for (const svg of marks) {
      const references = [...svg.outerHTML.matchAll(/url\(#([^\s)]+)\)/g)]
      expect(references.length).toBeGreaterThan(5)
      for (const [, id] of references) expect(svg.querySelector(`[id="${id}"]`)).not.toBeNull()
    }
    window.close()
  })

  it('preserves geometry, source colors and scoped static styling', () => {
    const {window} = new JSDOM(svgSource + createBrandMarkMarkup(svgSource, 'site-header'))
    const [source, inline] = [...window.document.querySelectorAll('svg')]
    const geometry = (svg: SVGSVGElement) => [...svg.querySelectorAll('path')].map((path) => ({
      d: path.getAttribute('d'),
      transform: path.getAttribute('transform'),
    }))
    expect(geometry(inline!)).toEqual(geometry(source!))
    expect(inline!.getAttribute('viewBox')).toBe(source!.getAttribute('viewBox'))
    expect(inline!.querySelector('style')!.textContent).toContain('#site-header-coreAura {')
    expect(inline!.querySelector('style')!.textContent).toContain('[data-brand-mark-prefix="site-header"] {')
    expect(inline!.querySelector('style')!.textContent).not.toContain(':root')
    expect([...inline!.querySelectorAll('stop')].map((stop) => stop.getAttribute('stop-color'))).toEqual(
      [...source!.querySelectorAll('stop')].map((stop) => stop.getAttribute('stop-color')),
    )
    window.close()
  })

  it('rewrites quoted references and selector states without treating colors as IDs', () => {
    const source = `<svg><defs><linearGradient id='fff'/></defs><style>
      #fff:hover, :root #fff.active { fill: #fff; stroke: url('#fff'); }
      @media (width > 400px) { #fff:focus { fill: url( "#fff" ); } }
    </style><use href='#fff' xlink:href="#fff" fill="url(#fff)"/></svg>`
    const markup = createBrandMarkMarkup(source, 'header')
    expect(markup).toContain("id='header-fff'")
    expect(markup).toContain('#header-fff:hover, [data-brand-mark-prefix="header"] #header-fff.active')
    expect(markup).toContain('fill: #fff;')
    expect(markup).toContain('#header-fff:focus')
    expect(markup).toContain("url('#header-fff')")
    expect(markup).toContain('url("#header-fff")')
    expect(markup).toContain("href='#header-fff' xlink:href=\"#header-fff\"")
    expect(markup).toContain('fill="url(#header-fff)"')
  })

  it.each(['', '2header', 'header:0', 'header mark', 'header" onclick="x'])('rejects unsafe prefix %j', (prefix) => {
    expect(() => createBrandMarkMarkup(svgSource, prefix)).toThrow('CSS-safe identifier')
  })
})
