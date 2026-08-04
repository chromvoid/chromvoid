import {captureSnapshot, writeJson} from '../helpers/artifacts.mjs'
import {hideAndroidKeyboard} from '../helpers/keyboard.mjs'

export const MASTER_PASSWORD = 'android-ui-first-run-storage-password'

function readWelcomeState() {
  const app = document.querySelector('chromvoid-app')
  const welcomePage = app?.shadowRoot?.querySelector('welcome-page')
  const layout =
    welcomePage?.shadowRoot?.querySelector('welcome-page-mobile-layout')
    || welcomePage?.shadowRoot?.querySelector('welcome-page-desktop-layout')
  const setupSection = layout?.shadowRoot?.querySelector('welcome-setup-section')
  const setupRoot = setupSection?.shadowRoot
  const setupModel = setupSection?.model
  const welcomeExists = Boolean(welcomePage)

  return {
    route: welcomeExists ? 'welcome' : null,
    loading: document.body?.hasAttribute('loading') ?? false,
    welcomeExists,
    layoutExists: Boolean(layout),
    setupSectionExists: Boolean(setupSection),
    currentUrl: location.href,
    needUserInitialization: setupModel?.isNeedInit?.() ?? null,
    setupStep: setupModel?.effectiveStep?.() ?? null,
    setupInProgress: setupModel?.setupInProgress?.() ?? null,
    busy: setupModel?.busy?.() ?? null,
    errorText: setupModel?.shared?.errorText?.() ?? '',
    creationState: setupModel?.creationState?.() ?? null,
    createStorageEntryExists: Boolean(setupRoot?.querySelector('[data-create-storage]')),
    createFormExists: Boolean(setupRoot?.querySelector('.master-password-form')),
    createSheetOpen: setupRoot?.querySelector('cv-bottom-sheet.create-storage-sheet')?.hasAttribute('open') ?? false,
    createButtonExists: Boolean(
      setupRoot?.querySelector('.master-password-form button[type="submit"]'),
    ),
  }
}

function readCreateStorageKeyboardGeometry() {
  const app = document.querySelector('chromvoid-app')
  const welcomePage = app?.shadowRoot?.querySelector('welcome-page')
  const layout = welcomePage?.shadowRoot?.querySelector('welcome-page-mobile-layout')
  const setupSection = layout?.shadowRoot?.querySelector('welcome-setup-section')
  const setupRoot = setupSection?.shadowRoot
  const sheet = setupRoot?.querySelector('cv-bottom-sheet.create-storage-sheet')
  const dialog = sheet?.shadowRoot?.querySelector('cv-dialog')
  const content = dialog?.shadowRoot?.querySelector('[part="content"]')
  const body = dialog?.shadowRoot?.querySelector('[part="body"]')
  const firstInputHost = setupRoot?.querySelector('#welcome-create-master-password')
  const firstInput = firstInputHost?.shadowRoot?.querySelector('input')
  const submit = setupRoot?.querySelector('.master-password-form button[type="submit"]')
  const nativePayload = window.__chromvoidAndroidKeyboardInsets ?? null

  if (!content || !body || !firstInputHost || !firstInput || !submit) {
    throw new Error('Create Storage keyboard geometry is unavailable')
  }

  const contentRect = content.getBoundingClientRect()
  const bodyRect = body.getBoundingClientRect()
  const submitRect = submit.getBoundingClientRect()
  const visualViewport = window.visualViewport
  const visibleTop = visualViewport?.offsetTop ?? 0
  const visibleBottom = visibleTop + (visualViewport?.height ?? window.innerHeight)
  const rootStyles = getComputedStyle(document.documentElement)
  const safeTop = Number.parseFloat(
    rootStyles.getPropertyValue('--app-runtime-safe-area-block-start'),
  )
  const overlayOffset = Number.parseFloat(
    rootStyles.getPropertyValue('--app-runtime-keyboard-overlay-offset'),
  )
  const nativeKeyboardInset = Number.parseFloat(
    rootStyles.getPropertyValue('--app-runtime-keyboard-native-inset-block-end'),
  )

  return {
    bodyBottom: bodyRect.bottom,
    bodyClientHeight: body.clientHeight,
    bodyLeft: bodyRect.left,
    bodyOverflowY: getComputedStyle(body).overflowY,
    bodyRight: bodyRect.right,
    bodyScrollHeight: body.scrollHeight,
    bodyScrollTop: body.scrollTop,
    bodyTop: bodyRect.top,
    contentBottom: contentRect.bottom,
    contentTop: contentRect.top,
    firstInputFocused:
      setupRoot?.activeElement === firstInputHost && firstInputHost.shadowRoot?.activeElement === firstInput,
    innerHeight: window.innerHeight,
    nativeKeyboardInset: Number.isFinite(nativeKeyboardInset) ? nativeKeyboardInset : 0,
    nativePayload,
    nativeResize: document.documentElement.hasAttribute('data-mobile-keyboard-native-resize'),
    overlayOffset: Number.isFinite(overlayOffset) ? overlayOffset : 0,
    safeTop: Number.isFinite(safeTop) ? safeTop : 0,
    submitBottom: submitRect.bottom,
    submitTop: submitRect.top,
    visualViewportHeight: visualViewport?.height ?? null,
    visibleBottom,
    visibleTop,
  }
}

function setCreateStorageSmokeMaxHeight(maxHeight) {
  const app = document.querySelector('chromvoid-app')
  const welcomePage = app?.shadowRoot?.querySelector('welcome-page')
  const layout = welcomePage?.shadowRoot?.querySelector('welcome-page-mobile-layout')
  const setupSection = layout?.shadowRoot?.querySelector('welcome-setup-section')
  const sheet = setupSection?.shadowRoot?.querySelector('cv-bottom-sheet.create-storage-sheet')
  if (!sheet) {
    throw new Error('Create Storage sheet is unavailable')
  }

  if (maxHeight) {
    sheet.style.setProperty('--cv-bottom-sheet-max-height', maxHeight)
  } else {
    sheet.style.removeProperty('--cv-bottom-sheet-max-height')
  }
}

async function focusCreateStorageMasterPassword(driver) {
  const app = await driver.$('chromvoid-app')
  const welcomePage = await app.shadow$('welcome-page')
  const layout = await welcomePage.shadow$('welcome-page-mobile-layout')
  const setupSection = await layout.shadow$('welcome-setup-section')
  const inputHost = await setupSection.shadow$('#welcome-create-master-password')
  const input = await inputHost.shadow$('input')
  await input.waitForClickable({timeout: 15_000})
  await input.click()
}

function assertCreateStorageKeyboardGeometry(geometry) {
  const payloadViewportMode = geometry.nativePayload?.viewportMode ?? null
  if (payloadViewportMode !== 'overlay' || geometry.nativeResize) {
    throw new Error(`Expected Android overlay keyboard contract: ${JSON.stringify(geometry)}`)
  }
  if (
    geometry.nativeKeyboardInset < 72
    || Math.abs(geometry.overlayOffset - geometry.nativeKeyboardInset) > 2
  ) {
    throw new Error(`Expected a real IME inset with one overlay lift: ${JSON.stringify(geometry)}`)
  }
  if (!geometry.firstInputFocused) {
    throw new Error(`Expected the master-password input to remain focused: ${JSON.stringify(geometry)}`)
  }
  if (geometry.contentTop < geometry.visibleTop + geometry.safeTop - 2) {
    throw new Error(`Create Storage sheet escaped above the visible viewport: ${JSON.stringify(geometry)}`)
  }
  if (geometry.contentBottom > geometry.visibleBottom - geometry.overlayOffset + 2) {
    throw new Error(`Create Storage sheet overlaps the Android IME: ${JSON.stringify(geometry)}`)
  }
  if (!/(auto|scroll|overlay)/.test(geometry.bodyOverflowY)) {
    throw new Error(`Create Storage body is not a scroll container: ${JSON.stringify(geometry)}`)
  }
}

async function swipeCreateStorageBody(driver, geometry) {
  const x = Math.round((geometry.bodyLeft + geometry.bodyRight) / 2)
  const startY = Math.round(Math.min(geometry.bodyBottom, geometry.visibleBottom) - 28)
  const distance = Math.max(120, Math.round(geometry.bodyClientHeight * 0.55))
  const endY = Math.round(Math.max(geometry.bodyTop + 28, startY - distance))

  await driver.performActions([
    {
      type: 'pointer',
      id: 'create-storage-scroll',
      parameters: {pointerType: 'touch'},
      actions: [
        {type: 'pointerMove', duration: 0, x, y: startY, origin: 'viewport'},
        {type: 'pointerDown', button: 0},
        {type: 'pause', duration: 80},
        {type: 'pointerMove', duration: 420, x, y: endY, origin: 'viewport'},
        {type: 'pointerUp', button: 0},
      ],
    },
  ])
  await driver.releaseActions()
}

async function waitForWelcome(driver) {
  await driver.waitUntil(
    async () => {
      return await driver.execute(() => {
        const welcome = Boolean(
          document.querySelector('chromvoid-app')?.shadowRoot?.querySelector('welcome-page'),
        )
        return welcome
      })
    },
    {
      timeout: 60_000,
      timeoutMsg: 'Expected welcome route was not reached',
      interval: 1_000,
    },
  )
}

export async function runVaultFirstRunCreateSmoke({driver, artifactRoot}) {
  await waitForWelcome(driver)

  const state = await driver.execute(readWelcomeState)
  await writeJson(artifactRoot, 'welcome-state.json', state)
  await captureSnapshot(driver, artifactRoot, '04-welcome-route-ready')

  if (state.needUserInitialization !== true) {
    throw new Error(`Expected a fresh first-run vault state: ${JSON.stringify(state)}`)
  }

  await driver.execute(() => {
    const welcomePage = document.querySelector('chromvoid-app')?.shadowRoot?.querySelector('welcome-page')
    const layout =
      welcomePage?.shadowRoot?.querySelector('welcome-page-mobile-layout')
      || welcomePage?.shadowRoot?.querySelector('welcome-page-desktop-layout')
    const setupSection = layout?.shadowRoot?.querySelector('welcome-setup-section')
    const createStorageButton = setupSection?.shadowRoot?.querySelector('[data-create-storage]')
    const nativeButton = createStorageButton?.shadowRoot?.querySelector('button')
    if (!(nativeButton instanceof HTMLButtonElement)) {
      throw new Error('Create Storage entry action is unavailable')
    }
    nativeButton.click()
  })

  await driver.waitUntil(
    async () => {
      const nextState = await driver.execute(readWelcomeState)
      return nextState.setupStep === 'create-master'
        && nextState.createSheetOpen
        && nextState.createFormExists
    },
    {
      timeout: 15_000,
      timeoutMsg: 'Create Storage sheet did not appear after the first-run action',
      interval: 250,
    },
  )

  await focusCreateStorageMasterPassword(driver)
  await driver.waitUntil(
    async () => {
      const geometry = await driver.execute(readCreateStorageKeyboardGeometry)
      return geometry.nativePayload?.viewportMode === 'overlay'
        && !geometry.nativeResize
        && geometry.nativeKeyboardInset >= 72
        && geometry.contentTop >= geometry.visibleTop + geometry.safeTop - 2
        && geometry.contentBottom <= geometry.visibleBottom - geometry.overlayOffset + 2
    },
    {
      timeout: 20_000,
      timeoutMsg: 'Android IME did not establish the overlay viewport contract',
      interval: 250,
    },
  )

  const keyboardOpenGeometry = await driver.execute(readCreateStorageKeyboardGeometry)
  assertCreateStorageKeyboardGeometry(keyboardOpenGeometry)
  await writeJson(artifactRoot, 'first-run-create-keyboard-open.json', keyboardOpenGeometry)
  await captureSnapshot(driver, artifactRoot, '05-first-run-create-keyboard-open')

  await driver.execute(setCreateStorageSmokeMaxHeight, '360px')
  await driver.waitUntil(
    async () => {
      const geometry = await driver.execute(readCreateStorageKeyboardGeometry)
      return geometry.bodyScrollHeight > geometry.bodyClientHeight + 1
    },
    {
      timeout: 10_000,
      timeoutMsg: 'Create Storage compact smoke viewport did not produce body overflow',
      interval: 200,
    },
  )

  const keyboardConstrainedGeometry = await driver.execute(readCreateStorageKeyboardGeometry)
  await swipeCreateStorageBody(driver, keyboardConstrainedGeometry)
  await driver.waitUntil(
    async () => {
      const geometry = await driver.execute(readCreateStorageKeyboardGeometry)
      return geometry.bodyScrollTop > keyboardConstrainedGeometry.bodyScrollTop + 1
    },
    {
      timeout: 10_000,
      timeoutMsg: 'Create Storage body did not move after a touch swipe',
      interval: 200,
    },
  )

  const keyboardScrolledGeometry = await driver.execute(readCreateStorageKeyboardGeometry)
  const visibleBodyBottom = Math.min(
    keyboardScrolledGeometry.bodyBottom,
    keyboardScrolledGeometry.visibleBottom - keyboardScrolledGeometry.overlayOffset,
  )
  if (
    keyboardScrolledGeometry.submitTop < keyboardScrolledGeometry.bodyTop - 2
    || keyboardScrolledGeometry.submitBottom > visibleBodyBottom + 2
  ) {
    throw new Error(
      `Create Storage action is not reachable after a touch swipe: ${JSON.stringify(keyboardScrolledGeometry)}`,
    )
  }
  await writeJson(artifactRoot, 'first-run-create-keyboard-scrolled.json', {
    ...keyboardScrolledGeometry,
    smokeMaxHeight: 360,
  })
  await captureSnapshot(driver, artifactRoot, '06-first-run-create-keyboard-scrolled')
  await driver.execute(setCreateStorageSmokeMaxHeight, null)
  await hideAndroidKeyboard(driver)

  const preparedState = await driver.execute((password) => {
    const welcomePage = document.querySelector('chromvoid-app')?.shadowRoot?.querySelector('welcome-page')
    const layout =
      welcomePage?.shadowRoot?.querySelector('welcome-page-mobile-layout')
      || welcomePage?.shadowRoot?.querySelector('welcome-page-desktop-layout')
    const setupSection = layout?.shadowRoot?.querySelector('welcome-setup-section')
    const setupRoot = setupSection?.shadowRoot
    const inputs = [...(setupRoot?.querySelectorAll('.master-password-form cv-input') ?? [])]

    if (inputs.length !== 2) {
      throw new Error(`Expected two master-password inputs, found ${inputs.length}`)
    }

    for (const inputHost of inputs) {
      const input = inputHost.shadowRoot?.querySelector('input')
      if (!(input instanceof HTMLInputElement)) {
        throw new Error('Master-password native input is unavailable')
      }
      input.focus()
      input.value = password
      input.dispatchEvent(new InputEvent('input', {
        bubbles: true,
        composed: true,
        data: password,
        inputType: 'insertText',
      }))
      input.blur()
    }

    const submitButton = setupRoot?.querySelector('.master-password-form button[type="submit"]')
    return {
      creationState: setupSection?.model?.creationState?.() ?? null,
      submitHostExists: submitButton instanceof HTMLButtonElement,
      submitButtonExists: submitButton instanceof HTMLButtonElement,
      submitDisabled: submitButton instanceof HTMLButtonElement ? submitButton.disabled : null,
    }
  }, MASTER_PASSWORD)

  await writeJson(artifactRoot, 'first-run-create-prepared.json', preparedState)
  await captureSnapshot(driver, artifactRoot, '07-first-run-create-prepared')

  if (
    preparedState.creationState?.p1 !== MASTER_PASSWORD
    || preparedState.creationState?.p2 !== MASTER_PASSWORD
    || !preparedState.submitButtonExists
    || preparedState.submitDisabled
  ) {
    throw new Error(`Create Storage form was not ready for submission: ${JSON.stringify(preparedState)}`)
  }

  await driver.execute(() => {
    const welcomePage = document.querySelector('chromvoid-app')?.shadowRoot?.querySelector('welcome-page')
    const layout =
      welcomePage?.shadowRoot?.querySelector('welcome-page-mobile-layout')
      || welcomePage?.shadowRoot?.querySelector('welcome-page-desktop-layout')
    const setupSection = layout?.shadowRoot?.querySelector('welcome-setup-section')
    const submitButton = setupSection?.shadowRoot
      ?.querySelector('.master-password-form button[type="submit"]')
    if (!(submitButton instanceof HTMLButtonElement)) {
      throw new Error('Create Storage native submit button is unavailable')
    }
    submitButton.click()
  })

  await driver.waitUntil(
    async () => {
      const nextState = await driver.execute(readWelcomeState)
      return nextState.needUserInitialization === false
        || (Boolean(nextState.errorText) && nextState.setupInProgress === false)
    },
    {
      timeout: 90_000,
      timeoutMsg: 'Create Storage click produced neither a created vault nor a visible terminal error',
      interval: 500,
    },
  )

  const result = await driver.execute(readWelcomeState)
  await writeJson(artifactRoot, 'first-run-create-result.json', result)
  await captureSnapshot(driver, artifactRoot, '08-first-run-create-result')

  if (result.needUserInitialization !== false) {
    throw new Error(`Create Storage failed on first run: ${JSON.stringify(result)}`)
  }
}

export async function runVaultSetupOrUnlockSmoke({driver, artifactRoot}) {
  await waitForWelcome(driver)
  await writeJson(artifactRoot, 'welcome-state.json', await driver.execute(readWelcomeState))
  await captureSnapshot(driver, artifactRoot, '04-welcome-route-ready')
}
