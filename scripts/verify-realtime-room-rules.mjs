/* global URL, console, fetch, process */

import assert from 'node:assert/strict'

import { getApps, initializeApp } from 'firebase-admin/app'
import { getDatabase } from 'firebase-admin/database'

const projectId = process.env.GCLOUD_PROJECT || 'demo-lwmusic'
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099'
const databaseHost =
  process.env.FIREBASE_DATABASE_EMULATOR_HOST || '127.0.0.1:9000'
const databaseNamespace = `${projectId}-default-rtdb`
const app =
  getApps()[0] ??
  initializeApp({
    databaseURL: `https://${projectId}-default-rtdb.firebaseio.com`,
    projectId,
  })
const adminDb = getDatabase(app)

async function createAuthUser(label) {
  const response = await fetch(
    `http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake`,
    {
      body: JSON.stringify({
        email: `${label}-${Date.now()}@example.test`,
        password: 'realtime-room-rules-password',
        returnSecureToken: true,
      }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    },
  )
  const body = await response.json()
  assert.equal(response.ok, true, JSON.stringify(body))
  return { idToken: body.idToken, uid: body.localId }
}

async function request(path, token, { body, method = 'GET' } = {}) {
  const url = new URL(`http://${databaseHost}/${path}.json`)
  url.searchParams.set('ns', databaseNamespace)
  if (token) url.searchParams.set('auth', token)
  const response = await fetch(url, {
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    headers: { 'content-type': 'application/json' },
    method,
  })
  return {
    body: await response.json(),
    ok: response.ok,
    status: response.status,
  }
}

const member = await createAuthUser('member')
const outsider = await createAuthUser('outsider')
const banned = await createAuthUser('banned')
const now = Date.now()
await adminDb.ref().set({
  roomAccess: {
    privateRoom: {
      members: { [member.uid]: now + 120_000 },
      status: 'active',
      visibility: 'private',
    },
    publicRoom: {
      bans: { [banned.uid]: 0 },
      members: { [member.uid]: now + 120_000 },
      status: 'active',
      visibility: 'public',
    },
  },
})

assert.equal(
  (await request('roomPresence/privateRoom', outsider.idToken)).ok,
  false,
  'A non-member must not read private-room presence.',
)
assert.equal(
  (await request('roomPresence/privateRoom', member.idToken)).ok,
  true,
  'An active leased member must read private-room presence.',
)
assert.equal(
  (await request('roomPresence/publicRoom', outsider.idToken)).ok,
  false,
  'A non-member must not read public-room presence.',
)
assert.equal(
  (await request('roomPresence/publicRoom', member.idToken)).ok,
  true,
  'A leased member must read public-room presence.',
)
assert.equal(
  (await request('roomPresence/publicRoom', banned.idToken)).ok,
  false,
  'A banned user must not read public-room presence.',
)
assert.equal(
  (await request('roomAccess/privateRoom', member.idToken)).ok,
  false,
  'Clients must not read the server-owned access index.',
)
assert.equal(
  (
    await request(
      `roomAccess/privateRoom/members/${outsider.uid}`,
      outsider.idToken,
      { body: Date.now() + 120_000, method: 'PUT' },
    )
  ).ok,
  false,
  'Clients must not grant their own room leases.',
)

const ownPresencePath = `roomPresence/privateRoom/${member.uid}/connection`
assert.equal(
  (
    await request(ownPresencePath, member.idToken, {
      body: { '.sv': 'timestamp' },
      method: 'PUT',
    })
  ).ok,
  true,
  'A leased member must write their own presence.',
)
assert.equal(
  (
    await request(
      `roomPresence/privateRoom/${outsider.uid}/connection`,
      outsider.idToken,
      { body: { '.sv': 'timestamp' }, method: 'PUT' },
    )
  ).ok,
  false,
  'A non-member must not write presence in an arbitrary room.',
)
assert.equal(
  (
    await request(
      `roomPresence/privateRoom/${outsider.uid}/connection`,
      member.idToken,
      { body: { '.sv': 'timestamp' }, method: 'PUT' },
    )
  ).ok,
  false,
  "A member must not write another user's presence.",
)

await adminDb
  .ref(`roomAccess/privateRoom/members/${member.uid}`)
  .set(Date.now() - 1)
assert.equal(
  (await request(ownPresencePath, member.idToken, { method: 'DELETE' })).ok,
  true,
  'A former member must still be able to remove stale own presence.',
)
assert.equal(
  (
    await request(ownPresencePath, member.idToken, {
      body: { '.sv': 'timestamp' },
      method: 'PUT',
    })
  ).ok,
  false,
  'An expired lease must not authorize new presence.',
)

const reactionPath = `roomReactions/publicRoom/${member.uid}`
assert.equal(
  (
    await request(reactionPath, member.idToken, {
      body: { emoji: '🔥', expiresAt: Date.now() + 6_000 },
      method: 'PUT',
    })
  ).ok,
  true,
  'A leased member must write a valid reaction.',
)
assert.equal(
  (
    await request(reactionPath, member.idToken, {
      body: { emoji: 'X', expiresAt: Date.now() + 6_000 },
      method: 'PUT',
    })
  ).ok,
  false,
  'Invalid reactions must be rejected.',
)
assert.equal(
  (
    await request(
      `roomReactions/publicRoom/${outsider.uid}`,
      outsider.idToken,
      { body: { emoji: '🔥', expiresAt: Date.now() + 6_000 }, method: 'PUT' },
    )
  ).ok,
  false,
  'Public-room readability must not grant reaction writes.',
)

console.log(
  'Realtime room rules verification passed: private/public reads, bans, leases, self-only writes, validation, and cleanup.',
)
