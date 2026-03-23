import {afterEach, describe, expect, it} from 'vitest'

import '../../src/routes/remote-storage.route'

type ToolbarContext = {
  title: string
  canGoBack: boolean
  backDisabled: boolean
  showCommand: boolean
}

function createStoragePage(): HTMLElement & {
  getMobileToolbarContext: () => ToolbarContext
  handleMobileToolbarBack: () => boolean
  updateComplete: Promise<void>
  transferStep: {(): string; set: (next: string) => void}
} {
  const page = document.createElement('remote-storage-page') as any
  document.body.appendChild(page)
  return page
}

describe('RemoteStoragePage mobile toolbar provider', () => {
  afterEach(() => {
    document.querySelectorAll('remote-storage-page').forEach((el) => el.remove())
  })

  it('maps wizard steps to toolbar context and disables back on progress', async () => {
    const page = createStoragePage()
    await page.updateComplete

    expect(page.getMobileToolbarContext()).toEqual({
      title: 'Storage',
      canGoBack: false,
      backDisabled: false,
      showCommand: true,
    })

    page.transferStep.set('select-type')
    expect(page.getMobileToolbarContext()).toEqual({
      title: 'Export',
      canGoBack: true,
      backDisabled: false,
      showCommand: false,
    })

    page.transferStep.set('confirm')
    expect(page.getMobileToolbarContext().title).toBe('Confirm Export')

    page.transferStep.set('password')
    expect(page.getMobileToolbarContext().title).toBe('Authorization')

    page.transferStep.set('progress')
    expect(page.getMobileToolbarContext()).toEqual({
      title: 'Export in Progress',
      canGoBack: true,
      backDisabled: true,
      showCommand: false,
    })

    page.transferStep.set('result')
    expect(page.getMobileToolbarContext().title).toBe('Export Result')
  })

  it('handles stepwise toolbar back flow and keeps progress guarded', async () => {
    const page = createStoragePage()
    await page.updateComplete

    page.transferStep.set('idle')
    expect(page.handleMobileToolbarBack()).toBe(false)

    page.transferStep.set('select-type')
    expect(page.handleMobileToolbarBack()).toBe(true)
    expect(page.transferStep()).toBe('idle')

    page.transferStep.set('confirm')
    expect(page.handleMobileToolbarBack()).toBe(true)
    expect(page.transferStep()).toBe('select-type')

    page.transferStep.set('password')
    expect(page.handleMobileToolbarBack()).toBe(true)
    expect(page.transferStep()).toBe('confirm')

    page.transferStep.set('result')
    expect(page.handleMobileToolbarBack()).toBe(true)
    expect(page.transferStep()).toBe('password')

    page.transferStep.set('progress')
    expect(page.handleMobileToolbarBack()).toBe(true)
    expect(page.transferStep()).toBe('progress')
  })
})
