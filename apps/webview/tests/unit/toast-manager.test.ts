import {afterEach, describe, expect, it} from 'vitest'

import {CVDialog} from '@chromvoid/uikit/components/cv-dialog'
import {CVImageViewer} from '@chromvoid/uikit/components/cv-image-viewer'
import type {CVToast} from '@chromvoid/uikit/components/cv-toast'
import type {CVToastRegion} from '@chromvoid/uikit/components/cv-toast-region'
import {toast, ToastContainer} from '../../src/shared/services/toast-manager'

afterEach(() => {
  toast.clear()
  document.body.innerHTML = ''
})

describe('ToastContainer', () => {
  it('portals global feedback through an open dialog and restores it after close', async () => {
    CVDialog.define()
    const dialog = document.createElement('cv-dialog') as CVDialog
    document.body.append(dialog)
    await dialog.updateComplete

    dialog.open = true
    await dialog.updateComplete
    toast.success('Saved to gallery')

    const accessoryHost = dialog.shadowRoot?.querySelector('.top-layer-accessory-host')
    const container = accessoryHost?.querySelector('toast-container')
    expect(container).toBeInstanceOf(ToastContainer)

    toast.clear()
    dialog.open = false
    await dialog.updateComplete
    await Promise.resolve()

    expect(document.body.querySelector('toast-container')).toBe(container)
  })

  it('presents every global toast region in the native top layer when supported', async () => {
    ToastContainer.define()
    const container = document.createElement('toast-container') as ToastContainer
    document.body.append(container)
    await container.updateComplete

    const regions = Array.from(container.shadowRoot?.querySelectorAll<CVToastRegion>('cv-toast-region') ?? [])

    expect(regions).toHaveLength(6)
    expect(regions.every((region) => region.topLayer)).toBe(true)
  })

  it('keeps an image preview open when its portalled toast is dismissed', async () => {
    CVImageViewer.define()
    const viewer = document.createElement('cv-image-viewer') as CVImageViewer
    viewer.items = [{id: 'image-1', title: 'image.jpg', src: 'data:image/gif;base64,R0lGODlhAQABAAAAACw='}]
    viewer.open = true
    viewer.layout = 'mobile'
    const closeEvents: Event[] = []
    viewer.addEventListener('cv-close', (event) => closeEvents.push(event))
    document.body.append(viewer)
    await viewer.updateComplete
    await Promise.resolve()

    const dialog = viewer.shadowRoot?.querySelector<CVDialog>('cv-dialog')
    await dialog?.updateComplete
    toast.success('Saved to gallery')
    await Promise.resolve()

    const container = dialog?.shadowRoot
      ?.querySelector('.top-layer-accessory-host')
      ?.querySelector<ToastContainer>('toast-container')
    await container?.updateComplete

    const regions = Array.from(
      container?.shadowRoot?.querySelectorAll<CVToastRegion>('cv-toast-region') ?? [],
    )
    const region = regions.find((candidate) => candidate.shadowRoot?.querySelector('cv-toast'))
    const toastElement = region?.shadowRoot?.querySelector<CVToast>('cv-toast')
    await toastElement?.updateComplete
    const dismissButton = toastElement?.shadowRoot?.querySelector<HTMLButtonElement>('[part="dismiss"]')
    dismissButton?.click()
    await region?.updateComplete
    await Promise.resolve()

    expect(dismissButton).not.toBeNull()
    expect(closeEvents).toHaveLength(0)
    expect(viewer.open).toBe(true)
    expect(region?.shadowRoot?.querySelector('cv-toast')).toBeNull()
  })
})
