import {expect, test} from 'vitest'

import type * as RuntimeCapabilitiesModule from '../../src/core/runtime/runtime-capabilities'
import type {WelcomeSetupModel} from '../../src/routes/welcome/welcome-setup.model'

type UsbCommand = {command: string; args?: Record<string, unknown>}

for (const {theme, width, height} of [
  {theme: 'dark', width: 1280, height: 800},
  {theme: 'light', width: 1024, height: 768},
]) {
  test(`silent USB phone: retry, forget, and pair again (${theme})`, async () => {
    const page = globalThis.__E2E_PAGE__
    if (!page) throw new Error('E2E page is unavailable')

    await page.setViewportSize({width, height})
    await page.emulateMedia({reducedMotion: 'reduce'})
    await page.goto('http://localhost:4400/index.html?preview=welcome&layout=desktop')
    const layout = page.locator('welcome-page-desktop-layout')
    await layout.waitFor()

    // Chromium 149 can collect evaluate results during a final Lit/Reatom mutation flush.
    // This native fixture must mount its USB state programmatically, then yield a frame.
    await layout.evaluate(async (existing, selectedTheme) => {
      const dynamicImport = new Function('path', 'return import(path)') as (path: string) => Promise<unknown>
      const {setRuntimeCapabilities} = (await dynamicImport(
        '/core/runtime/runtime-capabilities.ts',
      )) as typeof RuntimeCapabilitiesModule
      const host = {
        host_id: 'silent-phone',
        label: 'Pixel 9 Pro',
        platform: 'android',
        bridge_kind: 'android_aoa',
        pairing_state: 'paired',
        last_seen: null,
      }
      const scan = {
        platform: 'android',
        bridge_kind: 'android_aoa',
        usb_hint: {manufacturer: 'Google', model: host.label, serial_number: 'silent-phone-usb'},
        label: host.label,
      }
      let removed = false
      let failed = false
      const commands: UsbCommand[] = []
      const status = () => ({
        transport_family: 'usb_mobile',
        available_transports: ['usb_mobile'],
        selected_transport: null,
        session_state: failed ? 'error' : 'idle_usb_mobile',
        fallback_allowed: false,
        active_host: null,
        paired_hosts: removed ? [] : [host],
        pairing_approval: null,
        in_flight: null,
        error_code: failed ? 'ERR_USB_MOBILE_PHONE_NOT_RESPONDING' : null,
      })
      Object.assign(window, {
        __USB_RECOVERY_COMMANDS__: commands,
        __TAURI_INTERNALS__: {
          async invoke(command: string, args?: Record<string, unknown>): Promise<unknown> {
            commands.push({command, args})
            if (command === 'mobile_usb_status') return status()
            if (command === 'mobile_usb_list_paired') return removed ? [] : [host]
            if (command === 'mobile_usb_detect') {
              return [
                {
                  scan,
                  accessory_mode: true,
                  paired_match: removed
                    ? null
                    : {host_id: host.host_id, label: host.label, pairing_state: 'confirmed'},
                },
              ]
            }
            if (command === 'mobile_usb_scan') {
              return [{scan, classification: removed ? 'unpaired' : {paired: {host_id: host.host_id}}}]
            }
            if (command === 'mobile_usb_connect') {
              failed = true
              throw new Error('ERR_USB_MOBILE_PHONE_NOT_RESPONDING')
            }
            if (command === 'mobile_usb_remove_paired') {
              removed = true
              failed = false
              return []
            }
            if (command === 'mobile_usb_pair') {
              return {
                ...status(),
                session_state: 'pairing_approval_required',
                pairing_approval: {
                  attempt_id: 'new-pairing',
                  peer_label: host.label,
                  peer_fingerprint: '12345678',
                  attempts_left: 5,
                  locked_until_ms: null,
                  expires_at_ms: Date.now() + 300_000,
                },
              }
            }
            if (command === 'network_list_paired_peers') return []
            if (command === 'mode_get' || command === 'mode_status') {
              return {
                mode: 'local',
                connection_state: 'disconnected',
                transport_type: null,
                remote_core_features: [],
              }
            }
            if (command === 'plugin:event|listen') return 1
            return null
          },
        },
      })
      setRuntimeCapabilities({
        platform: 'macos',
        desktop: true,
        mobile: false,
        supports_network_remote: true,
        supports_mobile_usb_remote: true,
      })
      document.documentElement.setAttribute('data-theme', selectedTheme)
      document.documentElement.setAttribute('theme', selectedTheme)
      type WelcomeLayout = HTMLElement & {model: {setup: WelcomeSetupModel}; updateComplete: Promise<unknown>}
      const replacement = document.createElement('welcome-page-desktop-layout') as WelcomeLayout
      existing.replaceWith(replacement)
      await replacement.updateComplete
      const {setup} = replacement.model
      setup.setupStep.set('remote-connect')
      setup.remote.openUsbMobile()
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    }, theme)

    // The startup splash must release input before using the rendered native controls.
    await page.waitForFunction(() => !document.documentElement.hasAttribute('loading'), undefined, {
      timeout: 10_000,
    })
    const task = page.locator('remote-desktop-preauth .task-panel')
    await task.locator('[data-usb-connect-host-id="silent-phone"]').click()
    await task.getByRole('heading', {name: 'The phone did not answer', exact: true}).waitFor()
    expect(await task.textContent()).toContain('Open ChromVoid on your phone and try again.')
    expect(await task.textContent()).toContain('reinstalled or replaced')

    const commands = () =>
      page.evaluate(
        () => (window as unknown as {__USB_RECOVERY_COMMANDS__: UsbCommand[]}).__USB_RECOVERY_COMMANDS__,
      )
    expect((await commands()).filter(({command}) => command === 'mobile_usb_remove_paired')).toHaveLength(0)
    await task.locator('cv-button[data-usb-primary-action]').click()
    await expect
      .poll(async () => (await commands()).filter(({command}) => command === 'mobile_usb_connect').length)
      .toBe(2)
    await task.getByRole('heading', {name: 'The phone did not answer', exact: true}).waitFor()
    expect(await task.locator('[data-usb-primary-action]').textContent()).toContain('Try again')
    expect(await task.locator('[data-usb-remove-host-id="silent-phone"]').textContent()).toContain(
      'Forget phone',
    )
    await page.screenshot({path: `/tmp/chromvoid-usb-silent-phone-${theme}.png`})
    expect(await task.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)

    await task.locator('[data-usb-remove-host-id="silent-phone"]').click()
    const confirmation = page.locator('cv-confirm-dialog')
    await confirmation.getByRole('button', {name: 'Forget phone', exact: true}).click()
    await expect
      .poll(async () => (await commands()).filter(({command}) => command === 'mobile_usb_remove_paired'))
      .toEqual([{command: 'mobile_usb_remove_paired', args: {hostId: 'silent-phone'}}])
    await task.locator('[data-usb-primary-action]').filter({hasText: 'Scan again'}).click()
    await task.locator('[data-usb-pair-index="0"]').click()
    await page.locator('#remote-preauth-usb-pin').waitFor()
    expect((await commands()).filter(({command}) => command === 'mobile_usb_pair')).toHaveLength(1)
  })
}
