import {afterEach, describe, expect, it} from 'vitest'

import {remoteStorageModel} from '../../src/routes/remote-storage/remote-storage.model'

describe('RemoteStorageModel mobile toolbar state', () => {
  afterEach(() => {
    remoteStorageModel.cancelWizard()
    remoteStorageModel.transferStep.set('idle')
  })

  it('maps wizard steps to toolbar context and disables back on progress', async () => {
    expect(remoteStorageModel.getMobileToolbarContext()).toEqual({
      title: 'Storage',
      canGoBack: false,
      backDisabled: false,
      showCommand: true,
    })

    remoteStorageModel.transferStep.set('confirm')
    expect(remoteStorageModel.getMobileToolbarContext()).toEqual({
      title: 'Confirm Export',
      canGoBack: true,
      backDisabled: false,
      showCommand: false,
    })

    remoteStorageModel.transferStep.set('password')
    expect(remoteStorageModel.getMobileToolbarContext()).toEqual({
      title: 'Authorization',
      canGoBack: true,
      backDisabled: false,
      showCommand: false,
    })

    remoteStorageModel.transferStep.set('progress')
    expect(remoteStorageModel.getMobileToolbarContext()).toEqual({
      title: 'Export in Progress',
      canGoBack: true,
      backDisabled: true,
      showCommand: false,
    })

    remoteStorageModel.transferStep.set('result')
    expect(remoteStorageModel.getMobileToolbarContext().title).toBe('Export Result')
  })

  it('handles stepwise toolbar back flow and keeps progress guarded', async () => {
    remoteStorageModel.transferStep.set('idle')
    expect(remoteStorageModel.handleMobileToolbarBack()).toBe(false)

    remoteStorageModel.transferStep.set('confirm')
    expect(remoteStorageModel.handleMobileToolbarBack()).toBe(true)
    expect(remoteStorageModel.transferStep()).toBe('idle')

    remoteStorageModel.transferStep.set('password')
    expect(remoteStorageModel.handleMobileToolbarBack()).toBe(true)
    expect(remoteStorageModel.transferStep()).toBe('confirm')

    remoteStorageModel.transferStep.set('result')
    expect(remoteStorageModel.handleMobileToolbarBack()).toBe(true)
    expect(remoteStorageModel.transferStep()).toBe('password')

    remoteStorageModel.transferStep.set('progress')
    expect(remoteStorageModel.handleMobileToolbarBack()).toBe(true)
    expect(remoteStorageModel.transferStep()).toBe('progress')
  })
})
