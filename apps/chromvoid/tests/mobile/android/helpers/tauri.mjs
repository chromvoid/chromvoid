export async function tauriInvoke(driver, cmd, args = {}) {
  const result = await driver.executeAsync(
    (command, payload, done) => {
      const internals = globalThis.__TAURI_INTERNALS__
      if (!internals || typeof internals.invoke !== 'function') {
        done({ok: false, error: 'Tauri internals are unavailable'})
        return
      }

      internals
        .invoke(command, payload)
        .then((value) => done({ok: true, value}))
        .catch((error) => done({ok: false, error: String(error)}))
    },
    cmd,
    args,
  )

  if (!result?.ok) {
    throw new Error(`tauri invoke failed for ${cmd}: ${result?.error || 'unknown error'}`)
  }

  return result.value
}

export async function seedPasswordEntry(
  driver,
  {entryId, title, username, password, url, groupPath = '/Autofill Probe'},
) {
  await tauriInvoke(driver, 'rpc_dispatch', {
    args: {
      v: 1,
      command: 'passmanager:group:ensure',
      data: {path: groupPath},
    },
  })

  await tauriInvoke(driver, 'rpc_dispatch', {
    args: {
      v: 1,
      command: 'passmanager:entry:save',
      data: {
        id: entryId,
        title,
        username,
        group_path: groupPath,
        urls: [{value: url, match: 'exact'}],
      },
    },
  })

  await tauriInvoke(driver, 'rpc_dispatch', {
    args: {
      v: 1,
      command: 'passmanager:secret:save',
      data: {
        entry_id: entryId,
        secret_type: 'password',
        value: password,
      },
    },
  })
}

export async function seedOtpEntry(
  driver,
  {entryId, title, username, url, otpOptions, groupPath = '/Autofill Probe'},
) {
  await tauriInvoke(driver, 'rpc_dispatch', {
    args: {
      v: 1,
      command: 'passmanager:group:ensure',
      data: {path: groupPath},
    },
  })

  await tauriInvoke(driver, 'rpc_dispatch', {
    args: {
      v: 1,
      command: 'passmanager:entry:save',
      data: {
        id: entryId,
        title,
        username,
        group_path: groupPath,
        urls: [{value: url, match: 'exact'}],
        otps: otpOptions.map((otp) => ({
          id: otp.id,
          label: otp.label ?? null,
          type: otp.type,
          algorithm: otp.algorithm ?? 'SHA1',
          digits: otp.digits ?? 6,
          period: otp.period ?? 30,
          encoding: otp.encoding ?? 'base32',
          counter: otp.counter ?? null,
        })),
      },
    },
  })

  for (const otp of otpOptions) {
    await tauriInvoke(driver, 'rpc_dispatch', {
      args: {
        v: 1,
        command: 'passmanager:otp:setSecret',
        data: {
          entry_id: entryId,
          otp_id: otp.id,
          secret: otp.secret,
          encoding: otp.encoding ?? 'base32',
          algorithm: otp.algorithm ?? 'SHA1',
          digits: otp.digits ?? 6,
          period: otp.period ?? 30,
          label: otp.label ?? null,
        },
      },
    })
  }
}
