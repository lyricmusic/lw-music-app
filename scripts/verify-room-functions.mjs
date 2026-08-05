/* global console, fetch, process */

import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { getApps, initializeApp } from 'firebase-admin/app'
import { getDatabase } from 'firebase-admin/database'

const projectId = process.env.GCLOUD_PROJECT || 'demo-lwmusic'
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099'
const firestoreHost = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080'
const allowedOrigin = 'http://localhost:5173'
const databaseRoot = `projects/${projectId}/databases/(default)/documents`
const firestoreUrl = `http://${firestoreHost}/v1/projects/${projectId}/databases/(default)/documents`

process.env.FIREBASE_PROJECT_ID = projectId
process.env.FIREBASE_DATABASE_URL = `https://${projectId}-default-rtdb.firebaseio.com`
process.env.ALLOWED_ORIGINS = allowedOrigin

const app =
  getApps()[0] ??
  initializeApp({
    databaseURL: process.env.FIREBASE_DATABASE_URL,
    projectId,
  })
const realtimeDb = getDatabase(app)
const require = createRequire(import.meta.url)
const { handler } = require('../serverless/room-management/index.js')

const stringValue = value => ({ stringValue: value })
const integerValue = value => ({ integerValue: String(value) })
const booleanValue = value => ({ booleanValue: value })
const timestampValue = value => ({ timestampValue: value })
const nullValue = () => ({ nullValue: null })
const arrayValue = values => ({
  arrayValue: { values: values.map(stringValue) },
})

function documentPath(path) {
  return `${databaseRoot}/${path}`
}

function update(path, fields) {
  return { update: { fields, name: documentPath(path) } }
}

async function createAuthUser(label) {
  const response = await fetch(
    `http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake`,
    {
      body: JSON.stringify({
        email: `${label}-${Date.now()}@example.test`,
        password: 'room-functions-password',
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

async function commit(writes) {
  const response = await fetch(`${firestoreUrl}:commit`, {
    body: JSON.stringify({ writes }),
    headers: {
      authorization: 'Bearer owner',
      'content-type': 'application/json',
    },
    method: 'POST',
  })
  const body = await response.json()
  assert.equal(response.ok, true, JSON.stringify(body))
}

async function readDocument(path) {
  const response = await fetch(`${firestoreUrl}/${path}`, {
    headers: { authorization: 'Bearer owner' },
  })
  const body = await response.json()
  assert.equal(response.ok, true, JSON.stringify(body))
  return body.fields
}

async function callFunction(name, data, token) {
  const response = await handler({
    body: JSON.stringify({ ...data, operation: name }),
    headers: {
      authorization: `Bearer ${token}`,
      origin: allowedOrigin,
    },
    httpMethod: 'POST',
    isBase64Encoded: false,
  })
  const body = JSON.parse(response.body)
  return {
    body,
    ok: response.statusCode >= 200 && response.statusCode < 300,
    status: response.statusCode,
  }
}

const owner = await createAuthUser('owner')
const futureOwner = await createAuthUser('future-owner')
const member = await createAuthUser('member')
const bannedTarget = await createAuthUser('banned-target')
const roomId = `room-functions-${Date.now()}`
const firstItemId = '000000000001'
const secondItemId = '000000000002'
const firstVideoId = 'dQw4w9WgXcQ'
const secondVideoId = 'M7lc1UVf-VE'

const membership = (role, isGuest = false) => ({
  invitedBy: nullValue(),
  isGuest: booleanValue(isGuest),
  joinedAt: timestampValue('2026-01-01T00:00:00Z'),
  role: stringValue(role),
  status: stringValue('active'),
})

await commit([
  update(`rooms/${roomId}`, {
    imagePath: stringValue(`room-covers/${roomId}/cover-test.jpg`),
    imageUrl: stringValue(
      `https://storage.yandexcloud.net/test/${roomId}/cover-test.jpg`,
    ),
    name: stringValue('Functions room'),
    ownerId: stringValue(owner.uid),
    settings: {
      mapValue: {
        fields: {
          allowGuestChat: booleanValue(true),
          allowGuestQueue: booleanValue(true),
          slowModeSeconds: integerValue(0),
        },
      },
    },
    status: stringValue('active'),
    visibility: stringValue('private'),
  }),
  update(`users/${owner.uid}`, {
    displayName: stringValue('Owner'),
    photoURL: nullValue(),
  }),
  update(`users/${futureOwner.uid}`, {
    displayName: stringValue('Future owner'),
    photoURL: nullValue(),
  }),
  update(`users/${member.uid}`, {
    displayName: stringValue('Member'),
    photoURL: nullValue(),
  }),
  update(`users/${bannedTarget.uid}`, {
    displayName: stringValue('Banned target'),
    photoURL: nullValue(),
  }),
  update(`rooms/${roomId}/members/${owner.uid}`, membership('owner')),
  update(`rooms/${roomId}/members/${futureOwner.uid}`, membership('member')),
  update(`rooms/${roomId}/members/${member.uid}`, membership('member')),
  update(`rooms/${roomId}/members/${bannedTarget.uid}`, membership('member')),
  update(`rooms/${roomId}/queueState/current`, {
    activePosition: integerValue(1),
    itemIds: arrayValue([firstItemId, secondItemId]),
    lastPosition: integerValue(2),
    updatedAt: timestampValue('2026-01-01T00:00:00Z'),
  }),
  update(`rooms/${roomId}/queue/${firstItemId}`, {
    createdAt: timestampValue('2026-01-01T00:00:00Z'),
    displayName: stringValue('Owner'),
    photoURL: nullValue(),
    position: integerValue(1),
    userId: stringValue(owner.uid),
    videoId: stringValue(firstVideoId),
  }),
  update(`rooms/${roomId}/queue/${secondItemId}`, {
    createdAt: timestampValue('2026-01-01T00:00:00Z'),
    displayName: stringValue('Member'),
    photoURL: nullValue(),
    position: integerValue(2),
    userId: stringValue(member.uid),
    videoId: stringValue(secondVideoId),
  }),
  update(`rooms/${roomId}/queueMembers/${owner.uid}`, {
    createdAt: timestampValue('2026-01-01T00:00:00Z'),
    itemId: stringValue(firstItemId),
    userId: stringValue(owner.uid),
  }),
  update(`rooms/${roomId}/queueMembers/${member.uid}`, {
    createdAt: timestampValue('2026-01-01T00:00:00Z'),
    itemId: stringValue(secondItemId),
    userId: stringValue(member.uid),
  }),
  update(`rooms/${roomId}/playback/current`, {
    changedAt: timestampValue('2026-01-01T00:00:00Z'),
    changedBy: stringValue(owner.uid),
    positionSeconds: integerValue(0),
    revision: integerValue(1),
    status: stringValue('playing'),
    videoId: stringValue(firstVideoId),
  }),
  update(`rooms/${roomId}/messages/message-1`, {
    authorId: stringValue(futureOwner.uid),
    authorName: stringValue('Future owner'),
    authorPhotoURL: nullValue(),
    createdAt: timestampValue('2026-01-01T00:00:00Z'),
    text: stringValue('Message under moderation'),
  }),
])

const realtimeAuthorization = await callFunction(
  'authorizeRealtimeRoom',
  { roomId },
  member.idToken,
)
assert.equal(
  realtimeAuthorization.ok,
  true,
  JSON.stringify(realtimeAuthorization),
)
const realtimeMemberLease = (
  await realtimeDb.ref(`roomAccess/${roomId}/members/${member.uid}`).get()
).val()
assert.equal(
  typeof realtimeMemberLease === 'number' && realtimeMemberLease > Date.now(),
  true,
  JSON.stringify(realtimeMemberLease),
)

const targetRealtimeAuthorization = await callFunction(
  'authorizeRealtimeRoom',
  { roomId },
  bannedTarget.idToken,
)
assert.equal(
  targetRealtimeAuthorization.ok,
  true,
  JSON.stringify(targetRealtimeAuthorization),
)
const targetBan = await callFunction(
  'moderateRoomMember',
  {
    action: 'ban',
    expiresAtMillis: null,
    memberId: bannedTarget.uid,
    reason: 'Realtime ban mirror verification',
    roomId,
  },
  owner.idToken,
)
assert.equal(targetBan.ok, true, JSON.stringify(targetBan))
const bannedRealtimeAccess = (
  await realtimeDb.ref(`roomAccess/${roomId}`).get()
).val()
assert.equal(bannedRealtimeAccess.bans[bannedTarget.uid], 0)
assert.equal(bannedRealtimeAccess.members?.[bannedTarget.uid] ?? null, null)

for (let index = 1; index < 10; index += 1) {
  const limitedRoomId = `server-room-${Date.now()}-${index}`
  const imagePath =
    `room-covers/${limitedRoomId}/` +
    'cover-12345678-1234-1234-1234-123456789abc.jpg'
  const createRoom = await callFunction(
    'createRoom',
    {
      categories: [{ id: 1, title: 'Поп' }],
      imagePath,
      imageUrl: `https://storage.yandexcloud.net/test/${imagePath}`,
      name: `Server room ${Date.now()} ${index}`,
      roomId: limitedRoomId,
      visibility: 'public',
    },
    owner.idToken,
  )
  assert.equal(createRoom.ok, true, JSON.stringify(createRoom))
}

const overLimitRoomId = `server-room-${Date.now()}-limit`
const overLimitImagePath =
  `room-covers/${overLimitRoomId}/` +
  'cover-12345678-1234-1234-1234-123456789abc.jpg'
const roomLimit = await callFunction(
  'createRoom',
  {
    categories: [{ id: 1, title: 'Поп' }],
    imagePath: overLimitImagePath,
    imageUrl: `https://storage.yandexcloud.net/test/${overLimitImagePath}`,
    name: `Over limit ${Date.now()}`,
    roomId: overLimitRoomId,
    visibility: 'public',
  },
  owner.idToken,
)
assert.equal(roomLimit.ok, false, JSON.stringify(roomLimit))

for (let index = 0; index < 5; index += 1) {
  const invite = await callFunction(
    'createRoomInvite',
    {
      expiresAtMillis: Date.now() + 60 * 60 * 1000,
      maxUses: 1,
      roomId,
    },
    owner.idToken,
  )
  assert.equal(invite.ok, true, JSON.stringify(invite))
  assert.match(invite.body.token, /^[A-Za-z0-9_-]{43}$/)
}

const inviteLimit = await callFunction(
  'createRoomInvite',
  {
    expiresAtMillis: Date.now() + 60 * 60 * 1000,
    maxUses: 1,
    roomId,
  },
  owner.idToken,
)
assert.equal(inviteLimit.ok, false, JSON.stringify(inviteLimit))

const memberRoleEscalation = await callFunction(
  'setRoomMemberRole',
  { memberId: futureOwner.uid, role: 'host', roomId },
  member.idToken,
)
assert.equal(
  memberRoleEscalation.ok,
  false,
  JSON.stringify(memberRoleEscalation),
)

const ownerRoleAssignment = await callFunction(
  'setRoomMemberRole',
  { memberId: futureOwner.uid, role: 'host', roomId },
  owner.idToken,
)
assert.equal(ownerRoleAssignment.ok, true, JSON.stringify(ownerRoleAssignment))

const firstMessage = await callFunction(
  'sendRoomMessage',
  { roomId, text: 'Server-side anti-spam verification' },
  futureOwner.idToken,
)
assert.equal(firstMessage.ok, true, JSON.stringify(firstMessage))
const storedMessage = await readDocument(
  `rooms/${roomId}/messages/${firstMessage.body.messageId}`,
)
const storedMessageCreatedAt = Date.parse(
  storedMessage.createdAt.timestampValue,
)
const storedMessageExpiresAt = Date.parse(
  storedMessage.expiresAt.timestampValue,
)
assert.equal(
  storedMessageExpiresAt - storedMessageCreatedAt,
  24 * 60 * 60 * 1000,
)

const tooFastMessage = await callFunction(
  'sendRoomMessage',
  { roomId, text: 'This message is too fast' },
  futureOwner.idToken,
)
assert.equal(tooFastMessage.ok, false, JSON.stringify(tooFastMessage))

const hostMute = await callFunction(
  'moderateRoomMember',
  {
    action: 'mute',
    expiresAtMillis: null,
    memberId: member.uid,
    reason: 'Functions verification',
    roomId,
  },
  futureOwner.idToken,
)
assert.equal(hostMute.ok, true, JSON.stringify(hostMute))
await readDocument(`rooms/${roomId}/mutes/${member.uid}`)

const waitingMemberSkip = await callFunction(
  'skipRoomVideo',
  { roomId },
  member.idToken,
)
assert.equal(waitingMemberSkip.ok, false, JSON.stringify(waitingMemberSkip))

const ownerSkip = await callFunction('skipRoomVideo', { roomId }, owner.idToken)
assert.equal(ownerSkip.ok, true, JSON.stringify(ownerSkip))
const queueState = await readDocument(`rooms/${roomId}/queueState/current`)
assert.equal(queueState.itemIds.arrayValue.values[0].stringValue, secondItemId)
const playback = await readDocument(`rooms/${roomId}/playback/current`)
assert.equal(playback.videoId.stringValue, secondVideoId)

const report = await callFunction(
  'createReport',
  {
    comment: 'Snapshot verification',
    reason: 'harassment',
    roomId,
    targetId: 'message-1',
    targetType: 'message',
  },
  member.idToken,
)
assert.equal(report.ok, true, JSON.stringify(report))
const storedReport = await readDocument(`reports/${report.body.reportId}`)
assert.equal(storedReport.status.stringValue, 'new')
assert.equal(storedReport.targetType.stringValue, 'message')
assert.equal(
  storedReport.snapshot.mapValue.fields.message.mapValue.fields.text
    .stringValue,
  'Message under moderation',
)

const deleteMessage = await callFunction(
  'deleteRoomMessage',
  { messageId: 'message-1', roomId },
  futureOwner.idToken,
)
assert.equal(deleteMessage.ok, true, JSON.stringify(deleteMessage))
const moderationLog = await readDocument(
  `moderationLogs/${deleteMessage.body.moderationLogId}`,
)
assert.equal(moderationLog.messageId.stringValue, 'message-1')
assert.equal(
  moderationLog.original.mapValue.fields.text.stringValue,
  'Message under moderation',
)

const transfer = await callFunction(
  'transferRoomOwnership',
  { memberId: futureOwner.uid, roomId },
  owner.idToken,
)
assert.equal(transfer.ok, true, JSON.stringify(transfer))
const room = await readDocument(`rooms/${roomId}`)
assert.equal(room.ownerId.stringValue, futureOwner.uid)
const previousOwner = await readDocument(`rooms/${roomId}/members/${owner.uid}`)
assert.equal(previousOwner.role.stringValue, 'host')
const nextOwner = await readDocument(
  `rooms/${roomId}/members/${futureOwner.uid}`,
)
assert.equal(nextOwner.role.stringValue, 'owner')

const roomAccessUpdate = await callFunction(
  'updateRoomAccess',
  {
    roomId,
    settings: {
      allowGuestChat: false,
      allowGuestQueue: false,
      slowModeSeconds: 30,
    },
    status: 'archived',
    visibility: 'unlisted',
  },
  futureOwner.idToken,
)
assert.equal(roomAccessUpdate.ok, true, JSON.stringify(roomAccessUpdate))
const realtimeRoomAccess = (
  await realtimeDb.ref(`roomAccess/${roomId}`).get()
).val()
assert.equal(realtimeRoomAccess.status, 'archived')
assert.equal(realtimeRoomAccess.visibility, 'unlisted')

console.log(
  'Room management verification passed: room/invite limits, realtime leases, roles, anti-spam, host mute, queue advance, immutable report snapshot, private message deletion log, ownership transfer, and mirrored room access updates.',
)
