import {render} from 'lit'
import {describe, expect, it} from 'vitest'

import {renderModeCard, type RemotePageRenderContext} from '../../src/routes/remote/remote-page.render'
import {renderConfirmStep} from '../../src/routes/remote-storage/wizard/steps/confirm'
import {renderResultStep} from '../../src/routes/remote-storage/wizard/steps/result'

const noop = () => {}

describe('critical bidi display boundaries', () => {
  it('keeps remote peer labels isolated while transport identifiers stay LTR', () => {
    const container = document.createElement('div')
    const context = {
      currentMode: () => ({remote: {host: {type: 'tauri_remote_wss', peer_id: 'peer-1'}}}),
      modeSwitching: () => false,
      connectionPhase: () => null,
      transportType: () => 'wss',
      getConnectedPeerName: () => 'حاسوب peer-1',
      modeError: () => null,
      isRemoteMode: () => true,
      getModeBadgeClass: () => 'remote',
      getModeLabel: () => 'Remote',
      onSwitchToLocal: noop,
    } as unknown as RemotePageRenderContext

    render(renderModeCard(context), container)

    expect(container.querySelector('.mode-info-value bdi[dir="auto"]')?.textContent).toBe('حاسوب peer-1')
    expect(container.querySelector('.mode-info-row .badge[dir="ltr"]')?.textContent).toBe('WSS')
  })

  it('keeps exported paths raw and explicitly LTR in confirmation and result views', () => {
    const path = '/Users/alice/نسخة احتياطية'
    const container = document.createElement('div')

    render(
      renderConfirmStep({targetDir: path, onSelectFolder: noop, onBack: noop, onContinue: noop}),
      container,
    )
    expect(container.querySelector('.path-display[dir="ltr"]')?.textContent).toContain(path)

    render(
      renderResultStep({
        result: {success: true, backupDir: path},
        onCopyPath: noop,
        onClose: noop,
        onRetry: noop,
      }),
      container,
    )
    expect(container.querySelector('.path-display[dir="ltr"]')?.textContent).toContain(path)
  })
})
