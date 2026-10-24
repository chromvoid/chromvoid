# Design QA · revision 2 · 2026-09-06

Проверка по запросу сохранить функциональность и удобство маршрутов, усилить характер UI. [Полный аудит J01–J42](route-audit.md) отделяет browser P, specification S и native/device D. Ниже — только фактически выполненные проверки макета.

## Выполнено в CUA

- Обход **33 destinations** короткими завершившимися группами: каждый открывается и содержит content; это smoke, не end-to-end каждой функции.
- Search Proton → detail → Back: query и единственная строка сохранены. Группа Работа → GitHub → Files tab → Vault tab: возвращается та же detail; Back возвращает отфильтрованную группу.
- Read-only list → detail → Edit: форма не открывается, показано объяснение. Locked unlock → Connections: статус vault закрыт, секретных root tabs нет.
- Dirty entry → Cancel → отменить discard: введённое значение осталось; Save показывает изменённое название.
- Passkeys → actual metadata detail → Delete → отмена → Back: ключ остаётся в исходном списке.
- OTP Add → пустой submit: inline error; title/secret → camera unavailable explanation → manual submit: demo outcome, введённое значение не теряется. Алгоритм OTP не выполняется.
- Files folder + query → document → Back: тот же query/folder. New note → save → Back → поиск нового имени: новая строка присутствует. Повторно открыть исходную заметку: старый текст сохранился, новый его не подменил.
- Password import review → commit: добавлена одна synthetic entry, отдельно показано одно пропущенное совпадение; это не проверка реального importer.
- File import review → commit → Files и retry из error: новая synthetic file row присутствует, возврат не попадает в чужую detail.
- Host stopped → Add → явный Start → pairing expiry: confirm отсутствует; restart → confirm → revoke: доверенный компьютер удалён, host продолжает ждать подключения.
- Wallet send → empty submit → inline error; recipient/amount → review → изменить: draft сохранён. Никаких транзакций и проверок настоящего адреса.
- Rekey review → пустая авторизация и mismatched new password: inline errors; Lock из dirty формы: данные формы убраны, сразу показано поле обычного входа.
- Reveal в detail → toolbar Lock: secret отсутствует; unlock не требует промежуточной кнопки; ранее сохранённая demo entry остаётся в fixture store.
- **20 state transitions**: loading/empty/error/normal на Files, Preferences, Vault, Edit и Maintenance. После исправления общих render hooks — без новых errors/warnings. Из loading Files можно сменить root tab.
- Тема изменена через внутренние Preferences, а не только через studio switcher.
- Визуально просмотрены dark vault, welcome, compact light detail при 200% текста и iPad Files (1440×1100 studio viewport). Снимки ниже.

## Найдено и исправлено в прогоне

Кроме route findings из audit: render Files пытался фильтровать отсутствующий список в loading/error state, а Preferences имел аналогичный риск для theme control. Общий render теперь вызывает hooks только при наличии обычного содержимого. Два прежних TypeError не засчитаны как pass; повторные 20 переходов проверены после исправления, новых ошибок нет. Новая демозаметка отделена от исходной по документу, не через общее сохранённое поле. Удалены два недоступных action handler и устаревший baseline state после замены маршрутов.

## Снимки revision 2

- [Хранилище и быстрый Copy](screenshots/05-vault-revision2.png).
- [Первый экран с существующим знаком ChromVoid](screenshots/06-welcome-revision2.png).
- [Compact, light, 200%](screenshots/07-compact-light-revision2.png).
- [iPad Files](screenshots/08-ipad-revision2.png).

## Технические проверки и пределы

`bun run lint` — exit 0. `bun build` browser entry — exit 0. Targeted `bunx oxlint --quiet` для app.js/journeys.js/serve.ts — exit 0, с тем же quiet policy, что canonical repo command. Exploratory invocation без quiet выводил advisory style warnings; они не выдаются за ошибки сборки и не скрывались изменением config. Prettier и локальные document links проверены. Server разрешает точный существующий brand SVG, прототип и его stylesheet/spec; Cargo.toml закрыт.

Новые unit tests не добавлены: изменён обратимый дизайн-прототип, поведение проверено через настоящий rendered browser, а native acceptance остаётся в V/J matrices. Нет native app, Core calls, real clipboard, Keychain, permissions, network pairing, wallet send, Apple VoiceOver или signed extension evidence.

Spec-only маршруты S в J-матрице остаются обязательствами реализации: полный group/tag catalog и batch UI, payment cards/custom fields/SSH, audit, полный file picker/move/selection, Markdown links/media, wallet setup/recovery/address book, реальные maintenance/provider процессы. Наличие информационного диалога не означает завершение этих функций. Полная функциональная замена текущего iOS клиента ещё не доказана.

---

# Revision 1 · initial preparation

Проверен локальный HTML-прототип в Codex in-app browser через CUA. Это проверка подготовительного дизайна, не SwiftUI или production runtime. Все данные вымышлены; clipboard, OS permissions, network host, wallets и vault не вызывались.

## Проверено

| Проверка                 | Результат / наблюдение                                                                                                           |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| 22 screen destinations   | Все открываются, содержат соответствующий контент; browser console errors/warnings не обнаружены                                 |
| Search → entry           | Запрос Proton оставляет одну соответствующую запись; открывается правильная карточка                                             |
| Reveal → edit → save     | Демозначение видно только после действия; повторно скрыто после перехода                                                         |
| Required form validation | Пустое название после клавиатурного удаления → inline error и invalid field; исправленное название сохраняется в synthetic model |
| Lock from preview        | Карточка/название/раскрытый пароль удалены из app presentation, показывается обычный вход                                        |
| File folder navigation   | Открытие папки и Back возвращают корректный список                                                                               |
| File no-match            | Неподходящий запрос скрывает строки и показывает объяснение                                                                      |
| Error/retry              | Состояние загрузочной ошибки показывает retry; возврат к содержимому работает                                                    |
| Light / dark             | Проверены список и карточка. В light для действий применён существующий более тёмный brand token                                 |
| Compact / 200% text      | Карточка растёт и прокручивается, текст и кнопки разделены по строкам, горизонтального clipping внутри проверенного контента нет |
| iPad composition         | Sidebar + content, подписи/действия и file list доступны; это browser approximation                                              |

## Снимки

Дополнительно проверен read-only сценарий: Add сохраняет текущий список и объясняет запрет изменения; форма создания не открывается.

- [Основной тёмный макет](screenshots/01-studio-dark.png).
- [Светлая карточка](screenshots/02-entry-light.png).
- [Компактный экран, 200% текст](screenshots/03-compact-large-text.png).
- [iPad: файлы](screenshots/04-ipad-files.png).

Viewport студии при сохранении: 1440×1100 CSS px; phone frame 390×844, compact 375×812, tablet 760×850. Рамка включает декоративную границу — это размеры макета, не измерение native safe areas. На 1280×720 студия также просматривалась с прокруткой страницы.

## Исправлено по проверке

- Разделены название и логин в строках; раньше inline spans визуально сливались.
- Светлые действия получили подходящий существующий darker brand token без изменения общей палитры.
- При крупном тексте action buttons поля переносятся ниже значения; секретная маска не ломает layout.
- Добавлен обычный Lock action на root screen, сохранены Add и root navigation.
- Фильтрация файлов корректно скрывает строки и имеет no-match explanation; папки открываются отдельно.
- Back/tab из dirty формы учитывают discard confirmation; read-only preview отклоняет mutation actions.
- Неиспользуемые три SVG path definitions удалены финальным cleanup; поведение не изменено.

## Границы fidelity

Интерактивно проработаны основные access/credentials/list/form/files/notes/host сценарии. В onboarding, provider, import, wallet и maintenance показаны ключевые экраны и review/explanation transitions; системный picker, реальные media controls, все типы credential forms, transaction/recovery forms и OS dialogs должны быть реализованы по `ux-spec.md`, а не скопированы из поясняющих диалогов макета. Макет не является законченным UI implementation для каждой функции.

OS материалы, реальная клавиатура, VoiceOver/Switch Control, signed provider handoff, biometric verification, Keychain, suspend/resume, media security, performance и install-over-update **не проверялись**. Обязательные native проверки перечислены в [verification.md](../docs/verification.md).

## Инструментальные ограничения

Финальные технические проверки: `bun run lint` завершился с кодом 0; browser bundle собран через `bun build`; документы и prototype отформатированы Prettier. Локальные Markdown links разрешаются. Loopback server возвращает HTML/JS/theme/UX specification и отклоняет доступ к `Cargo.toml`, включая traversal path. Эти проверки не заменяют native матрицу V01–V28.

Первый длинный обход экранов остановился по 30-секундному лимиту инструмента; результат не засчитан. Обход повторён короткими завершившимися группами. Пустой `fill('')` не очистил browser field в одном вызове; валидация проверена реальным Select All + Backspace. Один clipped screenshot оказался пустым из-за capture behavior и заменён проверенным полным screenshot. Эти случаи не принимались за успешную проверку.
