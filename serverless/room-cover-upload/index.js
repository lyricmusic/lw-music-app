/* global Buffer, console, exports, fetch, process, require */

const { randomUUID, createPublicKey, verify } = require('node:crypto')
const { getApps, initializeApp } = require('firebase-admin/app')
const {
  AppCheckRequestError,
  verifyRequestAppCheck,
} = require('../shared/firebase-app-check')
const { createRequestDiagnostics } = require('../shared/diagnostics')

const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024
const FIREBASE_JWKS_URL =
  'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'
const ROOM_ID_PATTERN = /^[A-Za-z0-9]{20}$/
const USER_ID_PATTERN = /^[A-Za-z0-9]{1,128}$/
const OBJECT_KEY_PATTERN =
  /^room-covers\/[A-Za-z0-9]{20}\/cover-[0-9a-f-]{36}\.(?:jpg|png|webp)$/
const AVATAR_OBJECT_KEY_PATTERN =
  /^user-avatars\/[A-Za-z0-9]{1,128}\/avatar-[0-9a-f-]{36}\.(?:jpg|png|webp)$/
const EXTENSIONS_BY_CONTENT_TYPE = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

let jwksCache = { expiresAt: 0, keys: [] }
let storageSdk

function getStorageSdk() {
  if (!storageSdk) {
    const {
      DeleteObjectCommand,
      HeadObjectCommand,
      S3Client,
    } = require('@aws-sdk/client-s3')
    const { createPresignedPost } = require('@aws-sdk/s3-presigned-post')
    storageSdk = {
      createPresignedPost,
      DeleteObjectCommand,
      HeadObjectCommand,
      S3Client,
    }
  }
  return storageSdk
}

function requiredEnvironment(name) {
  const value = process.env[name]
  if (!value) throw new Error(`Missing environment variable: ${name}`)
  return value
}

function getFirebaseApp() {
  if (getApps().length > 0) return getApps()[0]
  return initializeApp({
    projectId: requiredEnvironment('FIREBASE_PROJECT_ID'),
  })
}

function getHeader(event, requestedName) {
  const requestedNameLower = requestedName.toLowerCase()
  const entry = Object.entries(event.headers ?? {}).find(
    ([name]) => name.toLowerCase() === requestedNameLower,
  )
  return entry?.[1]
}

function getAllowedOrigin(event) {
  const origin = getHeader(event, 'origin')
  if (!origin) return null

  const allowedOrigins = new Set(
    requiredEnvironment('ALLOWED_ORIGINS')
      .split(';')
      .map(value => value.trim())
      .filter(Boolean),
  )

  return allowedOrigins.has(origin) ? origin : null
}

function createResponse(statusCode, body, origin) {
  const headers = {
    'Access-Control-Allow-Headers':
      'Content-Type,X-Firebase-AppCheck,X-Firebase-Token,X-Request-ID',
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
    'Access-Control-Expose-Headers': 'X-Request-ID',
    'Content-Type': 'application/json; charset=utf-8',
    Vary: 'Origin',
  }

  if (origin) headers['Access-Control-Allow-Origin'] = origin

  return {
    body: body === '' ? '' : JSON.stringify(body),
    headers,
    isBase64Encoded: false,
    statusCode,
  }
}

function parseJsonBody(event) {
  const rawBody = event.isBase64Encoded
    ? Buffer.from(event.body ?? '', 'base64').toString('utf8')
    : event.body

  if (!rawBody) throw new Error('Пустое тело запроса.')
  return JSON.parse(rawBody)
}

function decodeJsonPart(value) {
  return JSON.parse(Buffer.from(value, 'base64url').toString('utf8'))
}

async function getFirebasePublicKeys() {
  if (jwksCache.expiresAt > Date.now() && jwksCache.keys.length > 0) {
    return jwksCache.keys
  }

  const response = await fetch(FIREBASE_JWKS_URL)
  if (!response.ok) throw new Error('Не удалось получить ключи Firebase.')

  const { keys } = await response.json()
  const cacheControl = response.headers.get('cache-control') ?? ''
  const maxAgeSeconds = Number(cacheControl.match(/max-age=(\d+)/)?.[1] ?? 3600)
  jwksCache = {
    expiresAt: Date.now() + maxAgeSeconds * 1000,
    keys,
  }
  return keys
}

async function verifyFirebaseIdToken(token) {
  const projectId = requiredEnvironment('FIREBASE_PROJECT_ID')
  const parts = token.split('.')
  if (parts.length !== 3) throw new Error('Некорректный Firebase ID-токен.')

  const [encodedHeader, encodedPayload, encodedSignature] = parts
  const header = decodeJsonPart(encodedHeader)
  const payload = decodeJsonPart(encodedPayload)

  if (header.alg !== 'RS256' || typeof header.kid !== 'string') {
    throw new Error('Некорректный заголовок Firebase ID-токена.')
  }

  const keys = await getFirebasePublicKeys()
  const publicJwk = keys.find(key => key.kid === header.kid)
  if (!publicJwk) throw new Error('Неизвестный ключ Firebase ID-токена.')

  const signatureIsValid = verify(
    'RSA-SHA256',
    Buffer.from(`${encodedHeader}.${encodedPayload}`),
    createPublicKey({ format: 'jwk', key: publicJwk }),
    Buffer.from(encodedSignature, 'base64url'),
  )

  const now = Math.floor(Date.now() / 1000)
  const claimsAreValid =
    signatureIsValid &&
    payload.aud === projectId &&
    payload.iss === `https://securetoken.google.com/${projectId}` &&
    typeof payload.sub === 'string' &&
    payload.sub.length > 0 &&
    payload.sub.length <= 128 &&
    typeof payload.exp === 'number' &&
    payload.exp > now &&
    typeof payload.iat === 'number' &&
    payload.iat <= now + 30 &&
    typeof payload.auth_time === 'number' &&
    payload.auth_time <= now + 30

  if (!claimsAreValid) throw new Error('Firebase ID-токен не прошёл проверку.')
  return payload
}

function createStorageClient() {
  const { S3Client } = getStorageSdk()
  return new S3Client({
    credentials: {
      accessKeyId: requiredEnvironment('AWS_ACCESS_KEY_ID'),
      secretAccessKey: requiredEnvironment('AWS_SECRET_ACCESS_KEY'),
    },
    endpoint: 'https://storage.yandexcloud.net',
    region: 'ru-central1',
  })
}

function encodeObjectUrl(bucket, objectKey) {
  const encodedKey = objectKey.split('/').map(encodeURIComponent).join('/')
  return `https://storage.yandexcloud.net/${bucket}/${encodedKey}`
}

async function createUpload(storageClient, uid, request) {
  const { createPresignedPost } = getStorageSdk()
  const { contentType, fileSize, roomId } = request
  const extension = EXTENSIONS_BY_CONTENT_TYPE[contentType]

  if (!ROOM_ID_PATTERN.test(roomId ?? '')) {
    throw new Error('Некорректный идентификатор комнаты.')
  }
  if (!extension) throw new Error('Разрешены изображения JPEG, PNG и WebP.')
  if (
    !Number.isInteger(fileSize) ||
    fileSize <= 0 ||
    fileSize > MAX_IMAGE_SIZE_BYTES
  ) {
    throw new Error('Размер обложки должен быть не больше 5 МБ.')
  }

  const bucket = requiredEnvironment('STORAGE_BUCKET')
  const objectKey = `room-covers/${roomId}/cover-${randomUUID()}.${extension}`
  const { fields, url } = await createPresignedPost(storageClient, {
    Bucket: bucket,
    Conditions: [
      ['content-length-range', 1, MAX_IMAGE_SIZE_BYTES],
      ['eq', '$Content-Type', contentType],
      ['eq', '$x-amz-meta-owner-id', uid],
    ],
    Expires: 120,
    Fields: {
      'Content-Type': contentType,
      'x-amz-meta-owner-id': uid,
    },
    Key: objectKey,
  })

  return {
    fields,
    objectKey,
    publicUrl: encodeObjectUrl(bucket, objectKey),
    uploadUrl: url,
  }
}

async function createAvatarUpload(storageClient, uid, request) {
  const { createPresignedPost } = getStorageSdk()
  const { contentType, fileSize } = request
  const extension = EXTENSIONS_BY_CONTENT_TYPE[contentType]

  if (!USER_ID_PATTERN.test(uid)) {
    throw new Error('Некорректный идентификатор пользователя.')
  }
  if (!extension) throw new Error('Разрешены изображения JPEG, PNG и WebP.')
  if (
    !Number.isInteger(fileSize) ||
    fileSize <= 0 ||
    fileSize > MAX_IMAGE_SIZE_BYTES
  ) {
    throw new Error('Размер аватара должен быть не больше 5 МБ.')
  }

  const bucket = requiredEnvironment('STORAGE_BUCKET')
  const objectKey = `user-avatars/${uid}/avatar-${randomUUID()}.${extension}`
  const { fields, url } = await createPresignedPost(storageClient, {
    Bucket: bucket,
    Conditions: [
      ['content-length-range', 1, MAX_IMAGE_SIZE_BYTES],
      ['eq', '$Content-Type', contentType],
      ['eq', '$x-amz-meta-owner-id', uid],
    ],
    Expires: 120,
    Fields: {
      'Content-Type': contentType,
      'x-amz-meta-owner-id': uid,
    },
    Key: objectKey,
  })

  return {
    fields,
    objectKey,
    publicUrl: encodeObjectUrl(bucket, objectKey),
    uploadUrl: url,
  }
}

async function deleteUpload(
  storageClient,
  uid,
  request,
  objectKeyPattern = OBJECT_KEY_PATTERN,
) {
  const { DeleteObjectCommand, HeadObjectCommand } = getStorageSdk()
  const { objectKey } = request
  if (!objectKeyPattern.test(objectKey ?? '')) {
    throw new Error('Некорректный путь изображения.')
  }

  const bucket = requiredEnvironment('STORAGE_BUCKET')
  let metadata
  try {
    const head = await storageClient.send(
      new HeadObjectCommand({ Bucket: bucket, Key: objectKey }),
    )
    metadata = head.Metadata
  } catch (error) {
    if (error?.$metadata?.httpStatusCode === 404) return
    throw error
  }

  if (metadata?.['owner-id'] !== uid) {
    throw new Error('Нельзя удалить чужое изображение.')
  }

  await storageClient.send(
    new DeleteObjectCommand({ Bucket: bucket, Key: objectKey }),
  )
}

exports.handler = async function handler(event) {
  const diagnostics = createRequestDiagnostics({
    event,
    service: 'media-upload',
  })
  const requestOrigin = getHeader(event, 'origin')
  const allowedOrigin = getAllowedOrigin(event)
  let operation = 'request'
  const respond = (statusCode, body, origin, details = {}) =>
    diagnostics.complete(createResponse(statusCode, body, origin), {
      operation,
      ...details,
    })

  if (requestOrigin && !allowedOrigin) {
    return respond(403, { message: 'Источник запроса не разрешён.' }, null, {
      errorCode: 'origin-not-allowed',
    })
  }
  if (event.httpMethod === 'OPTIONS') {
    operation = 'cors_preflight'
    return respond(204, '', allowedOrigin)
  }
  if (event.httpMethod !== 'POST') {
    return respond(
      405,
      { message: 'Метод не поддерживается.' },
      allowedOrigin,
      { errorCode: 'method-not-allowed' },
    )
  }

  try {
    await verifyRequestAppCheck({
      event,
      firebaseApp: getFirebaseApp(),
      service: 'media-upload',
    })
    const token = getHeader(event, 'x-firebase-token')
    if (!token) {
      return respond(
        401,
        { message: 'Требуется авторизация.' },
        allowedOrigin,
        { errorCode: 'unauthenticated' },
      )
    }

    const firebaseUser = await verifyFirebaseIdToken(token)
    const request = parseJsonBody(event)
    operation = typeof request.action === 'string' ? request.action : 'unknown'
    const storageClient = createStorageClient()

    if (request.action === 'signUpload') {
      const upload = await createUpload(
        storageClient,
        firebaseUser.sub,
        request,
      )
      return respond(200, upload, allowedOrigin)
    }
    if (request.action === 'signAvatarUpload') {
      const upload = await createAvatarUpload(
        storageClient,
        firebaseUser.sub,
        request,
      )
      return respond(200, upload, allowedOrigin)
    }
    if (request.action === 'deleteUpload') {
      await deleteUpload(storageClient, firebaseUser.sub, request)
      return respond(204, '', allowedOrigin)
    }
    if (request.action === 'deleteAvatarUpload') {
      await deleteUpload(
        storageClient,
        firebaseUser.sub,
        request,
        AVATAR_OBJECT_KEY_PATTERN,
      )
      return respond(204, '', allowedOrigin)
    }

    return respond(400, { message: 'Неизвестное действие.' }, allowedOrigin, {
      errorCode: 'invalid-action',
    })
  } catch (error) {
    if (error instanceof AppCheckRequestError) {
      return respond(
        error.statusCode,
        { error: error.code, message: error.message },
        allowedOrigin,
        { errorCode: error.code },
      )
    }
    const isClientError =
      error instanceof SyntaxError ||
      (error instanceof Error &&
        /^(Некоррект|Разрешены|Размер|Нельзя|Пустое)/.test(error.message))

    if (!isClientError) diagnostics.recordError(error, { operation })

    return respond(
      isClientError ? 400 : 500,
      {
        message: isClientError
          ? error.message
          : 'Не удалось подготовить загрузку изображения.',
      },
      allowedOrigin,
      { errorCode: isClientError ? 'invalid-request' : 'internal' },
    )
  }
}
