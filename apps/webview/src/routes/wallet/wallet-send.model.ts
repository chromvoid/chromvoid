import {action, atom, computed, isAbort, withAbort, withAsync, wrap} from '@reatom/core'

import {i18n} from 'root/i18n'
import type {RpcCmdData} from 'root/core/transport/tauri/tauri-rpc-types'
import {formatWalletDecimal, isPositiveBaseUnitAmount, parseWalletDecimal} from './wallet-format'
import type {WalletFeeTier, WalletNetworkUiProfile} from './wallet-network'
import type {
  WalletConfirmResponse,
  WalletPrepareResponse,
  WalletQuoteResponse,
  WalletSendRecipient,
} from './wallet-page.types'

export const PRIMARY_RECIPIENT_ID = 'primary'

export type WalletSendStep = 'form' | 'recipients' | 'address-book-editor'
export type WalletSendAmountMode = 'manual' | 'max'

type WalletSendContext = {
  accountId: string
  profile: WalletNetworkUiProfile
  providerReady: boolean
  cachedSpendable: string | null
}

type QuoteInput = {
  key: string
  request: RpcCmdData<'wallet:transaction:quote'>
}

function rpcErrorCode(error: unknown): string | null {
  if (!error || typeof error !== 'object' || !('code' in error)) return null
  const code = (error as {code?: unknown}).code
  return typeof code === 'string' ? code : null
}

const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error))

export class WalletSendModel {
  readonly destination = atom('', 'wallet.sendDestination')
  readonly amount = atom('', 'wallet.sendAmount')
  readonly additionalRecipients = atom<WalletSendRecipient[]>([], 'wallet.additionalRecipients')
  readonly activeRecipientId = atom(PRIMARY_RECIPIENT_ID, 'wallet.activeRecipientId')
  readonly amountMode = atom<WalletSendAmountMode>('manual', 'wallet.sendAmountMode')
  readonly rangePercent = atom(0, 'wallet.sendRangePercent')
  readonly comment = atom('', 'wallet.sendComment')
  readonly feeTier = atom<WalletFeeTier>('standard', 'wallet.sendFeeTier')
  readonly masterPassword = atom('', 'wallet.sendMasterPassword')
  readonly prepared = atom<WalletPrepareResponse | null>(null, 'wallet.prepared')
  readonly acceptedWarnings = atom<Set<string>>(new Set<string>(), 'wallet.acceptedWarnings')
  readonly lastConfirm = atom<WalletConfirmResponse | null>(null, 'wallet.lastConfirm')
  readonly step = atom<WalletSendStep>('form', 'wallet.sendStep')
  readonly quote = atom<WalletQuoteResponse | null>(null, 'wallet.sendQuote')
  readonly quoteError = atom<string | null>(null, 'wallet.sendQuoteError')
  readonly quoteExpired = atom(false, 'wallet.sendQuoteExpired')
  readonly quoteRefreshing = atom(false, 'wallet.sendQuoteRefreshing')
  readonly fieldErrors = atom<Record<string, string>>({}, 'wallet.sendFieldErrors')
  readonly submitError = atom<string | null>(null, 'wallet.sendSubmitError')
  readonly submitAttempted = atom(false, 'wallet.sendSubmitAttempted')

  readonly recipients = computed<WalletSendRecipient[]>(
    () => [
      {id: PRIMARY_RECIPIENT_ID, address: this.destination(), amount: this.amount()},
      ...this.additionalRecipients(),
    ],
    'wallet.sendRecipients',
  )

  readonly activeRecipient = computed(
    () =>
      this.recipients().find((recipient) => recipient.id === this.activeRecipientId()) ??
      this.recipients()[0]!,
    'wallet.activeRecipient',
  )

  readonly quoteLoading = computed(
    () => this.fetchQuote.pending() > 0 || this.quoteRefreshing(),
    'wallet.sendQuoteLoading',
  )
  readonly quoteFresh = computed(() => Boolean(this.quote() && !this.quoteExpired()), 'wallet.sendQuoteFresh')
  readonly availableBaseUnits = computed(() => {
    const context = this.getContext()
    if (!context) return null
    return this.quoteFresh() ? (this.quote()?.spendable ?? context.cachedSpendable) : context.cachedSpendable
  }, 'wallet.sendAvailableBaseUnits')
  readonly currentPreview = computed(
    () => (this.quoteFresh() ? (this.quote()?.current_preview ?? null) : null),
    'wallet.sendCurrentPreview',
  )

  readonly canPrepare = computed(() => this.formErrors(false).firstField === null, 'wallet.canPrepareSend')

  readonly preparedAmountBelowFee = computed(() => {
    const prepared = this.prepared()
    if (!prepared || prepared.network !== 'ton') return false
    try {
      const amount = prepared.preview.outputs.reduce((total, output) => total + BigInt(output.amount), 0n)
      return amount < BigInt(prepared.preview.estimated_fee)
    } catch {
      return true
    }
  }, 'wallet.preparedAmountBelowFee')

  readonly canConfirm = computed(() => {
    const prepared = this.prepared()
    if (
      !prepared ||
      !this.getContext()?.providerReady ||
      this.preparedAmountBelowFee() ||
      !this.masterPassword().trim()
    )
      return false
    const accepted = this.acceptedWarnings()
    return prepared.preview.warnings.every((warning) => accepted.has(warning.code))
  }, 'wallet.canConfirmPrepared')

  private recipientId = 0
  private quoteRefreshTimer: ReturnType<typeof setTimeout> | null = null
  private currentQuoteKey = ''

  private readonly fetchQuote = action(async (input: QuoteInput) => {
    await wrap(new Promise<void>((resolve) => setTimeout(resolve, 250)))
    const result = await wrap(this.requestQuote(input.request))
    if (input.key !== this.currentQuoteKey) return null
    this.quote.set(result)
    this.quoteError.set(null)
    this.quoteExpired.set(false)
    this.syncRangeFromAmount()
    if (this.amountMode() === 'max') this.applyQuotedMaximum(result)
    this.scheduleExpiry(result)
    return result
  }, 'wallet.fetchSendQuote').extend(withAbort(), withAsync())

  constructor(
    private readonly getContext: () => WalletSendContext | null,
    private readonly requestQuote: (
      request: RpcCmdData<'wallet:transaction:quote'>,
    ) => Promise<WalletQuoteResponse>,
  ) {}

  setDestination(value: string): void {
    this.setRecipientAddress(PRIMARY_RECIPIENT_ID, value)
  }

  setAmount(value: string): void {
    this.setRecipientAmount(PRIMARY_RECIPIENT_ID, value)
  }

  setComment(value: string): void {
    this.comment.set(value)
    this.clearFieldError('comment')
    this.invalidatePrepared()
    this.scheduleQuote()
  }

  setFeeTier(value: WalletFeeTier): void {
    this.feeTier.set(value)
    this.invalidatePrepared()
    this.scheduleQuote()
  }

  setStep(step: WalletSendStep): void {
    this.step.set(step)
  }

  addRecipient(): void {
    if (!this.getContext()?.profile.multipleOutputs) return
    const id = `recipient-${++this.recipientId}`
    this.additionalRecipients.set([...this.additionalRecipients(), {id, address: '', amount: ''}])
    this.activeRecipientId.set(id)
    this.amountMode.set('manual')
    this.rangePercent.set(0)
    this.invalidateQuote()
    this.invalidatePrepared()
  }

  removeRecipient(id: string): void {
    this.additionalRecipients.set(this.additionalRecipients().filter((recipient) => recipient.id !== id))
    if (this.activeRecipientId() === id) this.activeRecipientId.set(PRIMARY_RECIPIENT_ID)
    this.invalidateQuote()
    this.invalidatePrepared()
    this.scheduleQuote()
  }

  activateRecipient(id: string): void {
    if (!this.recipients().some((recipient) => recipient.id === id)) return
    if (this.activeRecipientId() === id) return
    this.activeRecipientId.set(id)
    this.amountMode.set('manual')
    this.invalidateQuote()
    this.scheduleQuote()
  }

  setRecipientAddress(id: string, value: string): void {
    this.activeRecipientId.set(id)
    if (id === PRIMARY_RECIPIENT_ID) this.destination.set(value)
    else {
      this.additionalRecipients.set(
        this.additionalRecipients().map((recipient) =>
          recipient.id === id ? {...recipient, address: value} : recipient,
        ),
      )
    }
    this.clearFieldError(this.fieldKey(id, 'address'))
    this.invalidatePrepared()
    this.scheduleQuote()
  }

  setRecipientAmount(id: string, value: string): void {
    this.activeRecipientId.set(id)
    if (id === PRIMARY_RECIPIENT_ID) this.amount.set(value)
    else {
      this.additionalRecipients.set(
        this.additionalRecipients().map((recipient) =>
          recipient.id === id ? {...recipient, amount: value} : recipient,
        ),
      )
    }
    this.amountMode.set('manual')
    this.clearFieldError(this.fieldKey(id, 'amount'))
    this.invalidatePrepared()
    this.syncRangeFromAmount()
    this.scheduleQuote()
  }

  chooseRecipient(address: string): void {
    this.setRecipientAddress(this.activeRecipientId(), address)
    this.step.set('form')
  }

  setRangePercent(value: number): void {
    const percent = Math.max(0, Math.min(100, Math.round(value)))
    this.rangePercent.set(percent)
    if (percent === 100) {
      this.applyMax()
      return
    }
    this.amountMode.set('manual')
    const quote = this.quoteFresh() ? this.quote() : null
    if (!quote) return
    const baseUnits = (BigInt(quote.max_amount) * BigInt(percent)) / 100n
    const display = baseUnits === 0n ? '' : formatWalletDecimal(baseUnits.toString(), quote.network)
    this.setRecipientAmountValue(this.activeRecipientId(), display)
    this.invalidatePrepared()
    this.scheduleQuote()
  }

  applyMax(): boolean {
    const quote = this.quoteFresh() ? this.quote() : null
    if (!quote || BigInt(quote.max_amount) <= 0n) {
      this.amountMode.set('manual')
      this.rangePercent.set(0)
      this.scheduleQuote(true)
      return false
    }
    this.amountMode.set('max')
    this.rangePercent.set(100)
    this.applyQuotedMaximum(quote)
    this.invalidatePrepared()
    return true
  }

  retryQuote(): void {
    this.scheduleQuote(true)
  }

  buildOutputs(profile: WalletNetworkUiProfile) {
    return this.recipients().map((recipient) => ({
      address: recipient.address.trim(),
      amount: parseWalletDecimal(recipient.amount, profile.network),
      comment: profile.supportsComment ? this.comment().trim() || null : null,
    }))
  }

  validateForPrepare(): string | null {
    this.submitAttempted.set(true)
    const validation = this.formErrors(true)
    this.fieldErrors.set(validation.errors)
    this.submitError.set(validation.formError)
    return validation.firstField
  }

  applyPrepareError(error: unknown): string | null {
    const message = errorMessage(error)
    const code = rpcErrorCode(error)
    const activeId = this.activeRecipientId()
    if (code === 'INVALID_ADDRESS') {
      const field = this.fieldKey(activeId, 'address')
      this.fieldErrors.set({...this.fieldErrors(), [field]: message})
      return field
    }
    if (code === 'INSUFFICIENT_FUNDS') {
      const field = this.fieldKey(activeId, 'amount')
      this.fieldErrors.set({...this.fieldErrors(), [field]: message})
      return field
    }
    this.submitError.set(message)
    return null
  }

  fieldError(recipientId: string, field: 'address' | 'amount'): string | null {
    return this.fieldErrors()[this.fieldKey(recipientId, field)] ?? null
  }

  toggleWarning(code: string, checked: boolean): void {
    const next = new Set(this.acceptedWarnings())
    if (checked) next.add(code)
    else next.delete(code)
    this.acceptedWarnings.set(next)
  }

  invalidatePrepared(): void {
    this.prepared.set(null)
    this.acceptedWarnings.set(new Set<string>())
  }

  closePresentation(): void {
    this.masterPassword.set('')
    this.invalidatePrepared()
    this.step.set('form')
    this.submitError.set(null)
  }

  reset(): void {
    this.fetchQuote.abort('wallet send reset')
    this.clearQuoteTimer()
    this.currentQuoteKey = ''
    this.destination.set('')
    this.amount.set('')
    this.additionalRecipients.set([])
    this.activeRecipientId.set(PRIMARY_RECIPIENT_ID)
    this.amountMode.set('manual')
    this.rangePercent.set(0)
    this.comment.set('')
    this.feeTier.set('standard')
    this.masterPassword.set('')
    this.quote.set(null)
    this.quoteError.set(null)
    this.quoteExpired.set(false)
    this.quoteRefreshing.set(false)
    this.fieldErrors.set({})
    this.submitError.set(null)
    this.submitAttempted.set(false)
    this.step.set('form')
    this.invalidatePrepared()
  }

  private scheduleQuote(immediate = false): void {
    const built = this.buildQuoteRequest()
    if (!built) {
      this.invalidateQuote()
      return
    }
    const key = JSON.stringify(built)
    this.currentQuoteKey = key
    this.quoteError.set(null)
    this.fetchQuote.abort('wallet quote superseded')
    const input = {key, request: built}
    if (immediate) this.quoteRefreshing.set(true)
    const run = immediate
      ? this.requestQuote(input.request).then((result) => {
          if (key !== this.currentQuoteKey) return null
          this.quote.set(result)
          this.quoteError.set(null)
          this.quoteExpired.set(false)
          this.syncRangeFromAmount()
          if (this.amountMode() === 'max') this.applyQuotedMaximum(result)
          this.scheduleExpiry(result)
          return result
        })
      : this.fetchQuote(input)
    void run
      .catch((error) => {
        if (isAbort(error) || key !== this.currentQuoteKey) return
        this.quote.set(null)
        this.quoteExpired.set(false)
        this.quoteError.set(errorMessage(error))
        if (this.amountMode() === 'max') {
          this.amountMode.set('manual')
          this.rangePercent.set(0)
        }
      })
      .finally(() => {
        if (immediate && key === this.currentQuoteKey) this.quoteRefreshing.set(false)
      })
  }

  private buildQuoteRequest(): RpcCmdData<'wallet:transaction:quote'> | null {
    const context = this.getContext()
    if (!context || !context.providerReady || context.profile.network === 'solana') return null
    const recipients = this.recipients()
    const maxOutputIndex = recipients.findIndex((recipient) => recipient.id === this.activeRecipientId())
    if (maxOutputIndex < 0 || recipients.some((recipient) => !recipient.address.trim())) return null
    const outputs = [] as RpcCmdData<'wallet:transaction:quote'>['outputs']
    for (const [index, recipient] of recipients.entries()) {
      let amount: string | null = null
      try {
        const parsed = parseWalletDecimal(recipient.amount, context.profile.network)
        if (isPositiveBaseUnitAmount(parsed)) amount = parsed
      } catch {
        amount = null
      }
      if (index !== maxOutputIndex && amount === null) return null
      outputs.push({
        address: recipient.address.trim(),
        amount,
        comment: context.profile.supportsComment ? this.comment().trim() || null : null,
      })
    }
    return {
      account_id: context.accountId,
      network: context.profile.network,
      outputs,
      fee_policy: {tier: this.feeTier()},
      max_output_index: maxOutputIndex,
    }
  }

  private formErrors(includeMessages: boolean): {
    errors: Record<string, string>
    firstField: string | null
    formError: string | null
  } {
    const context = this.getContext()
    const errors: Record<string, string> = {}
    let formError: string | null = null
    if (!context || !context.providerReady || context.profile.network === 'solana') {
      formError = i18n('wallet:error:provider-unavailable')
    } else {
      for (const recipient of this.recipients()) {
        if (!recipient.address.trim()) {
          errors[this.fieldKey(recipient.id, 'address')] = i18n('wallet:send:error:address-required')
        }
        try {
          if (!isPositiveBaseUnitAmount(parseWalletDecimal(recipient.amount, context.profile.network))) {
            errors[this.fieldKey(recipient.id, 'amount')] = i18n('wallet:send:error:amount-required')
          }
        } catch {
          errors[this.fieldKey(recipient.id, 'amount')] = i18n('wallet:send:error:amount-required')
        }
      }
      if (this.amountMode() === 'max' && !this.quoteFresh()) {
        errors[this.fieldKey(this.activeRecipientId(), 'amount')] = i18n('wallet:send:error:max-unavailable')
      }
      if (context.profile.supportsComment && new TextEncoder().encode(this.comment()).length > 120) {
        errors['comment'] = i18n('wallet:send:error:comment-too-long')
      }
    }
    const firstField = Object.keys(errors)[0] ?? null
    return {
      errors: includeMessages ? errors : {},
      firstField: formError ? 'form' : firstField,
      formError,
    }
  }

  private applyQuotedMaximum(quote: WalletQuoteResponse): void {
    const display = formatWalletDecimal(quote.max_amount, quote.network)
    this.setRecipientAmountValue(this.activeRecipientId(), display)
  }

  private setRecipientAmountValue(id: string, value: string): void {
    if (id === PRIMARY_RECIPIENT_ID) this.amount.set(value)
    else {
      this.additionalRecipients.set(
        this.additionalRecipients().map((recipient) =>
          recipient.id === id ? {...recipient, amount: value} : recipient,
        ),
      )
    }
    this.clearFieldError(this.fieldKey(id, 'amount'))
  }

  private syncRangeFromAmount(): void {
    if (this.amountMode() === 'max') {
      this.rangePercent.set(100)
      return
    }
    const quote = this.quoteFresh() ? this.quote() : null
    const context = this.getContext()
    if (!quote || !context || BigInt(quote.max_amount) <= 0n) {
      this.rangePercent.set(0)
      return
    }
    try {
      const amount = BigInt(parseWalletDecimal(this.activeRecipient().amount, context.profile.network))
      const percentage = Number((amount * 100n) / BigInt(quote.max_amount))
      this.rangePercent.set(Math.max(0, Math.min(99, percentage)))
    } catch {
      this.rangePercent.set(0)
    }
  }

  private scheduleExpiry(quote: WalletQuoteResponse): void {
    this.clearQuoteTimer()
    const delay = Math.max(0, quote.expires_at - Date.now())
    this.quoteRefreshTimer = setTimeout(() => {
      if (this.quote()?.quoted_at !== quote.quoted_at) return
      this.quoteExpired.set(true)
      if (this.amountMode() === 'max') {
        this.amountMode.set('manual')
        this.rangePercent.set(0)
      }
      this.scheduleQuote(true)
    }, delay)
  }

  private invalidateQuote(): void {
    this.fetchQuote.abort('wallet quote invalidated')
    this.clearQuoteTimer()
    this.currentQuoteKey = ''
    this.quote.set(null)
    this.quoteError.set(null)
    this.quoteExpired.set(false)
    this.quoteRefreshing.set(false)
  }

  private clearQuoteTimer(): void {
    if (this.quoteRefreshTimer !== null) clearTimeout(this.quoteRefreshTimer)
    this.quoteRefreshTimer = null
  }

  private fieldKey(recipientId: string, field: 'address' | 'amount'): string {
    return `${recipientId}-${field}`
  }

  private clearFieldError(field: string): void {
    if (!this.fieldErrors()[field]) return
    const next = {...this.fieldErrors()}
    delete next[field]
    this.fieldErrors.set(next)
  }
}
