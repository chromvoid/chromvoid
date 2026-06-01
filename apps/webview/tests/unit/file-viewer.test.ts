import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {FileViewer} from '../../src/features/passmanager/components/viewer'

async function settle(element: FileViewer) {
  await Promise.resolve()
  await element.updateComplete
  await Promise.resolve()
}

describe('file-viewer', () => {
  beforeEach(() => {
    FileViewer.define()
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  })

  afterEach(() => {
    document.body.innerHTML = ''
    vi.restoreAllMocks()
  })

  it('renders text files without resolving file.text() inside render()', async () => {
    const textFile = new File(['hello from viewer'], 'notes.txt', {type: 'text/plain'})
    const textSpy = vi.fn(async () => 'hello from viewer')
    Object.defineProperty(textFile, 'text', {
      configurable: true,
      value: textSpy,
    })

    const element = document.createElement('file-viewer') as FileViewer
    element.file = textFile
    document.body.appendChild(element)
    await settle(element)

    const textArea = element.shadowRoot?.querySelector('cv-textarea') as {value?: string} | null
    expect(textSpy).toHaveBeenCalledTimes(1)
    expect(textArea?.value).toBe('hello from viewer')

    element.requestUpdate()
    await settle(element)

    expect(textSpy).toHaveBeenCalledTimes(1)
  })

  it('reuses the image preview URL across rerenders and revokes it on replacement/disconnect', async () => {
    const createSpy = vi
      .spyOn(URL, 'createObjectURL')
      .mockReturnValueOnce('blob:first-image')
      .mockReturnValueOnce('blob:second-image')

    const element = document.createElement('file-viewer') as FileViewer
    element.file = new File(['first'], 'first.png', {type: 'image/png'})
    document.body.appendChild(element)
    await settle(element)

    expect(createSpy).toHaveBeenCalledTimes(1)
    expect(element.shadowRoot?.querySelector('img')?.getAttribute('src')).toBe('blob:first-image')

    element.requestUpdate()
    await settle(element)
    expect(createSpy).toHaveBeenCalledTimes(1)

    element.file = new File(['second'], 'second.png', {type: 'image/png'})
    await settle(element)

    expect(createSpy).toHaveBeenCalledTimes(2)
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:first-image')
    expect(element.shadowRoot?.querySelector('img')?.getAttribute('src')).toBe('blob:second-image')

    element.remove()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:second-image')
  })
})
