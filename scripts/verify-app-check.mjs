/* global console, process */

import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { deleteApp, getApps } from 'firebase-admin/app'

const require = createRequire(import.meta.url)
const {
  AppCheckRequestError,
  getAppCheckMode,
  verifyRequestAppCheck,
} = require('../serverless/shared/firebase-app-check.js')

const projectId = process.env.GCLOUD_PROJECT || 'demo-lwmusic'
const allowedOrigin = 'http://localhost:5173'
const validToken = 'app-check-token-must-never-be-logged'
const logs = []
const logger = {
  info: value => logs.push(value),
  warn: value => logs.push(value),
}

function appCheckEvent(token) {
  return {
    headers: token ? { 'X-Firebase-AppCheck': token } : {},
    requestContext: { requestId: 'app-check-test-request' },
  }
}

delete process.env.APP_CHECK_MODE
assert.equal(getAppCheckMode(), 'enforce')
await assert.rejects(
  verifyRequestAppCheck({
    event: appCheckEvent(),
    firebaseApp: {},
    logger,
    service: 'unit-test',
  }),
  error =>
    error instanceof AppCheckRequestError &&
    error.code === 'app-check-required',
)

process.env.APP_CHECK_MODE = 'monitor'
assert.deepEqual(
  await verifyRequestAppCheck({
    event: appCheckEvent(),
    firebaseApp: {},
    logger,
    service: 'unit-test',
  }),
  { mode: 'monitor', outcome: 'missing' },
)
assert.deepEqual(
  await verifyRequestAppCheck({
    event: appCheckEvent(validToken),
    firebaseApp: {},
    logger,
    service: 'unit-test',
    verifyToken: async () => {
      const error = new Error('invalid token')
      error.code = 'app-check/invalid-argument'
      throw error
    },
  }),
  { mode: 'monitor', outcome: 'invalid' },
)

process.env.APP_CHECK_MODE = 'enforce'
let verifiedToken
assert.deepEqual(
  await verifyRequestAppCheck({
    event: appCheckEvent(validToken),
    firebaseApp: {},
    logger,
    service: 'unit-test',
    verifyToken: async token => {
      verifiedToken = token
      return { appId: 'test-app-id' }
    },
  }),
  { appId: 'test-app-id', mode: 'enforce', outcome: 'valid' },
)
assert.equal(verifiedToken, validToken)
await assert.rejects(
  verifyRequestAppCheck({
    event: appCheckEvent(validToken),
    firebaseApp: {},
    logger,
    service: 'unit-test',
    verifyToken: async () => {
      throw new Error('invalid token')
    },
  }),
  error =>
    error instanceof AppCheckRequestError &&
    error.code === 'app-check-invalid',
)
assert.equal(JSON.stringify(logs).includes(validToken), false)

process.env.APP_CHECK_MODE = 'off'
process.env.FIREBASE_PROJECT_ID = 'production-project'
delete process.env.FIRESTORE_EMULATOR_HOST
await assert.rejects(
  verifyRequestAppCheck({
    event: appCheckEvent(),
    firebaseApp: {},
    logger,
    service: 'unit-test',
  }),
  /allowed only for demo Firebase Emulator Suite projects/,
)

process.env.FIREBASE_PROJECT_ID = projectId
process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080'
assert.deepEqual(
  await verifyRequestAppCheck({
    event: appCheckEvent(),
    firebaseApp: {},
    logger,
    service: 'unit-test',
  }),
  { mode: 'off', outcome: 'emulator-bypass' },
)

process.env.ALLOWED_ORIGINS = allowedOrigin
process.env.FIREBASE_DATABASE_URL = `https://${projectId}-default-rtdb.firebaseio.com`
process.env.APP_CHECK_MODE = 'enforce'

const roomManagement = require('../serverless/room-management/index.js')
const roomInvites = require('../serverless/room-invites/index.js')
const mediaUpload = require('../serverless/room-cover-upload/index.js')

const protectedHandlers = [
  {
    authorizationHeaders: { authorization: 'Bearer emulator-token' },
    handler: roomManagement.handler,
    name: 'room-management',
  },
  {
    authorizationHeaders: {
      'X-Firebase-Authorization': 'Bearer emulator-token',
    },
    handler: roomInvites.handler,
    name: 'room-invites',
  },
  {
    authorizationHeaders: { 'X-Firebase-Token': 'emulator-token' },
    handler: mediaUpload.handler,
    name: 'media-upload',
  },
]

for (const { authorizationHeaders, handler, name } of protectedHandlers) {
  const optionsResponse = await handler({
    headers: { origin: allowedOrigin },
    httpMethod: 'OPTIONS',
  })
  assert.equal(optionsResponse.statusCode, 204, name)
  assert.match(
    optionsResponse.headers['Access-Control-Allow-Headers'],
    /X-Firebase-AppCheck/i,
    name,
  )

  const missingTokenResponse = await handler({
    body: JSON.stringify({ operation: 'unknown' }),
    headers: { ...authorizationHeaders, origin: allowedOrigin },
    httpMethod: 'POST',
    isBase64Encoded: false,
  })
  assert.equal(missingTokenResponse.statusCode, 401, name)
  assert.equal(
    JSON.parse(missingTokenResponse.body).error,
    'app-check-required',
    name,
  )
}

console.log(
  'Firebase App Check verification passed: closed defaults, monitor/enforce behavior, emulator-only bypass, redacted logs, protected endpoint adoption, and CORS preflight support.',
)

await Promise.all(getApps().map(deleteApp))
