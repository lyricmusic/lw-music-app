# Firebase App Check: coverage and rollout

This change prepares App Check without enabling production enforcement. App Check
complements Firebase Auth and Security Rules; it does not replace either one.

## Coverage audit

| Surface                                    | Decision                               | Reason and protection boundary                                                                                                                                                                                                                                                        |
| ------------------------------------------ | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Web Firebase app                           | Included                               | There is one browser Firebase app. `initializeAppCheck` uses reCAPTCHA Enterprise with automatic token refresh and is initialized once across HMR/module reloads.                                                                                                                     |
| Cloud Firestore                            | Included                               | The Firebase Web SDK attaches App Check tokens automatically after initialization. Product enforcement is a later Firebase Console step. Firestore Rules remain the authorization boundary.                                                                                           |
| Realtime Database                          | Included                               | The Firebase Web SDK attaches the same App Check tokens automatically. Product enforcement is a later Firebase Console step; `database.rules.json` remains authoritative for data access.                                                                                             |
| Firebase Authentication                    | Excluded from enforcement in this task | The shared Web SDK can attach App Check context, but anonymous guest sign-in is the bootstrap path before room access. Authentication enforcement needs its own metrics and guest-compatibility rollout; Firebase Auth ID tokens remain mandatory on protected application endpoints. |
| Firebase Storage                           | Excluded                               | No browser code uses Firebase Storage; media is stored in Yandex Object Storage. The repository's Firebase Storage Rules remain deny-by-default and are unchanged.                                                                                                                    |
| `room-management` HTTPS function           | Included                               | Every POST is checked before Firebase Auth verification or room operations. CORS preflight remains unauthenticated and explicitly allows `X-Firebase-AppCheck`.                                                                                                                       |
| `room-invites` HTTPS function              | Included                               | Invite redemption writes membership and invite usage, so every POST is checked before token redemption. CORS supports App Check plus `X-Firebase-Authorization`, avoiding Yandex IAM interception of Firebase bearer tokens.                                                            |
| `room-cover-upload` / media HTTPS function | Included                               | The browser calls this public signing endpoint. App Check is verified before Firebase Auth and before issuing or deleting signed storage operations.                                                                                                                                  |
| Yandex Object Storage signed upload URL    | Excluded                               | This is an external S3-compatible endpoint, not an application function. Its short-lived signed POST policy constrains object key, content type, size and owner metadata. App Check protects the signing step.                                                                        |
| `yandex-auth` HTTPS function               | Excluded                               | The endpoint is an OAuth redirect/callback and popup bridge, including top-level cross-site GET requests that cannot reliably carry an App Check header. It keeps signed state, origin allowlisting, one-time OAuth codes and Firebase Auth verification for account linking.         |
| `message-cleanup` function                 | Excluded                               | It is not a public HTTPS API and accepts only Yandex Cloud Timer events. There is no browser request on which to attach App Check.                                                                                                                                                    |
| Firebase Hosting                           | Excluded                               | Static assets and SPA navigation are intentionally public. Protected data continues to flow through Firebase products and protected HTTPS functions.                                                                                                                                  |
| Admin migration and verification scripts   | Excluded                               | They run with Admin credentials or against `demo-*` emulators and are not untrusted app clients. Emulator bypass is limited in code to a `demo-*` project with an active emulator host.                                                                                               |
| RUTUBE APIs                                | Excluded                               | Calls are server-to-server and protected upstream by room access checks and rate limits; they are not Syncly application endpoints.                                                                                                                                                   |

## Runtime modes

The shared server verifier reads `APP_CHECK_MODE`:

- `monitor`: verify tokens when present, emit structured `firebase_app_check`
  logs for `valid`, `missing` and `invalid`, but allow the request to continue.
- `enforce`: reject missing or invalid tokens with a stable `401` error code before
  protected work.
- `off`: accepted only for a `demo-*` Firebase project while an Emulator Suite host
  is configured. It fails closed anywhere else.

An unset or unknown server mode fails closed. Deploy scripts explicitly default to
`monitor`, so publishing the prepared backend does not break an older frontend or
already-open tab. The old room-management `-EnforceAppCheck` argument remains as a
deprecated compatibility alias.

Logs include service, mode, outcome, request ID, App ID when valid, and a safe error
code. They never include App Check or Firebase Auth tokens.

## Local development and debug tokens

The reCAPTCHA Enterprise site key is public Firebase web configuration. The App
Check debug token is a credential and must never be committed, pasted into a Vite
environment variable, CI variable, issue, log or chat.

1. Register a separate web app/reCAPTCHA Enterprise provider for the development
   Firebase project.
2. Put only these local switches in the ignored `.env.local` file:

   ```dotenv
   VITE_FIREBASE_APPCHECK_SITE_KEY=development-public-site-key
   VITE_FIREBASE_APPCHECK_DEBUG=true
   ```

3. Start `pnpm dev`. The Firebase SDK generates a debug token and prints it in the
   browser developer console. Register that token in the development project's App
   Check debug-token allowlist.
4. Treat the generated token like a secret. Revoke it when the device is retired or
   if it is exposed. Never copy the token back into `.env.local`; the SDK stores it
   in that browser profile.

The debug switch is rejected by an optimized build and by any non-development app
environment. CI does not use a debug token: it builds with `.env.ci` and runs only
against the local `demo-lwmusic` emulators.

On Windows, run `pnpm verify:emulators:windows`. The wrapper uses the project-local,
gitignored Temurin 21 JRE installed by `scripts/setup-firebase-jdk.ps1`. The download
version and SHA-256 are pinned; neither `JAVA_HOME` nor the system `PATH` is changed
outside that verification process. CI uses Temurin 21 through `actions/setup-java`.

## Safe rollout

Every deployment or Firebase Console enforcement change requires separate explicit
approval. Use development before production and advance only when the previous stage
has stable metrics.

1. **Prepare providers, no enforcement.** Register the development and production
   web apps with separate reCAPTCHA Enterprise keys. Keep the production site key
   out of the bundle until the provider exists.
2. **Backend monitoring.** Deploy the three included HTTPS functions with
   `-AppCheckMode monitor`. Missing/invalid tokens remain non-blocking. Observe
   structured Yandex function logs and baseline error/latency rates.
3. **Token-emitting frontend.** Add the public production site key to the production
   build and publish the frontend. Confirm valid custom-backend logs and Firebase App
   Check request metrics for Firestore and Realtime Database. Keep monitoring long
   enough to cover cached assets and long-lived tabs.
4. **Custom endpoint enforcement.** Enable one function at a time with
   `-AppCheckMode enforce`, beginning in development. Verify registered and guest
   entry, invitations, media upload, room actions, CORS, mobile/desktop and a tab
   opened before the release. Then repeat explicitly for production.
5. **Firebase product enforcement.** In Firebase Console, enable enforcement for
   Firestore and Realtime Database one product at a time only after their valid-token
   metrics cover expected traffic. Security Rules are deployed and tested separately;
   App Check enforcement is a service setting, not a Rules expression.

The browser retries a response marked `app-check-required` or `app-check-invalid`
once after forcing a fresh token. It does not retry network failures or application
errors, so non-idempotent operations are not duplicated after an ambiguous response.
Older tabs continue to work during monitoring and receive a clear reload instruction
after enforcement.

App Check tokens are intentionally reusable and are not consumed for replay
protection. Invite redemption remains transactional/idempotent, and room operations
retain their existing transactions, authorization and rate limits. Enabling token
consumption would require limited-use tokens and a separate compatibility review.

## Verification and rollback

Run `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm verify:static`,
`pnpm verify:serverless-bundles` and `pnpm verify:emulators:windows` before a
rollout. The bundle check requires the nested serverless dependencies installed in
the same frozen-lockfile order as CI. The emulator suite covers the room
model rules, Realtime Database rules, queue rules, room-management function, invite
function, App Check mode/CORS scenarios and message cleanup.

If enforcement causes unexpected rejection, roll only that surface back to
monitoring (`-AppCheckMode monitor` for a custom function, or disable enforcement for
the affected Firebase product). Do not remove Security Rules or Auth checks during an
App Check rollback.
