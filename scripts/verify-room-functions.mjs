/* global console, fetch, process */

import assert from 'node:assert/strict'

const projectId = process.env.GCLOUD_PROJECT || 'demo-lwmusic'
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099'
const firestoreHost = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080'
const functionsHost = '127.0.0.1:5001'
const databaseRoot = `projects/${projectId}/databases/(default)/documents`
const firestoreUrl = `http://${firestoreHost}/v1/projects/${projectId}/databases/(default)/documents`

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
  const response = await fetch(
    `http://${functionsHost}/${projectId}/europe-west1/${name}`,
    {
      body: JSON.stringify({ data }),
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      method: 'POST',
    },
  )
  const body = await response.json()
  return { body, ok: response.ok, status: response.status }
}

const owner = await createAuthUser('owner')
const futureOwner = await createAuthUser('future-owner')
const member = await createAuthUser('member')
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
    ownerId: stringValue(owner.uid),
    status: stringValue('active'),
  }),
  update(`rooms/${roomId}/members/${owner.uid}`, membership('owner')),
  update(`rooms/${roomId}/members/${futureOwner.uid}`, membership('member')),
  update(`rooms/${roomId}/members/${member.uid}`, membership('member')),
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
  'reportRoomMessage',
  { messageId: 'message-1', reason: 'Проверка жалобы', roomId },
  member.idToken,
)
assert.equal(report.ok, true, JSON.stringify(report))

const deleteMessage = await callFunction(
  'deleteRoomMessage',
  { messageId: 'message-1', roomId },
  futureOwner.idToken,
)
assert.equal(deleteMessage.ok, true, JSON.stringify(deleteMessage))

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

console.log(
  'Room functions verification passed: role denial/assignment, host mute, skip authority and atomic queue advance, report, message deletion, and ownership transfer.',
)
