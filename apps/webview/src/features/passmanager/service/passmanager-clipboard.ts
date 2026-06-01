import {copyWithAutoWipe, DEFAULT_CLIPBOARD_WIPE_MS} from '@project/passmanager/password-utils'

export const passmanagerAutoWipeClipboard = {
  writeText(text: string): Promise<void> {
    return copyWithAutoWipe(text, DEFAULT_CLIPBOARD_WIPE_MS)
  },
}
