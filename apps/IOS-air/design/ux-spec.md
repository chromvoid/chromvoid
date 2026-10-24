# IOS-air · UX specification

Version 2 · 2026-09-06. Цель: привычное iOS-приложение с характером ChromVoid, в котором доступ к секретам и состояние хранилища всегда понятны. Прототип: [открыть](prototype/index.html). Данные синтетические, интерфейс — browser design model, не native screenshot.

## Design Context

### Users

Владелец личных паролей и файлов, часто работающий одной рукой, переходящий между ChromVoid и другими приложениями. Вторая аудитория — владелец нескольких устройств, использующий iPhone как безопасный host. Быстрый доступ важен, но не ценой изменения vault security policy.

### Brand Personality

Спокойный, точный, приватный. Данные важнее декоративной демонстрации безопасности. Узнаваемость через аккуратный cyan accent и тёмную палитру, а не через замки на каждой строке или обещания абсолютной защиты.

### Aesthetic Direction

Системная типографика, крупные заголовки, плотность привычного iOS списка, свободное пространство между смысловыми разделами. Непрозрачный контент, сдержанные separators. Системные bars/sheets отвечают за native материалы и движения. Предпочтительный вид — Liquid Glass при его доступности и фактическом использовании системой; пользовательские настройки display/accessibility имеют приоритет. На старых iOS сохраняются те же маршруты и действия в обычном системном оформлении. [Material policy и LG01–LG06](../docs/apple-guidelines.md#liquid-glass-availability-and-effective-appearance) обязательны; отдельный переключатель стекла в UX не добавляется. Прототип использует ChromVoid UIKit tokens и SF system fallback; шрифты не скачиваются.

### Design Principles

1. Одна очевидная задача на экране; поиск и действие рядом с данными.
2. Глубина через navigation stack, не через множество вложенных bottom sheets.
3. Состояние vault и ограничения объясняются текстом; цвет помогает, но не заменяет смысл.
4. Secret reveal/copy и destructive operations всегда явные действия.
5. Сворачивание прерывает доступ: модель и навигация очищаются, не только маскируются.

### Accessibility And Constraints

Default body 17 pt в native text style, крупный заголовок 34 pt как стартовая iOS шкала; не фиксировать высоту строк под эти значения. 44×44 pt controls, Dynamic Type до accessibility maximum, VoiceOver, Switch Control, keyboard, Reduce Motion/Transparency, increased contrast. Browser text scale — проверка layout, не симуляция всех свойств Dynamic Type.

[Аудит всех маршрутов J01–J42](route-audit.md) уточняет функциональный паритет, origin/Back/tab/lock и пути отказа. [Визуальное направление](visual-direction.md) задаёт характер revision 2. Оба документа являются частью этой UX-спецификации.

## Информационная архитектура

```text
Safe launch → optional app-presence gate → locked shell
  ├─ Первый запуск → administrative master setup → обычный vault password
  ├─ Открыть локальное хранилище → unlocked application
  ├─ Подключения host (без vault-контента)
  └─ Безопасные настройки / помощь / обслуживание с отдельной авторизацией

Unlocked application
  ├─ Хранилище → Пароли / Коды / Passkeys / Wallet (capability-gated)
  │    ├─ Поиск / группа → запись → просмотр / редактирование
  │    └─ Добавить → форма / импорт
  ├─ Файлы → папка → документ / медиа / заметка
  ├─ Подключения → этот iPhone как host → pairing / revoke
  └─ Настройки → безопасность / AutoFill / оформление / обслуживание / помощь
```

У root tabs одинаковые владельцы на iPhone/iPad. Tab selection живёт до lock; после lock прошлые названия/детали не восстанавливаются. Host settings доступны до unlock, но Start/состояние никогда не означает, что vault открыт. На iPad — sidebar/list/detail по месту; narrow resize адаптирует колонки, не теряет выбранный объект текущей разрешённой сессии.

## Основные сценарии

### F01 — Первый запуск и вход

S01 welcome кратко объясняет локальное хранилище → S02 administrative master setup, если Core требует его → S03 vault password. Master secret предназначен для административных операций, это не название vault password. Если setup уже выполнен, S01 ведёт прямо в S03. Не запрашивать биометрию, camera и push при установке.

Submit пустого поля показывает ошибку и переводит focus; повторный submit во время unlock блокируется. Cancel отменяет запрос/публикацию результата, очищает password. Результат с пустым catalog ведёт в S19, без сигнала «неверный пароль». Keychain failure → S18, никакой кнопки автоматического сброса хранилища.

### F02 — Найти и использовать пароль

S04 searchable list → S05 entry detail. Список показывает название/логин и тип, не секрет. Reveal отдельного поля временный, исчезает при уходе/lock. Copy даёт короткий nonmodal feedback без значения секрета в сообщении; если объявление VoiceOver требуется, объявить действие, не автоматически весь пароль. Native clipboard expiration — по runtime contract. Browser prototype лишь показывает «Копирование показано в макете».

Группы/теги/сортировка доступны из списка; type-specific fields, security audit, selection и copy-all/move не исключаются упрощённым макетом. Полные маршруты J08–J15 и J17 обязательны для W4.

### F03 — Создать/изменить запись

Add или Edit → S06 form. Title required; required-by-type fields валидируются согласно Core. Website допускает корректные поддерживаемые схемы/формат по существующему контракту, без нового Swift validator с другой семантикой. Inline explanation после submit. Save success закрывает sheet и показывает сохранённую запись. Failure сохраняет draft пока vault открыт. Cancel dirty → confirmation. Background lock уничтожает draft без его persisted восстановления; UX объясняет это при следующем входе, не раскрывая название.

### F04 — OTP и passkeys

S07 codes list: цифры monospaced, явный copy и текст оставшегося времени, не цветовой круг как единственный сигнал. Add OTP → ручной секрет/URI или camera по явному выбору, отказ camera оставляет ручной ввод. Computation и validation принадлежат существующему owner.

S08 passkeys: метаданные RP/account/date, детали и delete с подтверждением; private key не раскрывать/копировать. Create/use только через поддержанный provider flow/capability, не локальная кнопка генерации произвольного passkey для любого сайта.

### F05 — Системный AutoFill

S16 объясняет enablement и точную политику доступа. S17 extension locked/unavailable показывает причину и Cancel; инструкция открыть основное приложение не обещает, что повторный переход в Safari сохранит доступ. В eligible context extension показывает matching identities и explicit selection без избыточного dashboard chrome. Получение секрета повторно проверяет session/generation.

Device outcome W1 определяет, существует ли usable success-path при текущем foreground-only контракте. Макет показывает ограничения. Изменение политики ради удобства требует отдельного продукта/security решения; оно не включено в этот план.

### F06 — Файлы, заметки, медиа

S09 list → S10 preview / S11 editor. Import запускает системный picker; multi-item progress S12 отображает имена только в unlocked session. Cancel и failed item дают точный итог, partial success не маскируется общим «Готово». Export открывает системный share по действию пользователя и предупреждает о внешней копии в контексте этого действия. Notes — представление markdown файлов текущего catalog, не дополнительная база.

Media preview использует стандартные play/pause/seek controls и явный close. Никакого autoplay звука. Background lock останавливает secret stream; audio background entitlement не используется как обход. Неподдержанный формат показывает metadata и доступный explicit export, если разрешён.

### F07 — Доверенный компьютер

S13 показывает отдельно состояние network host, vault и paired peers. Start/Stop — явное действие, навигация не останавливает host. S14 pairing показывает короткий код/подтверждение по существующему протоколу, expiry/cancel/retry; screenshot содержит только вымышленный код. Revoke — подтверждение конкретного peer, прерывание доступа по Core contract. Background показывает paused/locked состояние после возврата. USB CTA отсутствует.

### F08 — Обслуживание и wallet

S15 settings → S20 backup/restore/rekey/erase; каждый путь имеет review summary и существующую административную авторизацию. Никакой reset CTA на Keychain error. Backups не рекламируются как переносимые между app identities до проверки фактического формата/pepper contract.

S21 wallet → аккаунт → существующий transaction preview → explicit confirm/cancel. Network/fee/recipient/amount и risk findings видимы до confirm; не добавлять новые блокчейны. Duplicate/uncertain transaction запрещает слепой retry. В mockup показана информационная композиция, транзакции не выполняются.

## Screen inventory and acceptance

| ID  | Экран                  | Основное действие               | Дополнительные состояния                               | Unit  |
| --- | ---------------------- | ------------------------------- | ------------------------------------------------------ | ----- |
| S01 | Welcome                | Настроить / перейти ко входу    | Setup уже выполнен, help                               | W3    |
| S02 | Administrative setup   | Создать admin secret            | Empty/mismatch/working/failure                         | W3    |
| S03 | Vault unlock           | Открыть                         | Empty, working, canceled, empty-vault success          | W3    |
| S04 | Vault/password list    | Search / открыть / Add          | Loading, empty, no-match, error, read-only             | W4    |
| S05 | Entry detail           | Copy/reveal/Edit                | Secret hidden, loading, deleted, lock mid-read         | W4    |
| S06 | Entry form             | Save                            | Inline invalid, saving, failed, discard, read-only     | W4    |
| S07 | OTP                    | Copy / Add                      | No codes, expired interval, manual/scan, camera denied | W4    |
| S08 | Passkeys               | Detail / delete                 | No entries, unsupported capability, delete failure     | W5    |
| S09 | Files                  | Search/open/import              | Loading, empty, denied, partial import, no match       | W6    |
| S10 | Document/media preview | Read/play/share                 | Unsupported, loading, stream revoked, offline          | W7    |
| S11 | Note editor            | Save                            | Dirty, conflict/revision change, failed, lock          | W7    |
| S12 | Import review/progress | Import/cancel                   | Invalid item, disk full, partial result                | W6    |
| S13 | Connections            | Start/Stop, pair                | Host stopped/listening, vault locked, network failure  | W8    |
| S14 | Pairing/revoke         | Confirm/cancel                  | Expired, mismatch, revoked, disconnected               | W8    |
| S15 | Settings               | Open subsection                 | Capability disabled, system scheme, locale             | W3/W9 |
| S16 | AutoFill setup         | Learn/enable                    | Disabled, enabled but unavailable, restricted          | W5    |
| S17 | Provider extension     | Select credential / cancel      | Locked, unavailable, no match, expired, denied         | W5    |
| S18 | Storage unavailable    | Retry/help                      | Missing pepper, protected data unavailable             | W2/W3 |
| S19 | Empty vault            | Add entry/import                | No password oracle, neutral explanation                | W4    |
| S20 | Vault maintenance      | Backup/restore/rekey            | Authorized review, disk full, cancel, unknown outcome  | W9    |
| S21 | Wallet                 | Account/transaction preview     | Capability unavailable, network error, uncertain tx    | W9    |
| S22 | Privacy cover/app gate | Presence check / ordinary entry | Cancel/denied/unavailable; no vault data               | W2/W3 |
| S23 | Read-only              | Read supported content          | Visible restriction, unavailable mutation actions      | W4/W6 |

The prototype covers representative composition and transitions for these families; all subflows/states above remain binding acceptance even when represented by a state selector rather than a separate static image. Native fine-grained OS dialogs are specified here and use system controls rather than invented browser replicas.

Дополнительные макеты: S24 группы/фильтры; S25 OTP form; S26 passkey metadata; S27 file actions; S28 password import; S29 preferences; S30 help; S31 send input; S32 transaction review; S33 maintenance review; S34 unsupported media. Всего 33 browser destinations; S23 остаётся сквозным состоянием read-only. Ни один поясняющий диалог не является готовой реализацией соответствующего системного сценария.

## Cross-screen behavior

| Trigger                | Expected behavior                                                                                            |
| ---------------------- | ------------------------------------------------------------------------------------------------------------ |
| Back gesture           | Standard navigation; dirty edit asks discard, lock bypasses dirty prompt and purges                          |
| Tab switch             | Preserve each current authorized stack; terminate reveal; no storage access caused solely by rendering       |
| Request loading        | Visible progress in content region, toolbar/navigation remain usable except transaction-critical action      |
| Error                  | Specific inline/full-state explanation + meaningful retry; no automatic destructive recovery                 |
| Network loss           | Local content unaffected; host/wallet network state explained; stale authoritative result not shown as fresh |
| Lock from toolbar      | Immediately safe cover → locked shell, old async completion ignored                                          |
| iPad resize            | Same selection and actions; adapt columns based on available width                                           |
| Large type/long locale | Wrap title/row description, vertical actions where needed; no reduced font to fit                            |
| VoiceOver              | Focus at screen heading/first invalid field; icon labels; secret not read without reveal action              |
| Reduced motion         | System transitions adapt; no ornamental loops; feedback stays understandable                                 |

После блокировки интерактивный locked screen сразу содержит поле пароля: отдельный tap «Перейти ко входу» не требуется. Privacy cover для app switcher остаётся непрозрачным, неинтерактивным и без данных; optional app-presence gate, если включён, предшествует доступу к форме на native этапе.

## Copy rules

- `Пароль хранилища` и `Административный пароль` — разные понятия. Нельзя называть оба «мастер-пароль».
- Empty state: «Здесь пока нет записей»; не «Пароль неверный».
- Background return: «Хранилище закрыто. Введите пароль, чтобы продолжить».
- Provider unavailable: «Сейчас автозаполнение недоступно. Хранилище должно быть открыто, а приложение — доступно»; подробности объясняют ограничение фонового режима.
- Product UI не показывает FFI, schema, Rust, provider carrier или generation. Эти детали остаются только в документации и внешней панели макета.
- Canonical English String Catalog source при реализации; RU translations сохраняют смысл; набор локалей сверяется с существующим coverage, без обещания перенести только две локали.

## Design QA protocol

Prototype review: iPhone default/dark, light, compact, 150–200% text, iPad list/detail; пройти unlock → find → detail → edit → validation → save → lock. Отдельно empty/error/read-only/provider blocked. Результат записать в `design/QA.md` со screenshot evidence.

Native review: minimum/current iOS, real iPhone/iPad, keyboard, accessibility, permission dialogs, lifecycle interruptions and OS materials. Screenshots прототипа не принимать вместо XCUITest/device evidence.
