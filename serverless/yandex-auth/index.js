/* global Buffer, URL, URLSearchParams, console, exports, fetch, process, require */

const { cert, getApps, initializeApp } = require('firebase-admin/app')
const { getAuth } = require('firebase-admin/auth')
const { FieldValue, getFirestore } = require('firebase-admin/firestore')
const crypto = require('node:crypto')

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

  if (state.linkUid !== undefined) {
    if (
      typeof state.linkUid !== 'string' ||
      !state.linkUid ||
      typeof state.linkSignature !== 'string' ||
      !verifyLinkSignature(state)
    ) {
      throw new Error('Invalid account linking state.')
    }
  }

  return state
}

function getLinkSignature({ linkUid, nonce, origin, returnState }) {
  return crypto
    .createHmac('sha256', requiredEnvironment('YANDEX_CLIENT_SECRET'))
    .update(`${nonce}\n${origin}\n${linkUid}\n${returnState ?? ''}`)
    .digest('base64url')
}

function verifyLinkSignature(state) {
  const expected = Buffer.from(getLinkSignature(state))
  const received = Buffer.from(state.linkSignature)
  return (
    expected.length === received.length &&
    crypto.timingSafeEqual(expected, received)
  )
}

function createLinkedState(encodedState, linkUid) {
  const state = parseState(encodedState)
  const linkedState = { ...state, linkUid, returnState: encodedState }
  linkedState.linkSignature = getLinkSignature(linkedState)
  return Buffer.from(JSON.stringify(linkedState)).toString('base64url')
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

function createJsonResponse(statusCode, value) {
  return {
    body: JSON.stringify(value),
    headers: noStoreHeaders('application/json; charset=utf-8'),
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

function createLinkBridgeResponse(origin, state) {
  const safeOrigin = escapeInlineJson(origin)
  const safeState = escapeInlineJson(state)
  const safeMessageType = escapeInlineJson(AUTH_MESSAGE_TYPE)
  const html = `<!doctype html>
<html lang="ru">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Подключение Яндекс ID</title>
  </head>
  <body>
    <p>Подготавливаем безопасное подключение профиля…</p>
    <script>
      (async function () {
        const state = ${safeState};
        try {
          const fragment = new URLSearchParams(window.location.hash.slice(1));
          const firebaseToken = fragment.get('firebaseToken');
          history.replaceState(null, '', window.location.pathname + window.location.search);
          if (!firebaseToken) throw new Error('Missing Firebase token.');

          const response = await fetch(window.location.origin + window.location.pathname, {
            body: JSON.stringify({ firebaseToken, state }),
            headers: { 'Content-Type': 'application/json' },
            method: 'POST'
          });
          const result = await response.json();
          if (!response.ok || !result.authorizationUrl) {
            throw new Error(result.error || 'Link start failed.');
          }
          window.location.replace(result.authorizationUrl);
        } catch (error) {
          if (window.opener) {
            window.opener.postMessage({
              error: 'link-start-failed',
              state,
              type: ${safeMessageType}
            }, ${safeOrigin});
          }
          window.close();
        }
      })();
    </script>
  </body>
</html>`

  return {
    body: html,
    headers: {
      ...noStoreHeaders('text/html; charset=utf-8'),
      'Content-Security-Policy':
        "default-src 'none'; connect-src 'self'; script-src 'unsafe-inline'",
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

function parseJsonBody(event) {
  if (!event.body) throw new Error('Missing request body.')
  const rawBody = event.isBase64Encoded
    ? Buffer.from(event.body, 'base64').toString('utf8')
    : event.body
  return JSON.parse(rawBody)
}

async function createLinkAuthorization(event) {
  const body = parseJsonBody(event)
  if (
    typeof body.firebaseToken !== 'string' ||
    typeof body.state !== 'string'
  ) {
    throw new Error('Invalid account linking request.')
  }

  const decodedToken = await getFirebaseAuth().verifyIdToken(
    body.firebaseToken,
    true,
  )
  if (decodedToken.firebase?.sign_in_provider !== 'anonymous') {
    throw new Error('Only anonymous users can link an account.')
  }

  const linkedState = createLinkedState(body.state, decodedToken.uid)
  const redirect = createAuthorizationRedirect(linkedState)
  return createJsonResponse(200, {
    authorizationUrl: redirect.headers.Location,
  })
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

async function getProviderLink(profileId) {
  const snapshot = await getFirestore()
    .collection('authProviderLinks')
    .doc(`yandex:${profileId}`)
    .get()
  const uid = snapshot.data()?.uid
  return typeof uid === 'string' && uid ? uid : null
}

async function saveProviderLink(profileId, uid) {
  const linkRef = getFirestore()
    .collection('authProviderLinks')
    .doc(`yandex:${profileId}`)

  await getFirestore().runTransaction(async transaction => {
    const snapshot = await transaction.get(linkRef)
    const linkedUid = snapshot.data()?.uid
    if (snapshot.exists && linkedUid !== uid) {
      const error = new Error('Yandex account is linked to another user.')
      error.code = 'credential-already-in-use'
      throw error
    }
    if (!snapshot.exists) {
      transaction.create(linkRef, {
        createdAt: FieldValue.serverTimestamp(),
        provider: 'yandex',
        providerUserId: profileId,
        uid,
      })
    }
  })
}

async function getFirebaseUserByEmail(firebaseAuth, email) {
  if (!email) return null
  try {
    return await firebaseAuth.getUserByEmail(email)
  } catch (error) {
    if (!isFirebaseUserNotFound(error)) throw error
    return null
  }
}

async function createFirebaseToken(profile, linkUid) {
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

  const linkedUid = await getProviderLink(profile.id)
  if (linkUid && linkedUid && linkedUid !== linkUid) {
    const error = new Error('Yandex account is linked to another user.')
    error.code = 'credential-already-in-use'
    throw error
  }

  let firebaseUser
  if (linkUid) {
    firebaseUser = await firebaseAuth.getUser(linkUid)
    const emailUser = await getFirebaseUserByEmail(firebaseAuth, email)
    if (emailUser && emailUser.uid !== linkUid) {
      const error = new Error('Email belongs to another Firebase user.')
      error.code = 'credential-already-in-use'
      throw error
    }
  } else if (linkedUid) {
    firebaseUser = await firebaseAuth.getUser(linkedUid)
  } else {
    firebaseUser = await findFirebaseUser(firebaseAuth, yandexUid, email)
  }

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
    if (!firebaseUser.email && email) {
      updates.email = email
      updates.emailVerified = true
    }
    if (Object.keys(updates).length > 0) {
      firebaseUser = await firebaseAuth.updateUser(firebaseUser.uid, updates)
    }
  }

  await saveProviderLink(profile.id, firebaseUser.uid)

  return firebaseAuth.createCustomToken(firebaseUser.uid, {
    provider: 'yandex',
    yandexId: profile.id,
  })
}

exports.handler = async function handler(event) {
  if (event.httpMethod === 'POST') {
    try {
      return await createLinkAuthorization(event)
    } catch (error) {
      console.error('Yandex account link start failed:', error)
      return createJsonResponse(400, { error: 'link-start-failed' })
    }
  }
  if (event.httpMethod !== 'GET') {
    return createTextResponse(405, 'Метод не поддерживается.')
  }

  const query = event.queryStringParameters ?? {}
  let parsedState

  try {
    parsedState = parseState(query.state)

    if (!query.code && !query.error) {
      if (query.mode === 'link') {
        return createLinkBridgeResponse(parsedState.origin, query.state)
      }
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
    const firebaseToken = await createFirebaseToken(
      profile,
      parsedState.linkUid,
    )

    return createPopupResponse(
      parsedState.origin,
      parsedState.returnState ?? query.state,
      {
        token: firebaseToken,
      },
    )
  } catch (error) {
    console.error('Yandex authentication failed:', error)

    if (parsedState) {
      return createPopupResponse(
        parsedState.origin,
        parsedState.returnState ?? query.state,
        {
          error:
            error?.code === 'credential-already-in-use'
              ? 'credential-already-in-use'
              : 'server-error',
        },
      )
    }
    return createTextResponse(400, 'Некорректный запрос авторизации.')
  }
}
