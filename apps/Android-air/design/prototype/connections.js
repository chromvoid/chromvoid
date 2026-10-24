import {html} from '../../../../packages/uikit/src/reatom-lit/index.ts'

import {model as m} from './model.js'
import {backBar, button, heading, icon, iconButton, row} from './ui.js'

export function connections() {
  return html`<div class="app-toolbar brand-toolbar">
      <div class="wordmark"><img src="/brand.svg" alt="" />ChromVoid</div>
      ${m.unlocked()
        ? iconButton('Закрыть хранилище', 'lock', '', 'lock')
        : button('Открыть', 'go', 'unlock', '', 'text-button')}
    </div>
    <div class="content connections-content">
      ${heading('Ваши устройства', 'Личное с собой. Доступ — по вашему выбору.')}
      <section class="host-object">
        <div class="device-illustration" aria-hidden="true">
          <div class="tiny-phone"><img src="/brand.svg" alt="" /></div>
          <span class="device-connector"></span>
          <div class="tiny-laptop"></div>
        </div>
        <div class="host-title">
          <h2>Этот телефон</h2>
          <span>Android</span>
        </div>
        <div class="status-line">
          <span>Хранилище</span><strong>${m.unlocked() ? 'Открыто' : 'Закрыто'}</strong>
        </div>
        <div class="status-line">
          <span>Подключения</span><strong>${m.host() ? 'Ожидаем компьютер' : 'Выключены'}</strong>
        </div>
        ${button(
          m.host() ? 'Остановить подключения' : 'Разрешить подключения',
          'host',
          '',
          m.host() ? 'x' : 'link',
          m.host() ? 'button secondary full' : 'button primary full',
        )}
      </section>
      <div class="section-heading">
        <h2>Доверенные</h2>
        ${iconButton('Добавить компьютер', 'pair', '', 'plus')}
      </div>
      ${m.paired()
        ? row(
            'MacBook',
            m.host() && m.unlocked() ? 'Доверен · доступ по запросу' : 'Доверен · сейчас без доступа',
            'monitor',
            'go',
            'computer',
          )
        : html`<p class="quiet-note">
            Пока нет доверенных компьютеров. Добавьте тот, которому хотите разрешить доступ.
          </p>`}
      <p class="quiet-note">
        Подключение устройства не открывает хранилище. Доверие можно отозвать в любой момент.
      </p>
      <div class="connection-method">
        ${icon('link')}<span
          ><strong>Подключение по USB</strong><small>Доступность зависит от устройства и сборки.</small></span
        >${button('Подробнее', 'sheet', 'usb', '', 'text-button')}
      </div>
    </div>`
}

export function pair() {
  return html`${backBar('Подключение')}
    <div class="content pairing-content">
      <span class="access-symbol">${icon('monitor')}</span>${heading(
        m.pairingExpired() ? 'Код больше не действует' : 'Добавим компьютер',
        m.pairingExpired()
          ? 'Получите новый код и повторите подключение.'
          : 'На компьютере откройте ChromVoid и выберите подключение к телефону.',
      )}
      <div class="pair-code" aria-label="Демонстрационный код подключения">
        ${m.pairingExpired() ? '— — —' : '482 916'}
      </div>
      <p class="quiet-note">
        ${m.pairingExpired()
          ? 'Никому не выдано новое разрешение.'
          : 'Сверьте код на обоих устройствах, прежде чем разрешить доступ.'}
      </p>
      ${m.pairingExpired()
        ? button('Получить новый код', 'restart-pair', '', 'link', 'button primary full')
        : html`<div class="pair-request">
              ${icon('monitor')}<span><strong>MacBook</strong><small>Запрашивает доверие</small></span>
            </div>
            <button class="button primary full" data-action="approve-pair" ?disabled=${!m.host()}>
              Код совпадает · разрешить${icon('check')}</button
            >${!m.host()
              ? html`<p role="status">Сначала разрешите подключения.</p>
                  ${button('Разрешить подключения', 'host')}`
              : ''}${button('Отменить', 'back', '', '', 'text-button full')}`}
    </div>`
}

export function computer() {
  return html`${backBar('Доверенный компьютер')}
    <div class="content">
      <div class="object-header">
        <span class="avatar large">${icon('monitor')}</span>
        <h1 tabindex="-1">MacBook</h1>
        <p>${m.paired() ? 'Доверенное устройство' : 'Доступ отозван'}</p>
      </div>
      <div class="field-group">
        <div class="status-line">
          <span>Разрешение</span><strong>${m.paired() ? 'Действует' : 'Отозвано'}</strong>
        </div>
        <div class="status-line">
          <span>Хранилище телефона</span><strong>${m.unlocked() ? 'Открыто' : 'Закрыто'}</strong>
        </div>
      </div>
      <p class="quiet-note">
        Доверие позволяет компьютеру запрашивать доступ. Закрытое хранилище остаётся недоступным.
      </p>
      ${m.paired()
        ? button('Отозвать доступ', 'revoke', '', 'x', 'button danger full')
        : button('К устройствам', 'go', 'connections', '', 'button secondary full')}
    </div>`
}
