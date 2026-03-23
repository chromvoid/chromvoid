import {i18n} from './i18n'

type OtpLike = {
  id: string
  label?: string
}

export const pickOtp = <T extends OtpLike>(otps: readonly T[], selectedId?: string): T | undefined => {
  if (!otps.length) {
    return undefined
  }

  if (selectedId) {
    const selected = otps.find((otp) => otp.id === selectedId)
    if (selected) {
      return selected
    }
  }

  return otps[0]
}

export const otpDisplayLabel = <T extends OtpLike>(otp: T, index: number): string => {
  const label = (otp.label ?? '').trim()
  return label || i18n('otp.fallbackLabel', {index: index + 1})
}
