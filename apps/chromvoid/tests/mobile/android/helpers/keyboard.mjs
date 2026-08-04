export async function waitForAndroidKeyboard(driver, visible, {timeout = 15_000} = {}) {
  await driver.waitUntil(
    async () => {
      return await driver.execute(
        (expectedVisible) =>
          document.documentElement.hasAttribute('data-mobile-keyboard-expanded') === expectedVisible,
        visible,
      )
    },
    {
      timeout,
      timeoutMsg: `Android keyboard did not become ${visible ? 'visible' : 'hidden'}`,
      interval: 250,
    },
  )
}

export async function hideAndroidKeyboard(driver) {
  const webviewContext = await driver.getContext()
  await driver.switchContext('NATIVE_APP')
  await driver.back()
  await driver.switchContext(webviewContext)
  await waitForAndroidKeyboard(driver, false)
}
