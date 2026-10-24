/**
 * Prepare the trusted source SVG for inline rendering, including SSR without a DOM.
 * Every mark on a page needs its own deterministic, CSS-safe prefix.
 */
export function createBrandMarkMarkup(source: string, prefix: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_-]*$/.test(prefix)) {
    throw new Error('ChromVoid brand mark prefix must be a CSS-safe identifier')
  }

  const ids = new Map(
    [...source.matchAll(/\sid\s*=\s*(["'])([^"']+)\1/g)].map((match) => [match[2]!, `${prefix}-${match[2]}`]),
  )
  const root = `[data-brand-mark-prefix="${prefix}"]`
  return source
    .replace(/<svg(?=\s|>)/, `<svg data-brand-mark-prefix="${prefix}"`)
    .replace(/(\s)id\s*=\s*(["'])([^"']+)\2/g, (_, space: string, quote: string, id: string) =>
      `${space}id=${quote}${ids.get(id)}${quote}`,
    )
    .replace(/url\(\s*(["']?)#([^\s)"']+)\1\s*\)/g, (reference, quote: string, id: string) =>
      ids.has(id) ? `url(${quote}#${ids.get(id)}${quote})` : reference,
    )
    .replace(/(\s(?:xlink:)?href\s*=\s*)(["'])#([^"']+)\2/g, (reference, attribute: string, quote: string, id: string) =>
      ids.has(id) ? `${attribute}${quote}#${ids.get(id)}${quote}` : reference,
    )
    .replace(/(<style\b[^>]*>)([\s\S]*?)(<\/style>)/g, (_, open: string, css: string, close: string) =>
      open + css.replace(/[^{}]+(?=\{)/g, (selector) =>
        selector
          .replace(/:root\b/g, root)
          .replace(/#([A-Za-z0-9_-]+)/g, (reference, id: string) =>
            ids.has(id) ? `#${ids.get(id)}` : reference,
          ),
      ) + close,
    )
}
