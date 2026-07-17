/* global Buffer, URL, URLSearchParams, console, exports, fetch, process, require */

const { cert, getApps, initializeApp } = require('firebase-admin/app')
const { getAuth } = require('firebase-admin/auth')

const AUTH_MESSAGE_TYPE = 'syncly:yandex-auth'
const NONCE_PATTERN = /^[0-9a-f]{48}$/
const YANDEX_AUTHORIZE_URL = 'https://oauth.yandex.ru/authorize'
const YANDEX_PROFILE_URL = 'https://login.yandex.ru/info?format=json'
const YANDEX_TOKEN_URL = 'https://oauth.yandex.ru/token'

function requiredEnvironment(name) {
  const value = process.env[name]
  if (!value) throw new Error(`Missing environment variable: ${name}`)
  return value
}

function getAllowedOrigins() {
  return new Set(
    requiredEnvironment('ALLOWED_ORIGINS')
      .split(';')
      .map(value => value.trim())
      .filter(Boolean),
  )
}

function parseState(encodedState) {
  if (typeof encodedState !== 'string' || encodedState.length > 1024) {
    throw new Error('Invalid OAuth state.')
  }

  const state = JSON.parse(
    Buffer.from(encodedState, 'base64url').toString('utf8'),
  )
  if (
    !NONCE_PATTERN.test(state.nonce ?? '') ||
    typeof state.origin !== 'string' ||
    !getAllowedOrigins().has(state.origin)
  ) {
    throw new Error('Invalid OAuth state.')
  }

  return state
}

function noStoreHeaders(contentType) {
  return {
    'Cache-Control': 'no-store, max-age=0',
    'Content-Type': contentType,
    Pragma: 'no-cache',
    'Referrer-Policy': 'no-referrer',
  }
}

function createTextResponse(statusCode, message) {
  return {
    body: message,
    headers: noStoreHeaders('text/plain; charset=utf-8'),
    isBase64Encoded: false,
    statusCode,
  }
}

function escapeInlineJson(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c')
}

function createPopupResponse(origin, state, payload) {
  const message = escapeInlineJson({
    ...payload,
    state,
    type: AUTH_MESSAGE_TYPE,
  })
  const targetOrigin = escapeInlineJson(origin)
  const html = `<!doctype html>
<html lang="ru">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Вход через Яндекс</title>
  </head>
  <body>
    <p>Возвращаемся в приложение…</p>
    <script>
      if (window.opener) window.opener.postMessage(${message}, ${targetOrigin});
      window.close();
    </script>
  </body>
</html>`

  return {
    body: html,
    headers: {
      ...noStoreHeaders('text/html; charset=utf-8'),
      'Content-Security-Policy':
        "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'",
    },
    isBase64Encoded: false,
    statusCode: 200,
  }
}

function createAuthorizationRedirect(encodedState) {
  parseState(encodedState)

  const authorizationUrl = new URL(YANDEX_AUTHORIZE_URL)
  authorizationUrl.searchParams.set('response_type', 'code')
  authorizationUrl.searchParams.set(
    'client_id',
    requiredEnvironment('YANDEX_CLIENT_ID'),
  )
  authorizationUrl.searchParams.set(
    'redirect_uri',
    requiredEnvironment('YANDEX_REDIRECT_URI'),
  )
  authorizationUrl.searchParams.set(
    'scope',
    'login:email login:info login:avatar',
  )
  authorizationUrl.searchParams.set('state', encodedState)

  return {
    body: '',
    headers: {
      ...noStoreHeaders('text/plain; charset=utf-8'),
      Location: authorizationUrl.toString(),
    },
    isBase64Encoded: false,
    statusCode: 302,
  }
}

async function exchangeAuthorizationCode(code) {
  const requestBody = new URLSearchParams({
    client_id: requiredEnvironment('YANDEX_CLIENT_ID'),
    client_secret: requiredEnvironment('YANDEX_CLIENT_SECRET'),
    code,
    grant_type: 'authorization_code',
  })
  const response = await fetch(YANDEX_TOKEN_URL, {
    body: requestBody,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    method: 'POST',
  })
  const result = await response.json()

  if (!response.ok || typeof result.access_token !== 'string') {
    throw new Error(
      `Yandex token exchange failed: ${result.error ?? 'unknown'}`,
    )
  }

  return result.access_token
}

async function getYandexProfile(accessToken) {
  const response = await fetch(YANDEX_PROFILE_URL, {
    headers: { Authorization: `OAuth ${accessToken}` },
  })
  const profile = await response.json()

  if (
    !response.ok ||
    typeof profile.id !== 'string' ||
    profile.client_id !== requiredEnvironment('YANDEX_CLIENT_ID')
  ) {
    throw new Error('Yandex profile validation failed.')
  }

  return profile
}

function getFirebaseAuth() {
  if (getApps().length === 0) {
    const serviceAccount = JSON.parse(
      requiredEnvironment('FIREBASE_SERVICE_ACCOUNT_JSON'),
    )
    initializeApp({ credential: cert(serviceAccount) })
  }

  return getAuth()
}

function isFirebaseUserNotFound(error) {
  return error?.code === 'auth/user-not-found'
}

async function findFirebaseUser(firebaseAuth, uid, email) {
  try {
    return await firebaseAuth.getUser(uid)
  } catch (error) {
    if (!isFirebaseUserNotFound(error)) throw error
  }

  if (!email) return null

  try {
    return await firebaseAuth.getUserByEmail(email)
  } catch (error) {
    if (!isFirebaseUserNotFound(error)) throw error
    return null
  }
}

async function createFirebaseToken(profile) {
  const firebaseAuth = getFirebaseAuth()
  const yandexUid = `yandex:${profile.id}`
  const email = profile.default_email || undefined
  const displayName = (
    profile.real_name ||
    profile.display_name ||
    profile.login ||
    'Пользователь'
  ).slice(0, 50)
  const photoURL =
    !profile.is_avatar_empty && profile.default_avatar_id
      ? `https://avatars.yandex.net/get-yapic/${encodeURIComponent(profile.default_avatar_id)}/islands-200`
      : undefined

  let firebaseUser = await findFirebaseUser(firebaseAuth, yandexUid, email)
  if (!firebaseUser) {
    firebaseUser = await firebaseAuth.createUser({
      displayName,
      email,
      emailVerified: Boolean(email),
      photoURL,
      uid: yandexUid,
    })
  } else {
    const updates = {}
    if (!firebaseUser.displayName) updates.displayName = displayName
    if (!firebaseUser.photoURL && photoURL) updates.photoURL = photoURL
    if (Object.keys(updates).length > 0) {
      firebaseUser = await firebaseAuth.updateUser(firebaseUser.uid, updates)
    }
  }

  return firebaseAuth.createCustomToken(firebaseUser.uid, {
    provider: 'yandex',
    yandexId: profile.id,
  })
}

exports.handler = async function handler(event) {
  if (event.httpMethod !== 'GET') {
    return createTextResponse(405, 'Метод не поддерживается.')
  }

  const query = event.queryStringParameters ?? {}
  let parsedState

  try {
    parsedState = parseState(query.state)

    if (!query.code && !query.error) {
      return createAuthorizationRedirect(query.state)
    }
    if (query.error) {
      return createPopupResponse(parsedState.origin, query.state, {
        error:
          query.error === 'access_denied' ? 'access_denied' : 'oauth-failed',
      })
    }

    const accessToken = await exchangeAuthorizationCode(query.code)
    const profile = await getYandexProfile(accessToken)
    const firebaseToken = await createFirebaseToken(profile)

    return createPopupResponse(parsedState.origin, query.state, {
      token: firebaseToken,
    })
  } catch (error) {
    console.error('Yandex authentication failed:', error)

    if (parsedState) {
      return createPopupResponse(parsedState.origin, query.state, {
        error: 'server-error',
      })
    }
    return createTextResponse(400, 'Некорректный запрос авторизации.')
  }
}
