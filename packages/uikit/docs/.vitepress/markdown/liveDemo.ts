import type MarkdownIt from 'markdown-it'

const CV_TAG_RE = /<cv-[\w-]+/

export function liveDemoPlugin(md: MarkdownIt): void {
  const defaultFence =
    md.renderer.rules.fence ||
    ((tokens, idx, options, _env, self) =>
      self.renderToken(tokens, idx, options))

  md.renderer.rules.fence = (tokens, idx, options, env, self) => {
    const token = tokens[idx]
    const lang = token.info.trim().split(/\s+/)[0]
    const raw = token.content

    if (lang !== 'html' || !CV_TAG_RE.test(raw)) {
      return defaultFence(tokens, idx, options, env, self)
    }

    const highlighted = defaultFence(tokens, idx, options, env, self)

    const codeB64 = Buffer.from(raw).toString('base64')
    const highlightedB64 = Buffer.from(highlighted).toString('base64')

    return `<LiveDemo code="${codeB64}" highlighted="${highlightedB64}" />\n`
  }
}
