import {captureSnapshot, writeJson} from '../helpers/artifacts.mjs'

const MASTER_PASSWORD = 'android-ui-first-run-storage-password'

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
      setupRoot?.querySelector('.master-password-form cv-button[type="submit"]'),
    ),
  }
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

    const submitHost = setupRoot?.querySelector('.master-password-form cv-button[type="submit"]')
    const submitButton = submitHost?.shadowRoot?.querySelector('button')
    return {
      creationState: setupSection?.model?.creationState?.() ?? null,
      submitHostExists: Boolean(submitHost),
      submitButtonExists: submitButton instanceof HTMLButtonElement,
      submitDisabled: submitButton instanceof HTMLButtonElement ? submitButton.disabled : null,
    }
  }, MASTER_PASSWORD)

  await writeJson(artifactRoot, 'first-run-create-prepared.json', preparedState)
  await captureSnapshot(driver, artifactRoot, '05-first-run-create-prepared')

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
      ?.querySelector('.master-password-form cv-button[type="submit"]')
      ?.shadowRoot?.querySelector('button')
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
  await captureSnapshot(driver, artifactRoot, '06-first-run-create-result')

  if (result.needUserInitialization !== false) {
    throw new Error(`Create Storage failed on first run: ${JSON.stringify(result)}`)
  }
}

export async function runVaultSetupOrUnlockSmoke({driver, artifactRoot}) {
  await waitForWelcome(driver)
  await writeJson(artifactRoot, 'welcome-state.json', await driver.execute(readWelcomeState))
  await captureSnapshot(driver, artifactRoot, '04-welcome-route-ready')
}
