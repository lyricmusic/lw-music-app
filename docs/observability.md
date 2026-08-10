# Наблюдаемость и продуктовая аналитика Syncly

## Решение и границы

Фундамент использует только двух уже оправданных поставщиков:

- **Sentry** — только технические ошибки браузера. SDK выключен по умолчанию и
  запускается исключительно в production при полной env-конфигурации.
- **Firebase Analytics (GA4)** — минимальная продуктовая воронка. Firebase уже
  является платформой проекта, поэтому отдельный продуктовый analytics-сервис
  не добавляется. Analytics SDK загружается только после явного выбора
  пользователя в интерфейсе.
- Диагностика Yandex Cloud Functions остаётся в штатных структурированных логах
  Yandex Cloud. Отдельный server-side ingestion-поставщик не нужен.

Sentry не заменяет продуктовую аналитику, а согласие на GA4 не считается
согласием на техническую телеметрию. Эти каналы включаются, документируются и
откатываются независимо.

Официальные основания интеграции:

- Sentry React SDK автоматически обрабатывает глобальные ошибки и unhandled
  promise rejections, а React 19 предоставляет root error hooks.
- Sentry Vite plugin загружает source maps для конкретного release и поддерживает
  `filesToDeleteAfterUpload`.
- Firebase Web Analytics требует `measurementId`, пишет события через `logEvent`
  и поддерживает consent settings.

## Аудит исходного состояния

До этого изменения ожидаемые ошибки показывались через локальные состояния и
`react-toastify`, но верхнеуровневого Error Boundary не было. Ошибки подписок,
App Check, очереди, чата и плеера выводились в `console` вместе с сырым объектом
Firebase/Fetch error. Browser-facing функции также печатали сырые исключения,
которые потенциально могли содержать email, Firebase UID, room/invite ID, URL,
OAuth state или токены. Source maps не создавались, release/request correlation
не было, GA4 `measurementId` присутствовал, но Analytics SDK не использовался.

После изменения:

- клиентские сырые `console.error`/`console.warn` заменены категоризированной
  технической диагностикой;
- serverless request boundary пишет только allowlisted поля;
- Error Boundary и React 19 root hooks закрывают render, recoverable и uncaught
  ошибки, а стандартные Sentry integrations — global error/unhandled rejection;
- lazy chunk reload по-прежнему выполняется не более одного раза, после чего
  пользователь видит стабильный fallback без автоматического retry-цикла;
- App Check/Auth границы и Firebase Data/Framework Mode не менялись.

## Privacy allowlist

Ни технический, ни продуктовый канал не должен отправлять:

- email, display name, сообщения, названия комнат и содержимое форм;
- Firebase UID/app ID, room/member/message IDs, invite token/hash/code;
- Auth/App Check/OAuth tokens, заголовки авторизации и query/search params;
- `location.state`, полный URL, clipboard или пользовательский ввод.

Sentry event проходит строгий `beforeSend` allowlist. Удаляются `user`,
`request`, contexts, extra, breadcrumbs, transaction/spans и сырые тексты
исключений. В stack frame остаются только имя функции, номер строки/колонки и
pathname файла без origin/query/hash. `sendDefaultPii=false`; console, navigation,
fetch/XHR и UI breadcrumbs отключены. Performance tracing имеет sample rate `0`.
Session Replay и запись ввода не подключены.

Serverless logs содержат только:

`event`, `service`, `operation`, `outcome`, `statusCode`, `durationMs`,
`errorName`, безопасный `errorCode`, `release`, случайный `requestId`.

Raw body, headers, URL, UID и тексты ошибок не логируются. Клиент задаёт новый
`X-Request-ID` на browser-facing запрос и повторно использует его только для
единственного App Check retry. Сервер возвращает тот же ID в response header.

## Словарь продуктовых событий

| Event            | Когда                                                 | Допустимые свойства                 |
| ---------------- | ----------------------------------------------------- | ----------------------------------- |
| `auth_completed` | успешная регистрация/вход/сохранение гостя            | `action`, `method`, `account_state` |
| `guest_sign_in`  | успешный anonymous auth                               | `source=direct_link                 | invite` |
| `room_created`   | сервер подтвердил создание                            | `visibility`, `category_count=1..3` |
| `room_joined`    | успешное присоединение из каталога или по приглашению | `source`, `user_kind`               |
| `room_opened`    | комната, membership и realtime access готовы          | `source`, `user_kind`               |
| `room_left`      | сервер подтвердил явный выход участника               | `role`, `user_kind`                 |

Любое лишнее свойство отклоняется runtime-схемой. Идентификаторы пользователей и
комнат не используются даже в хешированном виде: для этой минимальной воронки
они не нужны. Strict Mode дубли подавляются локальным navigation dedupe key,
который никогда не отправляется; повторное погашение invite уже активным
участником получает `joinedNow=false` и не создаёт новый `room_joined`.
Network/offline и отказ App Check/Auth не
считаются успешными продуктовыми событиями.

## Режимы

| Режим              | Sentry                                         | Product Analytics                                                    | Внешняя отправка тестов |
| ------------------ | ---------------------------------------------- | -------------------------------------------------------------------- | ----------------------- |
| development        | выключен в tracked env                         | выключена                                                            | нет                     |
| test / CI          | принудительно выключен кодом                   | принудительно выключена кодом                                        | нет                     |
| production default | выключен                                       | выключена                                                            | нет                     |
| production rollout | только при полной env + source-map credentials | только после двух admin flags, privacy-проверки GA4 и явного consent | не относится к CI tests |

## Включение Sentry (отдельное разрешение обязательно)

1. Создать Sentry project вне этого репозитория и зафиксировать retention/data
   region/доступы. Это изменение проект не создаёт.
2. В GitHub Repository Variables добавить `SENTRY_DSN`, `SENTRY_ORG`,
   `SENTRY_PROJECT`, `ERROR_MONITORING_ENABLED=true`.
3. В GitHub Actions Secrets добавить только `SENTRY_AUTH_TOKEN` с минимальным
   правом release/source-map upload. Не использовать `VITE_` для этого токена.
4. Build задаёт `VITE_RELEASE=syncly@<git-sha>`. Если monitoring включён, но
   release или upload credentials отсутствуют, production build аварийно
   завершается до публикации.
5. Vite создаёт hidden source maps, plugin загружает их в release и удаляет из
   `dist`. Отдельная проверка, Dockerfile и серверный release script запрещают
   артефакт с `*.map` или `sourceMappingURL`.

Публичный Sentry DSN спроектирован провайдером как client key; upload token —
секрет. Ни одно значение не должно появляться в git, логах или changelog.

## Включение продуктовой аналитики (отдельное решение о consent обязательно)

1. Проверить GA4 property/data stream, retention и privacy-тексты Firebase
   production-проекта. В web stream отключить Enhanced Measurement, включая
   автоматические page views, form interactions, search и outbound clicks.
2. Проверить в DebugView/браузерной сети, что init не отправляет текущий route,
   query/hash/referrer: SDK получает `send_page_view=false`, категорию
   `not_collected` вместо URL/referrer/path, выключенные Google Signals и
   рекламную персонализацию.
3. Только после этой административной проверки установить две Repository
   Variables: `PRODUCT_ANALYTICS_ENABLED=true` и
   `PRODUCT_ANALYTICS_PRIVACY_CONFIRMED=true`. Одной переменной недостаточно.
4. После публикации пользователю показывается dark-purple consent banner.
   До `Разрешить` модуль `firebase/analytics` не загружается и события не
   отправляются. `Не сейчас` сохраняет отказ; молчание остаётся `unknown`.
5. Рекламные consent types всегда `denied`; user ID/user properties не задаются.
   First-party GA client cookie ограничен 30 днями и нужен только для session
   continuity/дедупликации после согласия; Firebase UID в аналитику не передаётся.

## Проверка rollout

Перед любым dev/prod deployment выполнить runbook из `DEPLOYMENT.md`. Дополнительно:

```powershell
pnpm test:observability
pnpm verify:observability
pnpm verify:serverless-bundles
pnpm build
pnpm verify:production-artifact
```

Ручной smoke test: зарегистрированный и гостевой вход; каталог; новый invite и
старый invite deep link; старая вкладка после нового release; offline/network
ошибка; App Check rejection; back/forward; мобильный viewport. Проверить один
product event на действие, fallback после повторной chunk failure, отсутствие
request body/URL/ID в Sentry и function logs, а также отсутствие `*.map` в
публичном release.

Откат: сначала вернуть feature variables в `false`. Это отключает новые внешние
события без изменения Firebase/App Check/Auth. Затем при необходимости откатить
frontend/serverless release штатным способом.
