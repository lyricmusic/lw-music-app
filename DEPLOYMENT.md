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
   pnpm verify:static
   pnpm test:observability
   pnpm verify:observability
   pnpm verify:serverless-bundles
   pnpm verify:emulators:windows
   pnpm exec vite -- build --mode development
   pnpm build
   pnpm verify:production-artifact
   pnpm verify:performance
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
./scripts/deploy-room-invites.ps1 -Environment dev -AppCheckMode monitor
./scripts/deploy-room-management.ps1 -Environment dev -AppCheckMode monitor
./scripts/deploy-yandex-storage.ps1 -Environment dev -AppCheckMode monitor
```

После деплоя сверить выведенные URL с `.env.development`. Для функции загрузки
обложек значение `functionUrl` записывается в `VITE_MEDIA_UPLOAD_URL`. Если URL
изменился, обновить env-файл и повторить обе сборки.

`monitor` проверяет App Check token и пишет структурированные метрики, но не
отклоняет старые вкладки и клиент без токена. `enforce` разрешено включать отдельно
для каждой функции только после регистрации provider, выпуска клиента с
`VITE_FIREBASE_APPCHECK_SITE_KEY` и проверки доли valid-запросов. Firestore и
Realtime Database enforcement включаются отдельно в Firebase Console и также
требуют явного подтверждения. Полный порядок и debug-token настройка описаны в
`docs/firebase-app-check-rollout.md`.

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

### Observability и analytics rollout

Оба канала по умолчанию выключены. Их включение не является частью обычного
деплоя и требует отдельного решения после проверки
[`docs/observability.md`](docs/observability.md).

Для Sentry в GitHub Repository Variables задаются публичный `SENTRY_DSN`,
`SENTRY_ORG`, `SENTRY_PROJECT` и `ERROR_MONITORING_ENABLED=true`.
`SENTRY_AUTH_TOKEN` хранится только в GitHub Actions Secrets и получает
минимальные права release/source-map upload. Токен нельзя передавать через
`VITE_*`, Lockbox output, логи или Markdown. CI verify не требует этих значений.

Production workflow сам задаёт `VITE_RELEASE=syncly@<git-sha>`. При включённом
monitoring отсутствие release/upload credentials должно остановить build.
После build обязательно выполнить `pnpm verify:production-artifact`: в `dist`
не должно быть `*.map` и `sourceMappingURL`. Sentry Vite plugin сначала загружает
hidden maps, затем удаляет их; release scripts дополнительно отказываются
публиковать архив с map-файлами.

Для продуктовой аналитики используются две Repository Variables:
`PRODUCT_ANALYTICS_ENABLED=true` и `PRODUCT_ANALYTICS_PRIVACY_CONFIRMED=true`.
Вторую ставить только после отключения Enhanced Measurement в GA4 web stream и
проверки отсутствия route/query/hash/referrer по `docs/observability.md`. Одна
переменная не включает канал. Эти флаги только включают consent UI. Firebase
Analytics начинает загружаться и отправлять allowlisted события после явного
нажатия пользователя «Разрешить»; отсутствие выбора не является согласием.
Session replay, запись ввода и рекламные consent types не включать.

### Frontend performance, cache и старые вкладки

`pnpm build` создаёт `dist/.vite/manifest.json`, а `pnpm verify:performance`
проверяет стартовый и маршрутные JS-графы, CSS, общий artifact и auth-фон по
`performance-budgets.json`. Проверка локальная: ей не нужны production secrets,
она не инициализирует Sentry/Firebase Analytics и ничего не отправляет наружу.

Конфигурация `deploy/nginx/syncly.lyricweb.ru.conf` обязана сохранять:

- `Cache-Control: public, max-age=31536000, immutable` для `/assets/`;
- `Cache-Control: no-cache` для `index.html` и SPA fallback;
- недельный cache для стабильных `/avatars/`, но без `immutable`;
- gzip для JavaScript, CSS, JSON, SVG и текстовых ответов.

Не добавлять service worker или ручной prefetch всех маршрутов без отдельного
измерения на медленной мобильной сети. Release scripts сохраняют только assets
непосредственно предыдущего релиза. Клиент обрабатывает `vite:preloadError` и
может перезагрузить текущий URL не больше одного раза; это дополняет, но не
заменяет HTML `no-cache` и one-release compatibility window.

После разрешённого deployment проверить реальные заголовки и content encoding:

```bash
curl -I https://syncly.lyricweb.ru/
curl -I https://syncly.lyricweb.ru/assets/<current-hashed-chunk>.js
curl -I -H 'Accept-Encoding: gzip' https://syncly.lyricweb.ru/assets/<current-hashed-chunk>.js
```

У корневого HTML ожидается `Cache-Control: no-cache`, у хешированного asset —
годовой immutable cache, а при поддержке gzip — `Content-Encoding: gzip` и
`Vary: Accept-Encoding`.

При serverless deployment скрипты автоматически ставят `RELEASE` из текущего
Git commit. После smoke test найти одинаковый `X-Request-ID` в response и
структурированном function log; body, URL, UID, invite/token и raw error message
в записи отсутствуют.

1. Повторить lint, TypeScript и production build.
2. Проверить `.env.production`: он должен указывать только на
   `lwmusic-ffe83` и production URL функций.
3. Если менялись серверные функции, развернуть только нужные функции с явным
   production-флагом:

   ```powershell
   ./scripts/deploy-yandex-auth.ps1 -Environment prod
   ./scripts/deploy-room-invites.ps1 -Environment prod -AppCheckMode monitor
   ./scripts/deploy-room-management.ps1 -Environment prod -AppCheckMode monitor
   ./scripts/deploy-yandex-storage.ps1 -Environment prod -AppCheckMode monitor
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
