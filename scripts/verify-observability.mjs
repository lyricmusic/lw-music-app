/* global console */

import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const {
  createRequestDiagnostics,
  getRequestId,
  getSafeErrorDetails,
} = require('../serverless/shared/diagnostics.js')

const entries = []
const logger = {
  error: entry => entries.push(entry),
  info: entry => entries.push(entry),
  warn: entry => entries.push(entry),
}
let currentTime = 100
const diagnostics = createRequestDiagnostics({
  event: {
    headers: {
      Authorization: 'Bearer private-token',
      'X-Request-ID': '12345678-abcd-4000-8000-123456789abc',
    },
    queryStringParameters: { invite: 'private-invite' },
  },
  logger,
  now: () => currentTime,
  release: 'syncly-test',
  service: 'room-invites',
})

currentTime = 125
diagnostics.recordError(
  Object.assign(new Error('private@example.test private room'), {
    code: 'internal',
    token: 'private-token',
  }),
  { operation: 'redeem_invite' },
)
const response = diagnostics.complete(
  { body: '{}', headers: {}, statusCode: 500 },
  { errorCode: 'internal', operation: 'redeem_invite' },
)

assert.equal(
  response.headers['X-Request-ID'],
  '12345678-abcd-4000-8000-123456789abc',
)
assert.match(response.headers['Access-Control-Expose-Headers'], /X-Request-ID/)
assert.deepEqual(getSafeErrorDetails({ code: 'internal', name: 'TypeError' }), {
  errorCode: 'internal',
  errorName: 'TypeError',
})

const serializedLogs = JSON.stringify(entries)
assert.doesNotMatch(serializedLogs, /private@example\.test/)
assert.doesNotMatch(serializedLogs, /private-token/)
assert.doesNotMatch(serializedLogs, /private-invite/)
assert.doesNotMatch(serializedLogs, /private room/)
assert.match(serializedLogs, /12345678-abcd-4000-8000-123456789abc/)
assert.match(serializedLogs, /syncly-test/)

const requestWithoutId = { headers: {} }
assert.equal(
  getRequestId(requestWithoutId),
  getRequestId(requestWithoutId),
  'App Check and request diagnostics must share one generated correlation ID.',
)

console.log('Observability diagnostics privacy verification passed.')
