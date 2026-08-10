# Оптимизация production-загрузки Syncly

Дата измерений: 10 августа 2026 года. Baseline снят с `origin/develop` на
`31e95b3cc055b12aa7d7a414f4ea2b44012d9e4c`, до изменений исходников.

## Границы изменения

- Пользовательская логика, URLs, guest auth, invite deep links и Firebase
  Security Rules не менялись.
- App Check provider и передача токенов не менялись. Firestore/Realtime
  Database enforcement остаётся вне репозитория и не включается этой работой.
- Sentry release tags и hidden source-map upload/remove схема сохранены.
- Новых внешних сервисов, secrets, telemetry и production deployment нет.

## Методика

Использовались Vite 8.1.5, pnpm 10.13.1 и production mode. CI закреплён на
Node.js 22.22.0; локальный desktop runtime сообщил Node.js 22.14.0, поэтому
финальным источником совместимости остаются CI и Docker с 22.22.0.

`scripts/verify-performance-budgets.mjs` читает Vite manifest и считает:

- initial application graph: HTML entry и безусловный `App` static closure;
- cold route graph и его инкремент поверх initial graph;
- raw, gzip level 9 и Brotli quality 11 для JS/CSS;
- largest JS, общий JS, auth background и полный artifact inventory.

Fonts разделены `unicode-range`, поэтому manifest inventory не означает
одновременную загрузку всех начертаний. Public animated avatars учитываются в
artifact, но загружаются браузером только выбранными room-компонентами.

## Результат

| Метрика                 |           До |        После | Изменение |
| ----------------------- | -----------: | -----------: | --------: |
| Initial JS raw          |  1,561,815 B |  1,005,414 B |    −35.6% |
| Initial JS gzip         |    483,588 B |    310,455 B |    −35.8% |
| Initial JS Brotli       |    412,255 B |    263,591 B |    −36.1% |
| Largest JS raw          |    696,652 B |    461,828 B |    −33.7% |
| Largest JS gzip         |    203,231 B |    133,770 B |    −34.2% |
| Total JS raw            |  1,667,560 B |  1,672,936 B |     +0.3% |
| Total JS gzip           |    522,650 B |    530,754 B |     +1.6% |
| CSS gzip                |     10,775 B |     10,820 B |     +0.4% |
| Auth background gzip    |  1,038,122 B |    159,860 B |    −84.6% |
| Production artifact raw | 12,193,485 B | 11,076,776 B |     −9.2% |

Небольшой рост total JS — ожидаемая цена явных lazy boundaries и recovery
кода. Он не попадает целиком в стартовую загрузку: Sentry, Firestore profile,
Realtime Database, authenticated layout и route UI запрашиваются по фактической
ветке выполнения.

### Cold route JavaScript (gzip)

| Маршрут       |        До |     После | Изменение |
| ------------- | --------: | --------: | --------: |
| Invite join   | 486,610 B | 418,009 B |    −14.1% |
| Not found     | 484,028 B | 310,896 B |    −35.8% |
| Room          | 489,805 B | 448,966 B |     −8.3% |
| Rooms catalog | 504,811 B | 423,616 B |    −16.1% |
| Sign in       | 484,996 B | 362,958 B |    −25.2% |
| Sign up       | 484,998 B | 362,960 B |    −25.2% |

Auth background не входит в JS-таблицу: на sign-in/sign-up дополнительно
передаётся 159,860 B gzip вместо прежних 1,038,122 B.

### Build timings

Baseline после установки lockfile-зависимостей: TypeScript 20.705 s, Vite
2.466 s по внешнему stopwatch (1.25 s по внутреннему Vite timer), всего
23.171 s. Финальный повторный `pnpm build` в тёплом локальном кэше занял
1.875 s, Vite сообщил 0.899 s. Полное время нельзя считать строгим benchmark
из-за разного состояния TypeScript/filesystem cache; сопоставимая Vite-фаза
ускорилась примерно на 28%.

## Что изменено

- Production dev-smoke UI вынесен за условную dynamic boundary.
- Authenticated layout и onboarding dialog загружаются только для совпавших
  защищённых/room маршрутов и незавершённого профиля.
- Firebase app/auth, Firestore и Realtime Database разделены по модульным entry
  points; профильная Firestore-подписка загружается после обнаружения auth user.
- Guest sign-in отделён от полного email/Yandex/profile auth модуля.
- Sentry SDK загружается только при полном production monitoring config; узкий
  adapter сохраняет tree shaking. Analytics остаётся consent-gated dynamic import.
- Встроенный непрозрачный PNG auth-фона заменён визуально эквивалентным JPEG
  quality 92 внутри того же SVG-контейнера и URL.
- Vite manifest, budgets и CI verification добавлены без внешних plugins.
- Nginx явно включает gzip, immutable cache для hashed assets, `no-cache` для
  HTML/SPA fallback и ограниченный cache для публичных avatars.
- `vite:preloadError` дополняет существующий одноразовый lazy-route reload и
  one-release asset compatibility. Service worker отсутствует.

## Аудит без изменения

- React, React DOM, Firebase, Emotion и MUI не дублируются в dependency graph.
- Namespace Firebase API, locale/data payloads, server-only/admin и dev-only
  код в production client не обнаружены.
- 12 Golos Text subsets остаются разделёнными по weight/unicode range и не
  требуют дополнительного font prefetch.
- Восемь versioned animated WebP занимают около 8.97 MB artifact raw, но не
  входят в initial graph. Массовая перекодировка отклонена без визуального
  регрессионного набора.
- Manual vendor chunking и eager route prefetch не добавлялись: Vite уже
  preloads static dependencies выбранного dynamic import, а общий prefetch
  конкурировал бы с auth/Firebase на мобильных сетях.

## Официальные источники

- [Vite: production build, chunking и preload errors](https://vite.dev/guide/build.html)
- [Vite: dynamic imports и static assets](https://vite.dev/guide/features.html#dynamic-import)
- [React: lazy](https://react.dev/reference/react/lazy)
- [React DOM: preloadModule](https://react.dev/reference/react-dom/preloadModule)
- [Firebase: modular Web SDK и tree shaking](https://firebase.google.com/docs/web/learn-more#modular-version)
- [Sentry: Vite source-map upload/remove](https://docs.sentry.io/platforms/javascript/guides/react/sourcemaps/uploading/vite/)
- [Nginx gzip module](https://nginx.org/en/docs/http/ngx_http_gzip_module.html)

## Проверки

Успешно выполнены:

- TypeScript project build и полный ESLint без warnings;
- 30 routing, lazy recovery, auth destination, observability и Error Boundary
  тестов;
- Node/JSON/static, routing config, observability privacy и serverless bundle
  checks;
- development и production Vite builds;
- production artifact privacy: без `*.map`, `sourceMappingURL`, upload secrets
  и service worker;
- performance budgets для initial/cold-route/total JS, CSS, auth background и
  полного artifact;
- полный Firebase Emulator Suite: Auth, Firestore и Realtime Database, включая
  rules, guest/invite, room management, queue, realtime access, App Check
  contracts и message cleanup;
- production preview на mobile 390×844 и desktop 1440×900: sign-in/sign-up,
  back/forward, protected `/rooms` redirect, SPA deep-link 404 и пустой browser
  warning/error log.

Ручной guest auth в браузере не запускался, чтобы не создавать внешний
anonymous account; этот сценарий проверен только в demo Emulator Suite.
