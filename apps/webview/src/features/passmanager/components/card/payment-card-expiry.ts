const PAYMENT_CARD_EXP_YEAR_INPUT_RE = /^\d{2}$/

export function isPaymentCardExpYearInput(value: string): boolean {
  return PAYMENT_CARD_EXP_YEAR_INPUT_RE.test(value.trim())
}

export function parsePaymentCardExpYearInput(value: string): number | undefined {
  if (!isPaymentCardExpYearInput(value)) {
    return undefined
  }

  return 2000 + Number(value.trim())
}

export function formatPaymentCardExpYearInput(expYear: number | undefined): string {
  if (typeof expYear !== 'number' || !Number.isInteger(expYear)) {
    return ''
  }

  return String(expYear).padStart(2, '0').slice(-2)
}
