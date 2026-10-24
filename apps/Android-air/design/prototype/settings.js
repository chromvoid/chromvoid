import {html} from '../../../../packages/uikit/src/reatom-lit/index.ts'

import {model as m} from './model.js'
import {backBar, button, heading, icon, iconButton, row} from './ui.js'

export function settings() {
  return html`<div class="app-toolbar brand-toolbar">
      <div class="wordmark"><img src="/brand.svg" alt="" />ChromVoid</div>
      ${m.unlocked() ? iconButton('Закрыть хранилище', 'lock', '', 'lock') : ''}
    </div>
    <div class="content">
      ${heading('Настройки', 'Пусть всё работает по-вашему.')}
      <section class="settings-group">
        <h2>Доступ и защита</h2>
        ${row('Безопасность', 'Блокировка и защита при сворачивании', 'shield-check', 'go', 'security')}${row(
          'Автозаполнение',
          m.providerConfigured() ? 'ChromVoid выбран' : 'Настроить в Android',
          'fingerprint',
          'go',
          'autofill',
        )}
      </section>
      <section class="settings-group">
        <h2>Ваше пространство</h2>
        ${row(
          'Оформление',
          m.theme() === 'light' ? 'Светлая тема' : 'Тёмная тема',
          m.theme() === 'light' ? 'sun' : 'moon',
          'theme',
        )}${row(
          'Файлы и обслуживание',
          'Резервная копия, восстановление',
          'folder',
          'go',
          'maintenance',
        )}${row('Язык', 'Русский · язык макета', 'file-text', 'sheet', 'language')}
      </section>
      <section class="settings-group">
        <h2>ChromVoid</h2>
        ${row('О приложении', 'Личное. На своём месте.', 'circle-help', 'go', 'help')}
      </section>
      <p class="quiet-note">ChromVoid · Android Air<br />Исследование дизайна 01</p>
    </div>`
}

export function security() {
  return html`${backBar()}
    <div class="content">
      ${heading('Доступ под контролем')}
      <section class="field-group">
        ${row('Закрыть хранилище', 'Завершить текущий доступ', 'lock', 'lock')}
        <div class="informative-row">
          ${icon('shield-check')}<span
            ><strong>При сворачивании</strong
            ><small>Содержимое скрывается; доступ прекращается по правилам сессии.</small></span
          >
        </div>
        <div class="informative-row">
          ${icon('fingerprint')}<span
            ><strong>Проверка присутствия</strong
            ><small
              >Биометрия — дополнительная проверка приложения. Пароль хранилища остаётся отдельным.</small
            ></span
          >
        </div>
      </section>
      <p class="quiet-note">
        Закрытие убирает показанные секреты и несохранённый ввод. Копирование — отдельное явное действие.
      </p>
    </div>`
}

export function autofill() {
  if (m.route() === 'provider')
    return html`${backBar('Автозаполнение')}
      <div class="content provider-page">
        <p class="eyebrow">ВХОД НА PROTON.ME</p>
        ${heading('Выберите запись', 'Данные передаются только выбранному сайту.')}${row(
          'Proton',
          'alex@example.com',
          'key-round',
          'provider-use',
        )}
        <p class="quiet-note">Если хранилище закроется, выбор будет отменён.</p>
        ${button('Отменить', 'back', '', '', 'button secondary full')}
      </div>`
  return html`${backBar()}
    <div class="content">
      <span class="access-symbol">${icon('fingerprint')}</span>${heading(
        'Меньше ввода. Больше удобства.',
        'Используйте сохранённые логины в приложениях и браузере.',
      )}
      <ol class="steps">
        <li>
          <strong>Выберите ChromVoid</strong>
          <p>В настройках Android откройте службу паролей и автозаполнения.</p>
        </li>
        <li>
          <strong>Откройте хранилище</strong>
          <p>Доступ зависит от состояния сессии и поддержки вашей сборки.</p>
        </li>
        <li>
          <strong>Подтвердите запись</strong>
          <p>Выберите подходящий логин на сайте.</p>
        </li>
      </ol>
      ${button(
        m.providerConfigured() ? 'Показать выбор записи' : 'Настроить в Android',
        m.providerConfigured() ? 'go' : 'provider-setup',
        m.providerConfigured() ? 'provider' : '',
        'arrow-up-right',
        'button primary full',
      )}
    </div>`
}

export function maintenance() {
  return html`${backBar()}
    <div class="content">
      ${heading('Файлы и обслуживание', 'Важные операции — с понятными последствиями.')}
      <section class="field-group">
        ${row('Резервная копия', 'Сохранить в выбранном месте', 'download', 'maintenance', 'backup')}${row(
          'Восстановление',
          'Проверить копию перед применением',
          'upload',
          'maintenance',
          'restore',
        )}${row('Изменить пароль', 'Потребуется авторизация', 'key-round', 'maintenance', 'rekey')}
      </section>
      <div class="danger-zone">
        ${button('Очистить хранилище', 'maintenance', 'erase', 'trash-2', 'text-button danger')}
      </div>
      <p class="quiet-note">Доступ и совместимость копии проверяются перед изменением данных.</p>
    </div>`
}

export function extra() {
  if (m.route() === 'ssh')
    return html`${backBar()}
      <div class="content">
        ${heading('SSH-ключи', 'Ключи для ваших подключений.')}
        <div class="field-group">
          <div class="informative-row">
            ${icon('key-round')}<span
              ><strong>Рабочий ключ</strong><small>Ed25519 · связан с GitHub</small></span
            >
          </div>
        </div>
        ${button(
          'Копировать публичную часть',
          'copy',
          'Публичная часть',
          'copy',
          'button secondary full',
        )}${row('GitHub', 'Связанная запись', 'link', 'entry', 'github')}
      </div>`
  if (m.route() === 'wallet')
    return html`${backBar()}
      <div class="content">
        ${heading('Кошелёк', 'Отдельное пространство для поддержанных активов.')}
        <div class="wallet-object">
          <p>Личный · демонстрационный счёт</p>
          <strong>125,00 <span>TON</span></strong
          ><small>Пример содержимого, без рыночной оценки</small>
        </div>
        <div class="button-row">
          ${button('Получить', 'sheet', 'receive', 'download', 'button primary')}${button(
            'Отправить',
            'sheet',
            'send',
            'arrow-up-right',
            'button secondary',
          )}
        </div>
        <h2 class="section-title">История</h2>
        <div class="informative-row">
          ${icon('download')}<span
            ><strong>Получение</strong><small>Вымышленная операция · 7 сентября</small></span
          ><strong>+25 TON</strong>
        </div>
        <p class="quiet-note">Перед отправкой проверяются сеть, получатель, сумма и комиссия.</p>
      </div>`
  return html`${backBar()}
    <div class="content about-page">
      <img class="about-mark" src="/brand.svg" alt="Знак ChromVoid" />${heading(
        'Личное. На своём месте.',
        'Пароли, коды, заметки и файлы в локальном хранилище.',
      )}
      <p>
        Вы выбираете, когда открыть доступ и каким устройствам доверять. Обычное чтение и работа с заметками
        остаются внутри приложения.
      </p>
      <p>
        Открытое хранилище и доверенный компьютер — разные состояния. Внешняя копия файла выходит за границу
        хранилища.
      </p>
      <p class="quiet-note">
        Air — направление разработки интерфейса. Возможности зависят от платформы и сборки.
      </p>
      ${button(
        'Открыть хранилище',
        'go',
        m.unlocked() ? 'vault' : 'unlock',
        'arrow-up-right',
        'button primary full',
      )}
    </div>`
}
