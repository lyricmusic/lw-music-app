/* global console, fetch, process */

import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { createRequire } from 'node:module'
import { getApps, initializeApp } from 'firebase-admin/app'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'

const projectId = process.env.GCLOUD_PROJECT || 'demo-lwmusic'
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099'
const allowedOrigin = 'http://localhost:5173'

process.env.FIREBASE_PROJECT_ID = projectId
process.env.ALLOWED_ORIGINS = allowedOrigin

const app = getApps()[0] ?? initializeApp({ projectId })
const firestore = getFirestore(app)
const require = createRequire(import.meta.url)
const { handler } = require('../serverless/room-invites/index.js')

async function createAuthUser(label, anonymous = false) {
  const response = await fetch(
    `http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake`,
    {
      body: JSON.stringify(
        anonymous
          ? { returnSecureToken: true }
          : {
              email: `${label}-${Date.now()}-${crypto.randomUUID()}@example.test`,
              password: 'room-invite-function-password',
              returnSecureToken: true,
            },
      ),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    },
  )
  const body = await response.json()
  assert.equal(response.ok, true, JSON.stringify(body))
  return { idToken: body.idToken, uid: body.localId }
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token, 'utf8').digest('hex')
}

async function seedInvite({ createdBy, maxUses = 1, roomId, token, uses = 0 }) {
  const tokenHash = hashToken(token)
  await Promise.all([
    firestore.collection('rooms').doc(roomId).set({
      ownerId: createdBy,
      status: 'active',
      visibility: 'private',
    }),
    firestore
      .collection('roomInvites')
      .doc(tokenHash)
      .set({
        createdAt: Timestamp.now(),
        createdBy,
        expiresAt: Timestamp.fromMillis(Date.now() + 60 * 60 * 1000),
        maxUses,
        revokedAt: null,
        roomId,
        tokenHash,
        uses,
      }),
  ])
  return tokenHash
}

function invoke(idToken, body, origin = allowedOrigin) {
  return handler({
    body: JSON.stringify(body),
    headers: {
      authorization: idToken ? `Bearer ${idToken}` : '',
      origin,
    },
    httpMethod: 'POST',
    isBase64Encoded: false,
  })
}

const owner = await createAuthUser('owner')
const registered = await createAuthUser('registered')
const anonymous = await createAuthUser('anonymous', true)
const exhaustedUser = await createAuthUser('exhausted')

const standardToken = 'S'.repeat(43)
const standardRoomId = 'invite-function-standard'
const standardHash = await seedInvite({
  createdBy: owner.uid,
  maxUses: 2,
  roomId: standardRoomId,
  token: standardToken,
})

const registeredResponse = await invoke(registered.idToken, {
  expectedRoomId: standardRoomId,
  token: standardToken,
})
assert.equal(registeredResponse.statusCode, 200, registeredResponse.body)
assert.deepEqual(JSON.parse(registeredResponse.body), {
  roomId: standardRoomId,
})

const registeredMember = await firestore
  .collection('rooms')
  .doc(standardRoomId)
  .collection('members')
  .doc(registered.uid)
  .get()
assert.deepEqual(
  {
    invitedBy: registeredMember.data().invitedBy,
    isGuest: registeredMember.data().isGuest,
    role: registeredMember.data().role,
    status: registeredMember.data().status,
  },
  {
    invitedBy: owner.uid,
    isGuest: false,
    role: 'member',
    status: 'active',
  },
)

const anonymousResponse = await invoke(anonymous.idToken, {
  token: standardToken,
})
assert.equal(anonymousResponse.statusCode, 200, anonymousResponse.body)
const anonymousMember = await firestore
  .collection('rooms')
  .doc(standardRoomId)
  .collection('members')
  .doc(anonymous.uid)
  .get()
assert.equal(anonymousMember.data().isGuest, true)
assert.equal(anonymousMember.data().role, 'member')

const exhaustedResponse = await invoke(exhaustedUser.idToken, {
  token: standardToken,
})
assert.equal(exhaustedResponse.statusCode, 409, exhaustedResponse.body)
assert.equal(JSON.parse(exhaustedResponse.body).error, 'invite-unavailable')
assert.equal(
  (await firestore.collection('roomInvites').doc(standardHash).get()).data()
    .uses,
  2,
)

const repeatedResponse = await invoke(registered.idToken, {
  token: standardToken,
})
assert.equal(repeatedResponse.statusCode, 200, repeatedResponse.body)
assert.equal(
  (await firestore.collection('roomInvites').doc(standardHash).get()).data()
    .uses,
  2,
)

const bannedUser = await createAuthUser('banned')
const bannedToken = 'B'.repeat(43)
const bannedRoomId = 'invite-function-banned'
const bannedHash = await seedInvite({
  createdBy: owner.uid,
  roomId: bannedRoomId,
  token: bannedToken,
})
await firestore
  .collection('rooms')
  .doc(bannedRoomId)
  .collection('bans')
  .doc(bannedUser.uid)
  .set({ expiresAt: null })

const bannedResponse = await invoke(bannedUser.idToken, {
  token: bannedToken,
})
assert.equal(bannedResponse.statusCode, 403, bannedResponse.body)
assert.equal(JSON.parse(bannedResponse.body).error, 'banned')
assert.equal(
  (await firestore.collection('roomInvites').doc(bannedHash).get()).data().uses,
  0,
)

const concurrentUserA = await createAuthUser('concurrent-a')
const concurrentUserB = await createAuthUser('concurrent-b')
const concurrentToken = 'C'.repeat(43)
const concurrentRoomId = 'invite-function-concurrent'
const concurrentHash = await seedInvite({
  createdBy: owner.uid,
  roomId: concurrentRoomId,
  token: concurrentToken,
})
const concurrentResponses = await Promise.all([
  invoke(concurrentUserA.idToken, { token: concurrentToken }),
  invoke(concurrentUserB.idToken, { token: concurrentToken }),
])
assert.deepEqual(
  concurrentResponses.map(response => response.statusCode).sort(),
  [200, 409],
)
assert.equal(
  (await firestore.collection('roomInvites').doc(concurrentHash).get()).data()
    .uses,
  1,
)
const concurrentMembers = await firestore
  .collection('rooms')
  .doc(concurrentRoomId)
  .collection('members')
  .get()
assert.equal(concurrentMembers.size, 1)
assert.equal(concurrentMembers.docs[0].data().role, 'member')

const invalidTokenResponse = await invoke(registered.idToken, {
  token: 'not-a-valid-token',
})
assert.equal(invalidTokenResponse.statusCode, 400, invalidTokenResponse.body)

const unauthenticatedResponse = await invoke('', { token: standardToken })
assert.equal(unauthenticatedResponse.statusCode, 401)

const wrongOriginResponse = await invoke(
  registered.idToken,
  { token: standardToken },
  'https://evil.example',
)
assert.equal(wrongOriginResponse.statusCode, 403)

const optionsResponse = await handler({
  headers: { origin: allowedOrigin },
  httpMethod: 'OPTIONS',
})
assert.equal(optionsResponse.statusCode, 204)
assert.equal(
  optionsResponse.headers['Access-Control-Allow-Origin'],
  allowedOrigin,
)

console.log(
  'Room invite function verification passed: authentication, hashed tokens, guest membership, limits, bans, idempotency, and atomic concurrent redemption.',
)
