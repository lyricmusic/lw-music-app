# LW Music

Комнаты для совместного просмотра и прослушивания музыки. Пользователь входит в аккаунт, выбирает комнату, а YouTube-плеер синхронизирует ролик, воспроизведение, паузу и перемотку между участниками.

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
`/rooms/:roomId`.

## Что уже работает

- Firebase Authentication: регистрация и вход по e-mail/паролю, вход через Google, восстановление сессии и выход.
- Профили пользователей и обязательный онбординг после регистрации в Cloud Firestore (`users/{uid}`).
- Все пользовательские формы работают через React Hook Form; для текущих простых правил отдельный слой Zod не используется.
- Защищённые маршруты комнат.
- YouTube IFrame Player API без отдельного backend и Socket.IO.
- Синхронизация плеера через snapshot документа Cloud Firestore.
- Чат комнаты: realtime-подписка на последние 50 сообщений Firestore.
- Режимы ведущего и слушателя для локальной проверки.
- Firestore Security Rules для профилей, комнат и состояния плеера.
- Firebase Hosting rewrite для SPA-маршрутов.

## Локальный запуск

Нужен Node.js 20.19 или новее.

```bash
pnpm install
pnpm dev
```

Для быстрой проверки только YouTube-плеера без входа и Firestore в dev-режиме доступен `http://localhost:5173/__player-smoke`. В production-сборке этого маршрута нет.

Проверки перед коммитом:

```bash
pnpm lint
pnpm build
```

## Применение Firestore Rules

Код плеера пишет состояние в `rooms/{roomId}/playback/current`. До проверки синхронизации нужно один раз опубликовать актуальный файл `firestore.rules`:

```bash
pnpm dlx firebase-tools login
pnpm dlx firebase-tools use lwmusic-ffe83
pnpm dlx firebase-tools deploy --only firestore:rules
```

В репозитории уже указан проект `lwmusic-ffe83`. Web-конфигурация из `src/shared/api/firebase` используется как fallback; для другого проекта скопируйте `.env.example` в `.env.local` и заполните переменные.

В Firebase Console должны быть включены Authentication → Email/Password и, если нужен такой способ входа, Google. Firestore Database должна быть создана.

## Как проверить синхронизацию локально

1. Запустите `pnpm dev` и авторизуйтесь.
2. Откройте одну и ту же комнату в двух окнах. Второе окно удобно открыть в режиме инкогнито или в другом браузере, чтобы при желании войти другой учётной записью.
3. В первом окне откройте `http://localhost:5173/rooms/demo-room?role=host`.
4. Во втором — `http://localhost:5173/rooms/demo-room?role=viewer`.
5. В окне ведущего вставьте ссылку YouTube и нажмите «Запустить».
6. Проверьте запуск, паузу и перемотку. Слушатель должен повторить состояние; коррекция позиции выполняется при расхождении больше 1,5 секунды.

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
```

Имя и аватар сохраняются в сообщении как снимок профиля на момент отправки.
Пять встроенных аватаров лежат в `public/avatars` и сохраняются в профиле как
стабильные URL вида `/avatars/pulse.svg`. Пользовательские аватары и обложки
комнат загружаются в Yandex Object Storage через одну авторизованную serverless-
функцию; в Firestore хранятся публичный URL и объектный путь.
Клиент запрашивает документы по `createdAt desc` с `limit(50)`, а перед
отрисовкой разворачивает их в хронологический порядок. Новые сообщения приходят
через realtime-подписку `onSnapshot`; отдельный составной индекс для этого
запроса не нужен.

YouTube-видеопоток через Firebase не передаётся. Каждый браузер загружает ролик напрямую с YouTube, а Firestore хранит только небольшое общее состояние. Для состояния `playing` ожидаемая позиция вычисляется как сохранённая позиция плюс время, прошедшее после серверной метки `changedAt`.

Запись выполняется транзакцией с последовательным увеличением `revision`. События, вызванные удалённой синхронизацией, временно не отправляются обратно, чтобы не возникал цикл play/pause.

Текущая роль ведущего — режим MVP для разработки: любой авторизованный клиент технически может записать корректное состояние плеера. Следующий этап — коллекции `members` и `queue`, назначение `controllerUid` транзакцией и проверка контроллера в Security Rules.

## Следующие этапы

1. Реализовать участников комнаты и очередь роликов.
2. Ограничить запись playback только активным участником очереди.
3. Добавить online presence через Firebase Realtime Database и `onDisconnect`.
4. Добавить удаление старого пользовательского аватара при его замене.
5. Добавить Firebase Emulator Suite и автоматические тесты Security Rules.
6. Включить App Check перед публичным запуском.
