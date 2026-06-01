import {afterEach, describe, expect, it, vi} from 'vitest'

import {PMEntrySshGenerator} from '../../src/features/passmanager/components/card/entry-ssh/entry-ssh-generator'

let defined = false

function ensureDefined() {
  if (defined) return
  PMEntrySshGenerator.define()
  defined = true
}

async function settle(component: PMEntrySshGenerator) {
  await component.updateComplete
  await Promise.resolve()
  await component.updateComplete
}

describe('PMEntrySshGenerator', () => {
  afterEach(() => {
    document.body.innerHTML = ''
    vi.restoreAllMocks()
  })

  it('emits explicit key type and comment events without mutating its own controlled values', async () => {
    ensureDefined()
    const component = document.createElement(PMEntrySshGenerator.elementName) as PMEntrySshGenerator
    component.keyType = 'ed25519'
    component.comment = ''
    document.body.append(component)
    await settle(component)

    const keyTypeSpy = vi.fn()
    const commentSpy = vi.fn()
    component.addEventListener('pm-entry-ssh-key-type-change', keyTypeSpy as EventListener)
    component.addEventListener('pm-entry-ssh-comment-input', commentSpy as EventListener)

    const rsaOption = component.shadowRoot?.querySelector<HTMLInputElement>('input[value="rsa"]')
    expect(rsaOption).not.toBeNull()
    rsaOption!.checked = true
    rsaOption!.dispatchEvent(new Event('change', {bubbles: true}))

    const commentInput = component.shadowRoot?.querySelector('cv-input')
    expect(commentInput).not.toBeNull()
    commentInput!.dispatchEvent(
      new CustomEvent('cv-input', {
        detail: {value: 'root@example'},
        bubbles: true,
        composed: true,
      }),
    )

    expect(component.keyType).toBe('ed25519')
    expect(component.comment).toBe('')
    expect(keyTypeSpy).toHaveBeenCalledTimes(1)
    expect(commentSpy).toHaveBeenCalledTimes(1)

    const keyTypeEvent = keyTypeSpy.mock.calls[0]?.[0] as CustomEvent<{keyType: string}>
    const commentEvent = commentSpy.mock.calls[0]?.[0] as CustomEvent<{value: string}>

    expect(keyTypeEvent.detail.keyType).toBe('rsa')
    expect(commentEvent.detail.value).toBe('root@example')
  })

  it('emits generate events from the action button', async () => {
    ensureDefined()
    const component = document.createElement(PMEntrySshGenerator.elementName) as PMEntrySshGenerator
    document.body.append(component)
    await settle(component)

    const generateSpy = vi.fn()
    component.addEventListener('pm-entry-ssh-generate', generateSpy as EventListener)

    const buttons = Array.from(component.shadowRoot?.querySelectorAll('cv-button') ?? [])
    const generateButton = buttons.at(-1) as HTMLElement | undefined
    expect(generateButton).toBeTruthy()
    generateButton?.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}))

    expect(generateSpy).toHaveBeenCalledTimes(1)
  })
})
