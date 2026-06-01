import type {Plugin} from 'prettier'
import * as prettier from 'prettier/standalone'
import * as markdownPlugin from 'prettier/plugins/markdown'

export async function formatMarkdownSource(source: string): Promise<string> {
  return prettier.format(source, {
    parser: 'markdown',
    plugins: [markdownPlugin as Plugin],
    proseWrap: 'preserve',
  })
}
