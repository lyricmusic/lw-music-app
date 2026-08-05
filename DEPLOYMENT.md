# Памятка по деплою Syncly

Этот файл — обязательный чек-лист для Codex и разработчиков. Перед любым
деплоем сначала определить целевое окружение и не смешивать ресурсы `dev` и
`prod`.

## Окружения

| Окружение   | Firebase alias    | Firebase project    | Vite-конфигурация  | Yandex-скрипты                               |
| ----------- | ----------------- | ------------------- | ------------------ | -------------------------------------------- |
| Development | `dev` и `default` | `lwmusic-dev-ffe83` | `.env.development` | `-Environment dev` или значение по умолчанию |
| Production  | `prod`            | `lwmusic-ffe83`     | `.env.production`  | только с явным `-Environment prod`           |

Главное правило: production всегда указывать явно. Не менять `default` на
production и не копировать Firebase Admin credentials между окружениями.

Публичная Firebase Web SDK конфигурация и URL функций хранятся в отслеживаемых
env-файлах. Firebase Admin credentials, OAuth client secret и ключи Object
Storage должны оставаться только в Yandex Lockbox. Секреты нельзя записывать в
репозиторий, логи, Markdown или сообщения.

## Перед деплоем

1. Проверить целевую ветку и изменения:

   ```powershell
   git status --short
   git diff --check
   ```

2. Установить зависимости и выполнить обязательные проверки:

   ```powershell
   pnpm install --frozen-lockfile
   pnpm lint
   pnpm exec tsc -- --noEmit --pretty false
   pnpm exec vite -- build --mode development
   pnpm build
   ```

3. Для изменений Firestore или Realtime Database запускать относящиеся к ним
   проверки. В частности, при изменениях очереди обязательно выполнить:

   ```powershell
   pnpm verify:queue-rules
   ```

4. Если добавлены, удалены или переименованы поля, документы, коллекции либо
   клиентские записи Firestore, одновременно проверить `firestore.rules`.
   Новая клиентская запись должна быть разрешена правилами до релиза.

5. Если изменена схема данных, сначала выполнить миграцию в режиме dry-run.
   Применять миграцию только с резервной копией и после проверки результата.

6. Для ручного деплоя убедиться, что CLI авторизованы в нужных аккаунтах:

   ```powershell
   pnpm exec firebase login:list
   yc config list
   ```

   На новом устройстве локальные ключи добавлять не нужно. Может понадобиться
   только один раз выполнить `firebase login` и `yc init` — это авторизация
   пользователя на устройстве, а не перенос секретов проекта.

## Деплой в dev

Сначала всегда проверять изменения в `dev`.

### Firebase rules, indexes и Realtime Database rules

```powershell
pnpm exec firebase deploy --only firestore:rules,firestore:indexes,database --project dev
```

В выводе Firebase должны присутствовать успешная компиляция правил и успешный
release. Не считать Firestore-функциональность рабочей, пока клиент и
опубликованные rules не синхронизированы.

### Yandex Cloud functions

Запускать только скрипты изменённых функций. Для полного dev-деплоя порядок
такой:

```powershell
./scripts/deploy-yandex-auth.ps1 -Environment dev
./scripts/deploy-room-invites.ps1 -Environment dev
./scripts/deploy-room-management.ps1 -Environment dev
./scripts/deploy-yandex-storage.ps1 -Environment dev
```

После деплоя сверить выведенные URL с `.env.development`. Для функции загрузки
обложек значение `functionUrl` записывается в `VITE_MEDIA_UPLOAD_URL`. Если URL
изменился, обновить env-файл и повторить обе сборки.

### Smoke test dev

1. Запустить `pnpm dev`.
2. Зарегистрироваться или войти в dev.
3. Создать комнату с обложкой.
4. Открыть комнату и проверить присутствие, очередь, чат и приглашения.
5. Убедиться, что созданный room ID существует в `lwmusic-dev-ffe83` и
   отсутствует в `lwmusic-ffe83`.
6. Проверить, что production-сборка не содержит строку
   `lwmusic-dev-ffe83`.

## Деплой в production

Production-деплой выполнять только после успешного dev smoke test и отдельного
явного подтверждения пользователя на внешнее production-изменение.

1. Повторить lint, TypeScript и production build.
2. Проверить `.env.production`: он должен указывать только на
   `lwmusic-ffe83` и production URL функций.
3. Если менялись серверные функции, развернуть только нужные функции с явным
   production-флагом:

   ```powershell
   ./scripts/deploy-yandex-auth.ps1 -Environment prod
   ./scripts/deploy-room-invites.ps1 -Environment prod
   ./scripts/deploy-room-management.ps1 -Environment prod
   ./scripts/deploy-yandex-storage.ps1 -Environment prod
   ```

4. Если менялись Firebase rules или indexes, опубликовать их только с явным
   alias:

   ```powershell
   pnpm exec firebase deploy --only firestore:rules,firestore:indexes,database --project prod
   ```

5. Зафиксировать все проверенные изменения одним понятным коммитом и отправить
   их напрямую в `develop`, если пользователь явно подтвердил push. Push в
   `develop` запускает `.github/workflows/build-develop.yml`: workflow повторно
   выполняет lint/build и публикует frontend на сервер.

6. Дождаться успешного завершения GitHub Actions. Не считать релиз завершённым,
   если backend уже обновлён, а frontend workflow завершился ошибкой.

## Проверка после production-деплоя

1. Открыть `https://syncly.lyricweb.ru`.
2. Проверить вход, список комнат, создание комнаты, загрузку обложки и вход в
   комнату минимум на desktop и mobile viewport.
3. Проверить, что новые записи появляются только в production Firebase.
4. Проверить логи изменённых Yandex-функций и отсутствие ошибок CORS, `401`,
   `403` и `5xx`.
5. Зафиксировать результат компиляции/release Firebase rules и статус GitHub
   Actions в итоговом отчёте.

## Откат

- Frontend: сделать `git revert` проблемного коммита и после явного разрешения
  отправить revert в `develop`.
- Yandex-функции: повторно развернуть проверенную предыдущую версию исходников
  в том же окружении.
- Firebase rules/indexes: восстановить предыдущую версию из Git и опубликовать
  её с явным `--project dev` или `--project prod`.
- Не удалять production-данные и не запускать обратные миграции без отдельного
  плана восстановления и явного подтверждения.
