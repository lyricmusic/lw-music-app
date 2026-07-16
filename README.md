# LW Music

Комнаты для совместного просмотра и прослушивания музыки. Пользователь входит в аккаунт, выбирает комнату, а YouTube-плеер синхронизирует ролик, воспроизведение, паузу и перемотку между участниками.

## Что уже работает

- Firebase Authentication: регистрация и вход по e-mail/паролю, вход через Google, восстановление сессии и выход.
- Профили пользователей в Cloud Firestore (`users/{uid}`).
- Защищённые маршруты комнат.
- YouTube IFrame Player API без отдельного backend и Socket.IO.
- Синхронизация плеера через snapshot документа Cloud Firestore.
- Режимы ведущего и слушателя для локальной проверки.
- Firestore Security Rules для профилей, комнат и состояния плеера.
- Firebase Hosting rewrite для SPA-маршрутов.

## Локальный запуск

Нужен Node.js 20.19 или новее.

```bash
npm install
npm run dev
```

Для быстрой проверки только YouTube-плеера без входа и Firestore в dev-режиме доступен `http://localhost:5173/__player-smoke`. В production-сборке этого маршрута нет.

Проверки перед коммитом:

```bash
npm run lint
npm run build
```

## Применение Firestore Rules

Код плеера пишет состояние в `rooms/{roomId}/playback/current`. До проверки синхронизации нужно один раз опубликовать актуальный файл `firestore.rules`:

```bash
npx firebase-tools login
npx firebase-tools use lwmusic-ffe83
npx firebase-tools deploy --only firestore:rules
```

В репозитории уже указан проект `lwmusic-ffe83`. Web-конфигурация из `src/firebase.ts` используется как fallback; для другого проекта скопируйте `.env.example` в `.env.local` и заполните переменные.

В Firebase Console должны быть включены Authentication → Email/Password и, если нужен такой способ входа, Google. Firestore Database должна быть создана.

## Как проверить синхронизацию локально

1. Запустите `npm run dev` и авторизуйтесь.
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
  displayName: string
  email: string
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
```

YouTube-видеопоток через Firebase не передаётся. Каждый браузер загружает ролик напрямую с YouTube, а Firestore хранит только небольшое общее состояние. Для состояния `playing` ожидаемая позиция вычисляется как сохранённая позиция плюс время, прошедшее после серверной метки `changedAt`.

Запись выполняется транзакцией с последовательным увеличением `revision`. События, вызванные удалённой синхронизацией, временно не отправляются обратно, чтобы не возникал цикл play/pause.

Текущая роль ведущего — режим MVP для разработки: любой авторизованный клиент технически может записать корректное состояние плеера. Следующий этап — коллекции `members` и `queue`, назначение `controllerUid` транзакцией и проверка контроллера в Security Rules.

## Следующие этапы

1. Реализовать участников комнаты и очередь роликов.
2. Ограничить запись playback только активным участником очереди.
3. Добавить online presence через Firebase Realtime Database и `onDisconnect`.
4. Перенести обложки и аватары в Firebase Storage.
5. Добавить Firebase Emulator Suite и автоматические тесты Security Rules.
6. Включить App Check перед публичным запуском.
