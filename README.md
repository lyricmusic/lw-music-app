# LW Music

Комнаты для совместного просмотра и прослушивания музыки. Пользователь входит в аккаунт, выбирает комнату, а встроенный RUTUBE-плеер синхронно воспроизводит выбранный клип у всех участников.

## Архитектура

Клиент организован по Feature-Sliced Design:

```text
src/
  app/       # провайдеры, глобальные стили и маршрутизация
  pages/     # страницы приложения
  widgets/   # крупные самостоятельные UI-блоки
  features/  # пользовательские действия
  entities/  # доменные модели и их UI
  shared/    # Firebase, конфигурация, библиотеки и базовый UI
```

Публичные маршруты авторизации: `/sign-in` и `/sign-up`. Старый `/register`
перенаправляет на `/sign-up`. Комнаты доступны по `/rooms` и
`/rooms/:roomId`, а ссылки-приглашения открываются по `/join/:inviteToken`.

## Что уже работает

- Firebase Authentication: регистрация и вход по e-mail/паролю, вход через Яндекс ID посредством Firebase custom token, восстановление сессии и выход.
- Профили пользователей и обязательный онбординг после регистрации в Cloud Firestore (`users/{uid}`).
- Двухшаговый гостевой вход по ссылке: «Присоединиться» → никнейм и базовый аватар.
- Сохранение anonymous-профиля через email/пароль или Яндекс ID без смены Firebase UID.
- Все пользовательские формы работают через React Hook Form; для текущих простых правил отдельный слой Zod не используется.
- Защищённые маршруты комнат.
- Встроенный RUTUBE-плеер с управлением через документированный `postMessage` API.
- Синхронизация плеера через snapshot документа Cloud Firestore.
- Чат комнаты: realtime-подписка на последние 50 сообщений за последние сутки.
- Режимы ведущего и слушателя для локальной проверки.
- Firestore Security Rules для профилей, комнат и состояния плеера.
- Firebase Hosting rewrite для SPA-маршрутов.

## Локальный запуск

Нужен Node.js 22.22 или новее. Версия для локальных менеджеров Node закреплена
в `.node-version` и `.nvmrc`, а CI и Docker используют Node.js 22.22.0.

```bash
pnpm install
pnpm dev
```

Локальная разработка всегда использует отдельный Firebase-проект
`lwmusic-dev-ffe83`. Его публичная Web SDK конфигурация и URL dev-функций
хранятся в отслеживаемом `.env.development`, поэтому после `git pull` на другом
устройстве локальные ключи и URL добавлять не нужно. Production-сборка берёт явную
конфигурацию `lwmusic-ffe83` из `.env.production`. Клиент прекращает запуск,
если `VITE_APP_ENV=development` указывает на production-проект или наоборот.

Секретные Firebase Admin credentials, Yandex OAuth client secret и ключи Object
Storage в env-файлы не записываются: функции получают их из отдельных Yandex
Lockbox secrets соответствующего окружения.

Повторный dev-деплой с другого устройства не требует локальных JSON-ключей или
OAuth secrets. Достаточно установить Firebase/Yandex CLI, войти в аккаунты с
доступом к проектам и выполнить:

```powershell
./scripts/deploy-yandex-auth.ps1 -Environment dev
./scripts/deploy-room-invites.ps1 -Environment dev
./scripts/deploy-room-management.ps1 -Environment dev
./scripts/deploy-yandex-storage.ps1 -Environment dev
```

Firebase CLI aliases настроены так: `default` и `dev` указывают на
`lwmusic-dev-ffe83`, а `prod` — на `lwmusic-ffe83`. Поэтому локальные команды
по умолчанию безопасны, а production-деплой всегда должен содержать
`--project prod`. Yandex deploy-скрипты также по умолчанию используют `dev`;
для production нужно явно передать `-Environment prod`.

Для быстрой проверки только RUTUBE-плеера без входа и Firestore в dev-режиме доступен `http://localhost:5173/__player-smoke`. В production-сборке этого маршрута нет.

Проверки перед коммитом:

```bash
pnpm lint
pnpm build
pnpm verify:room-model-rules
pnpm verify:room-invite-function
```

## Применение Firebase Rules

Правила Firestore и Realtime Database, а также Firestore indexes разворачиваются
в каждый Firebase-проект отдельно:

```bash
pnpm exec firebase deploy --only firestore:rules,firestore:indexes,database --project dev
pnpm exec firebase deploy --only firestore:rules,firestore:indexes,database --project prod
```

Production-команду запускайте только как осознанный релиз. В Firebase-конфиге
нет production fallback: отсутствие обязательной env-переменной завершает
запуск понятной ошибкой до инициализации Firebase.

В обоих проектах должны быть включены Authentication → Email/Password и
Anonymous. Для входа через Яндекс отдельный Firebase-провайдер не требуется:
серверная функция соответствующего окружения проверяет Яндекс ID и выпускает
Firebase custom token для того же Firebase-проекта.

## Вход через Яндекс ID

1. Создайте приложение в [Яндекс OAuth](https://oauth.yandex.ru/client/new/) для веб-сервиса и разрешите доступы `login:email`, `login:info`, `login:avatar`.
2. Создайте JSON-ключ сервисного аккаунта Firebase с правами Firebase Authentication Admin и Cloud Datastore User. Не добавляйте ключ в репозиторий: доступ к Firestore нужен функции для безопасного соответствия Яндекс ID → Firebase UID.
3. Перед деплоем функции задайте секреты только в текущей PowerShell-сессии:

```powershell
$env:SYNC_YANDEX_CLIENT_ID='идентификатор-приложения'
$env:SYNC_YANDEX_CLIENT_SECRET='секрет-приложения'
$env:SYNC_FIREBASE_SERVICE_ACCOUNT_PATH='C:\secure\firebase-service-account.json'
./scripts/deploy-yandex-auth.ps1
```

4. Скрипт вернёт `redirectUri`. Добавьте его в Яндекс OAuth как точный Redirect URI.
5. Запишите выведенную строку `VITE_YANDEX_AUTH_URL=...` в `.env.local` и перезапустите Vite. Для production передайте эту же переменную на этапе сборки frontend.

OAuth-код и секрет Яндекса обрабатываются только в Yandex Cloud Function. В браузер возвращается одноразовый Firebase custom token через проверенный `postMessage`; OAuth-токен Яндекса в URL приложения и хранилище браузера не попадает.

## Серверное погашение приглашений

Приватное приглашение погашается только функцией `serverless/room-invites`: она проверяет Firebase ID token, SHA-256 хеш bearer-токена, срок, лимит использований и бан, после чего одной Firestore-транзакцией увеличивает `uses` и создаёт membership с ролью `member`. Исходный токен доступен только управляющим комнатой в `roomInviteSecrets`; публичный preview хранит только его хеш.

Функция использует Firebase service account из существующего Lockbox-секрета `lw-music-yandex-auth` и разворачивается командой:

```powershell
./scripts/deploy-room-invites.ps1
```

Запишите выведенную строку `VITE_ROOM_INVITE_API_URL=...` в `.env.local` или в production-окружение сборки frontend. Интеграционная проверка функции запускается командой `pnpm verify:room-invite-function`.

## Как проверить синхронизацию локально

1. Запустите `pnpm dev` и авторизуйтесь.
2. Откройте одну и ту же комнату в двух окнах. Второе окно удобно открыть в режиме инкогнито или в другом браузере, чтобы при желании войти другой учётной записью.
3. В первом окне откройте `http://localhost:5173/rooms/demo-room?role=host`.
4. Во втором — `http://localhost:5173/rooms/demo-room?role=viewer`.
5. В окне очереди вставьте ссылку RUTUBE или найдите клип по названию и добавьте его.
6. Проверьте автоматический запуск у обоих участников. Коррекция позиции выполняется при расхождении больше 1,5 секунды.

Идентификатор комнаты в обеих ссылках должен совпадать. Две обычные вкладки тоже подходят: для проверки плеера пользователи не обязаны иметь разные UID.

Слушатель запускается без звука из-за политики autoplay браузеров. Звук включается отдельной кнопкой после первого пользовательского действия.

## Модель данных

```text
users/{uid}
  avatar:
    type: "preset" | "custom" | "provider" | "none"
    presetId: string | null
    storagePath: string | null
  displayName: string
  email: string
  onboardingCompleted: boolean
  photoURL: string | null
  createdAt: timestamp
  updatedAt: timestamp

rooms/{roomId}
  categories: Category[]
  imagePath: string
  imageUrl: string
  name: string
  nameKey: string
  ownerId: uid
  visibility: "public" | "unlisted" | "private"
  status: "active" | "archived"
  settings:
    allowGuestChat: boolean
    allowGuestQueue: boolean
    slowModeSeconds: integer
  createdAt: timestamp
  updatedAt: timestamp

rooms/{roomId}/members/{uid}
  invitedBy: uid | null
  isGuest: boolean
  joinedAt: timestamp
  role: "owner" | "host" | "moderator" | "member"
  status: "active" | "left"

rooms/{roomId}/bans/{uid}
  bannedBy: uid
  reason: string
  expiresAt: timestamp | null
  createdAt: timestamp

rooms/{roomId}/mutes/{uid}
  mutedBy: uid
  expiresAt: timestamp | null
  reason: string

roomInvites/{inviteId}
  roomId: string
  createdBy: uid
  expiresAt: timestamp
  maxUses: integer
  participantCount: integer
  roomImageUrl: string
  roomName: string
  tokenHash: sha256(inviteToken)
  uses: integer
  revokedAt: timestamp | null
  createdAt: timestamp

roomInviteSecrets/{tokenHash}
  roomId: string
  createdBy: uid
  token: string
  tokenHash: sha256(token)
  createdAt: timestamp

users/{uid}/blockedUsers/{blockedUid}
  createdAt: timestamp

rooms/{roomId}/playback/current
  videoId: string
  status: "playing" | "paused"
  positionSeconds: number
  changedAt: timestamp
  changedBy: uid
  revision: integer

rooms/{roomId}/messages/{messageId}
  authorId: uid
  authorName: string
  authorPhotoURL: string | null
  text: string (1–1000 символов)
  createdAt: timestamp
  expiresAt: timestamp (createdAt + 24 часа)

reports/{reportId}
  reporterId: uid
  targetType: "user" | "message" | "room" | "cover" | "nickname"
  targetId: string
  roomId: string
  reason: string
  comment: string
  snapshot: map
  status: "new" | "reviewing" | "resolved" | "rejected"
  createdAt: timestamp

moderationLogs/{logId}
  action: "message_deleted"
  actorId: uid
  roomId: string
  messageId: string
  original: map
  createdAt: timestamp
```

Имя и аватар сохраняются в сообщении как снимок профиля на момент отправки.
Пять встроенных аватаров лежат в `public/avatars` и сохраняются в профиле как
стабильные URL вида `/avatars/pulse.svg`. Пользовательские аватары и обложки
комнат загружаются в Yandex Object Storage через одну авторизованную serverless-
функцию; в Firestore хранятся публичный URL и объектный путь.
Клиент запрашивает документы не старше суток по `createdAt desc` с `limit(50)`,
а перед отрисовкой разворачивает их в хронологический порядок. Новые сообщения
приходят через realtime-подписку `onSnapshot`; локальный таймер скрывает каждое
сообщение ровно через сутки. Сервер записывает `expiresAt`, а часовой таймер
Yandex Cloud вызывает закрытую функцию `serverless/message-cleanup`, которая
пакетно удаляет просроченные документы.

RUTUBE-видеопоток через Firebase не передаётся. Каждый браузер загружает ролик напрямую во встроенном плеере RUTUBE, а Firestore хранит только небольшое общее состояние. Для состояния `playing` ожидаемая позиция вычисляется как сохранённая позиция плюс время, прошедшее после серверной метки `changedAt`.

Поиск треков в окне очереди выполняет `serverless/room-management` через публичный поиск RUTUBE. Развёртывание не требует отдельного API-ключа:

```powershell
./scripts/deploy-room-management.ps1
```

Поиск запускается только по кнопке или Enter, возвращает до пяти клипов и кэширует одинаковые запросы на 30 минут. Музыкальный фильтр оставляет категории «Музыка» и «Аудио». Функция отбрасывает платный, скрытый, возрастной и прямой эфирный контент. Прямая ссылка или идентификатор RUTUBE перед добавлением также проверяются через данные плеера.

Запись выполняется транзакцией с последовательным увеличением `revision`. События, вызванные удалённой синхронизацией, временно не отправляются обратно, чтобы не возникал цикл play/pause.

Доступ к содержимому комнаты получают только активные участники. Публичные комнаты показываются в общем списке, скрытые открываются по прямой постоянной ссылке, приватные — активным участникам или по действующему приглашению. Каталог запрашивает только `public`-комнаты, сортирует их по `createdAt desc` и загружает по 20 документов через cursor-пагинацию. `roomId` не считается секретом: приватные данные защищены membership-проверками Firestore Rules. Владелец получает membership при создании комнаты. Invite-документ хранит минимальный публичный preview комнаты, поэтому экран ссылки может показать название, обложку и число участников до авторизации. Приглашение ограничивается сроком и числом активаций и может быть отозвано. После нажатия «Присоединиться» новый пользователь входит через Firebase Anonymous Auth, выбирает никнейм и базовый аватар, а затем атомарно получает роль `member`.

Приватные приглашения принимаются атомарно серверной функцией: транзакция увеличивает `uses` и создаёт membership с ролью `member`; клиентские Firestore Rules запрещают выполнить эти записи напрямую. Создание комнат (не больше 10 на владельца), создание/отзыв приглашений и отправка сообщений также выполняются через `serverless/room-management`, поэтому лимиты нельзя обойти прямой записью в Firestore. Для приглашений разрешено не больше 10 активных ссылок и 5 новых ссылок за 10 минут.

Антиспам чата применяет базовый интервал 2 секунды для обычного пользователя и 5 секунд для гостя, не больше 5 сообщений за 20 секунд, максимум 2 ссылки, запрет повтора за последние 2 минуты, owner slow mode и 15-секундную задержку гостя после входа. Баны закрывают чтение и участие в комнате, муты запрещают отправку сообщений. Пользовательские блокировки скрывают сообщения автора только на клиенте, не удаляя совместное присутствие.

Сообщения хранятся сутки. Новая версия `room-management` записывает серверное
поле `expiresAt`, а Yandex Cloud Timer раз в час запускает закрытую функцию
очистки. Перед включением таймера существующим сообщениям нужно один раз добавить
это поле:

```powershell
pnpm migrate:message-retention -- --project lwmusic-ffe83 --firebase-cli-auth
./scripts/deploy-room-management.ps1
pnpm migrate:message-retention -- --project lwmusic-ffe83 --firebase-cli-auth --apply
./scripts/deploy-message-cleanup.ps1
pnpm build
pnpm exec firebase deploy --only firestore:rules,firestore:indexes,hosting --project lwmusic-ffe83
```

Первая команда — dry run и ничего не записывает. Для рабочего результата нужны
новая версия серверной функции, миграция текущих документов, публикация
collection-group индекса `expiresAt`, часовой таймер очистки и обновлённый клиент.

Жалобы на пользователя, сообщение, комнату, обложку и никнейм создаёт только сервер. Он сам читает объект и сохраняет неизменяемый снимок в закрытом `reports`; клиент не может подменить снимок или прочитать жалобы. Серверное удаление сообщения сначала копирует оригинал в закрытый `moderationLogs`, затем удаляет публичный документ.

При «Сохранить профиль» email/password связываются через Firebase `linkWithCredential`. Для Яндекс ID функция сначала проверяет ID token текущего anonymous-пользователя, подписывает OAuth state и сохраняет серверное соответствие Яндекс ID → прежний Firebase UID в `authProviderLinks`. Обновление frontend без повторного развёртывания `serverless/yandex-auth` не включит этот сценарий для Яндекс ID.

Старые комнаты проверяются dry-run миграцией:

```powershell
pnpm migrate:room-model -- --project lwmusic-ffe83 --firebase-cli-auth
```

Для применения нужны Application Default Credentials, `FIREBASE_SERVICE_ACCOUNT_JSON` или флаг `--firebase-cli-auth` с активной сессией Firebase CLI. Режим `--apply` требует обязательный путь `--backup`; при любых предупреждениях запись отменяется:

```powershell
pnpm migrate:room-model -- --project lwmusic-ffe83 --firebase-cli-auth --apply --backup .migration-backups/room-model-before.json
```

### Безопасные границы профилей и realtime-комнат

`users/{uid}` содержит приватный профиль с email и читается только владельцем.
Публичные поля для участников комнаты хранятся отдельно в
`userProfiles/{uid}`. Доступ к `roomPresence` и `roomReactions` проверяется по
закрытому RTDB-индексу `roomAccess`: сервер выдаёт активному участнику
двухминутный lease, синхронизирует видимость/статус комнаты и немедленно
отзывает lease при выходе, кике или бане. Membership остаётся постоянным
Firestore-документом со статусом `active`/`left`, а соединения presence и реакции
не используются как признак участия. Архивация комнаты очищает все временные
RTDB-данные и запрещает чтение даже по ещё не истёкшему lease.
Явный выход выполняет только `room-management`: одной Firestore-транзакцией он
переводит membership в `left`, удаляет запись пользователя из очереди и затем
идемпотентно очищает его lease, presence и реакцию.

Перед публикацией новых rules нужно сначала развернуть обновлённую
`room-management` function, затем выполнить dry run миграции:

```powershell
pnpm migrate:security-boundaries -- --project lwmusic-ffe83 --database-url https://lwmusic-ffe83-default-rtdb.europe-west1.firebasedatabase.app --firebase-cli-auth
```

Применение требует backup и также подготавливает RTDB ACL для существующих
комнат. Команда не запускается автоматически:

```powershell
pnpm migrate:security-boundaries -- --project lwmusic-ffe83 --database-url https://lwmusic-ffe83-default-rtdb.europe-west1.firebasedatabase.app --firebase-cli-auth --apply --backup .migration-backups/security-boundaries-before.json
```

После успешного backfill правила Firestore и Realtime Database публикуются
вместе, а frontend выкладывается сразу после них. До завершения всех этих шагов
новый клиент и опубликованные правила могут быть несовместимы; выпуск следует
считать единым изменением.

### Индекс «Моих комнат»

Раздел «Мои комнаты» объединяет комнаты с `ownerId == uid` и документы активного
membership из collection group `members`. Для безопасного collection-group
запроса новые membership-документы содержат совпадающий с id документа `userId`.
Старые документы остаются допустимыми для обратной совместимости и обновляются
при следующем входе пользователя; полный backfill выполняется отдельной
миграцией. Сначала запустите dry run:

```powershell
pnpm migrate:room-membership-index -- --project lwmusic-ffe83 --firebase-cli-auth
```

Применение требует backup и не запускается автоматически:

```powershell
pnpm migrate:room-membership-index -- --project lwmusic-ffe83 --firebase-cli-auth --apply --backup .migration-backups/room-membership-index-before.json
```

Для выпуска как единого изменения нужны обновлённые `room-management` и
`room-invites`, успешный backfill, Firestore/RTDB rules и Firestore indexes, затем
frontend. Архивные комнаты показываются только в «Моих комнатах», а общий каталог
запрашивает лишь активные публичные комнаты.

### Firebase App Check

Web-клиент инициализирует App Check через reCAPTCHA Enterprise с автоматическим
обновлением токена. Firestore и Realtime Database получают токен через Firebase
SDK; запросы к `room-management`, `room-invites` и media upload передают тот же
токен в `X-Firebase-AppCheck`. Общая серверная проверка поддерживает безопасный
rollout через `monitor` и `enforce`, а отключение разрешено только для локального
`demo-*` Emulator Suite.

Production enforcement в репозитории не включается. Полная матрица endpoint'ов,
настройка локального debug token, порядок observability → enforcement, тесты и
откат описаны в [docs/firebase-app-check-rollout.md](docs/firebase-app-check-rollout.md).

## Наблюдаемость и аналитика

Клиентский Error Boundary, privacy-safe Sentry adapter, request correlation,
структурированные serverless logs и consent-gated Firebase Analytics описаны в
[docs/observability.md](docs/observability.md). Оба внешних канала выключены по
умолчанию; test/CI никогда не инициализирует SDK и не отправляет события.

Быстрые проверки:

```bash
pnpm test:observability
pnpm verify:observability
pnpm verify:serverless-bundles
pnpm build
pnpm verify:production-artifact
```

## Следующие этапы

1. Добавить закрытую панель рассмотрения жалоб со сменой статусов и поиском по нарушителю.
2. После отдельного подтверждения пройти поэтапный App Check rollout из документации и только затем включать enforcement.
3. При необходимости добавить словарь запрещённых слов как дополнительный сигнал, не заменяя rate limit и модерацию.
