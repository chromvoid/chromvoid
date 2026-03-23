import {html} from 'lit'
import type {WelcomeSetupStep} from '../welcome.model'

export function renderWelcomeHero({
  shakeError,
  isNeedInit,
  setupStep,
  title,
  description,
}: {
  shakeError: boolean
  isNeedInit: boolean
  setupStep: WelcomeSetupStep
  title: string
  description: string
}) {
  const eyebrow = getHeroEyebrow({isNeedInit, setupStep})
  const proof = getHeroProof({isNeedInit, setupStep})

  return html`
    <div class="hero">
      <div class="hero-mark">
        <div class="hero-icon-shell" aria-hidden="true">
          <img
            class="hero-art ${shakeError ? 'animate-shake' : ''} ${isNeedInit ? 'locked' : 'unlocked'}"
            src="/assets/favicon.svg"
            alt=""
          />
        </div>

        <div class="hero-kicker">${eyebrow}</div>
      </div>

      <div class="hero-copy">
        <div class="hero-title">
          ${title}
        </div>
        <div class="hero-desc">
          ${description}
        </div>
      </div>

      <div class="hero-proof">${proof}</div>
    </div>
  `
}

function getHeroEyebrow({
  isNeedInit,
  setupStep,
}: {
  isNeedInit: boolean
  setupStep: WelcomeSetupStep
}): string {
  if (setupStep === 'remote-connect' || setupStep === 'remote-pair' || setupStep === 'remote-wait') {
    return 'REMOTE HOST'
  }
  if (!isNeedInit) return 'LOCAL VAULT'
  if (setupStep === 'create-master') return 'FIRST RUN'
  return 'SETUP PATH'
}

function getHeroProof({
  isNeedInit,
  setupStep,
}: {
  isNeedInit: boolean
  setupStep: WelcomeSetupStep
}): string {
  if (setupStep === 'remote-connect') {
    return 'Desktop access waits for a paired iPhone host before the dashboard is opened.'
  }
  if (setupStep === 'remote-pair') {
    return 'Pairing stays inside the offer and PIN flow. The host still controls the final unlock.'
  }
  if (setupStep === 'remote-wait') {
    return 'Transport is ready, but the vault remains sealed until the iPhone host unlocks locally.'
  }
  if (!isNeedInit) {
    return 'Unlock happens on this device. Secrets stay sealed until the local vault is opened.'
  }
  if (setupStep === 'create-master') {
    return 'The master password protects storage creation, backup, restore, and destructive operations.'
  }
  return 'Choose whether this device stores data locally or waits for a paired host before the first unlock.'
}
