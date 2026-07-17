/* global console, fetch, process */

import assert from 'node:assert/strict'

const projectId = process.env.GCLOUD_PROJECT || 'demo-lwmusic'
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099'
const firestoreHost = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080'
const databaseRoot = `projects/${projectId}/databases/(default)/documents`
const firestoreUrl = `http://${firestoreHost}/v1/projects/${projectId}/databases/(default)/documents:commit`

const stringValue = value => ({ stringValue: value })
const integerValue = value => ({ integerValue: String(value) })
const booleanValue = value => ({ booleanValue: value })
const timestampValue = value => ({ timestampValue: value })
const nullValue = () => ({ nullValue: null })
const mapValue = fields => ({ mapValue: { fields } })
const arrayValue = values => ({
  arrayValue: { values: values.map(stringValue) },
})

function documentPath(path) {
  return `${databaseRoot}/${path}`
}

function update(path, fields, updateTransforms = []) {
  return {
    update: { fields, name: documentPath(path) },
    ...(updateTransforms.length > 0 ? { updateTransforms } : {}),
  }
}

function remove(path) {
  return { delete: documentPath(path) }
}

async function createAuthUser(label) {
  const response = await fetch(
    `http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake`,
    {
      body: JSON.stringify({
        email: `${label}-${Date.now()}@example.test`,
        password: 'queue-rules-password',
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

async function commit(writes, token) {
  const response = await fetch(firestoreUrl, {
    body: JSON.stringify({ writes }),
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    method: 'POST',
  })
  const body = await response.json()
  return { body, ok: response.ok, status: response.status }
}

function queueItemFields({ position, userId, videoId }) {
  return {
    createdAt: timestampValue('2026-01-01T00:00:00Z'),
    displayName: stringValue(`User ${position}`),
    photoURL: nullValue(),
    position: integerValue(position),
    userId: stringValue(userId),
    videoId: stringValue(videoId),
  }
}

function queueMemberFields({ itemId, userId }) {
  return {
    createdAt: timestampValue('2026-01-01T00:00:00Z'),
    itemId: stringValue(itemId),
    userId: stringValue(userId),
  }
}

function queueStateFields(itemIds, activePosition, lastPosition = 2) {
  return {
    activePosition:
      activePosition === null ? nullValue() : integerValue(activePosition),
    itemIds: arrayValue(itemIds),
    lastPosition: integerValue(lastPosition),
    updatedAt: timestampValue('2026-01-01T00:00:00Z'),
  }
}

function playbackFields({ changedBy, revision, videoId }) {
  return {
    changedAt: timestampValue('2026-01-01T00:00:00Z'),
    changedBy: stringValue(changedBy),
    positionSeconds: integerValue(0),
    revision: integerValue(revision),
    status: stringValue('playing'),
    videoId: stringValue(videoId),
  }
}

const roomId = 'queue-rules-room'
const firstItemId = '000000000001'
const secondItemId = '000000000002'
const firstVideoId = 'dQw4w9WgXcQ'
const secondVideoId = 'M7lc1UVf-VE'
const requestTimeTransform = [
  { fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' },
]
const playbackTimeTransform = [
  { fieldPath: 'changedAt', setToServerValue: 'REQUEST_TIME' },
]

const firstUser = await createAuthUser('first')
const secondUser = await createAuthUser('second')

const accessSeed = await commit(
  [
    update(`rooms/${roomId}`, {
      ownerId: stringValue(firstUser.uid),
      settings: mapValue({
        allowGuestChat: booleanValue(true),
        allowGuestQueue: booleanValue(true),
        slowModeSeconds: integerValue(0),
      }),
      status: stringValue('active'),
      visibility: stringValue('public'),
    }),
    update(`rooms/${roomId}/members/${firstUser.uid}`, {
      invitedBy: nullValue(),
      isGuest: booleanValue(false),
      joinedAt: timestampValue('2026-01-01T00:00:00Z'),
      role: stringValue('owner'),
      status: stringValue('active'),
    }),
    update(`rooms/${roomId}/members/${secondUser.uid}`, {
      invitedBy: nullValue(),
      isGuest: booleanValue(false),
      joinedAt: timestampValue('2026-01-01T00:00:00Z'),
      role: stringValue('member'),
      status: stringValue('active'),
    }),
  ],
  'owner',
)
assert.equal(accessSeed.ok, true, JSON.stringify(accessSeed))

async function seedQueue() {
  const seeded = await commit(
    [
      update(
        `rooms/${roomId}/queueState/current`,
        queueStateFields([firstItemId, secondItemId], 1),
      ),
      update(
        `rooms/${roomId}/queue/${firstItemId}`,
        queueItemFields({
          position: 1,
          userId: firstUser.uid,
          videoId: firstVideoId,
        }),
      ),
      update(
        `rooms/${roomId}/queue/${secondItemId}`,
        queueItemFields({
          position: 2,
          userId: secondUser.uid,
          videoId: secondVideoId,
        }),
      ),
      update(
        `rooms/${roomId}/queueMembers/${firstUser.uid}`,
        queueMemberFields({ itemId: firstItemId, userId: firstUser.uid }),
      ),
      update(
        `rooms/${roomId}/queueMembers/${secondUser.uid}`,
        queueMemberFields({ itemId: secondItemId, userId: secondUser.uid }),
      ),
      update(
        `rooms/${roomId}/playback/current`,
        playbackFields({
          changedBy: firstUser.uid,
          revision: 1,
          videoId: firstVideoId,
        }),
      ),
    ],
    'owner',
  )
  assert.equal(seeded.ok, true, JSON.stringify(seeded))
}

await seedQueue()

const waitingLeave = await commit(
  [
    update(
      `rooms/${roomId}/queueState/current`,
      {
        activePosition: integerValue(1),
        itemIds: arrayValue([firstItemId]),
        lastPosition: integerValue(2),
      },
      requestTimeTransform,
    ),
    remove(`rooms/${roomId}/queue/${secondItemId}`),
    remove(`rooms/${roomId}/queueMembers/${secondUser.uid}`),
  ],
  secondUser.idToken,
)
assert.equal(waitingLeave.ok, true, JSON.stringify(waitingLeave))

await seedQueue()

const activeLeave = await commit(
  [
    update(
      `rooms/${roomId}/queueState/current`,
      {
        activePosition: integerValue(2),
        itemIds: arrayValue([secondItemId]),
        lastPosition: integerValue(2),
      },
      requestTimeTransform,
    ),
    remove(`rooms/${roomId}/queue/${firstItemId}`),
    remove(`rooms/${roomId}/queueMembers/${firstUser.uid}`),
    update(
      `rooms/${roomId}/playback/current`,
      {
        changedBy: stringValue(firstUser.uid),
        positionSeconds: integerValue(0),
        revision: integerValue(2),
        status: stringValue('playing'),
        videoId: stringValue(secondVideoId),
      },
      playbackTimeTransform,
    ),
  ],
  firstUser.idToken,
)
assert.equal(activeLeave.ok, true, JSON.stringify(activeLeave))

const seedLastActive = await commit(
  [
    update(
      `rooms/${roomId}/queueState/current`,
      queueStateFields([firstItemId], 3, 3),
    ),
    update(
      `rooms/${roomId}/queue/${firstItemId}`,
      queueItemFields({
        position: 3,
        userId: firstUser.uid,
        videoId: firstVideoId,
      }),
    ),
    update(
      `rooms/${roomId}/queueMembers/${firstUser.uid}`,
      queueMemberFields({ itemId: firstItemId, userId: firstUser.uid }),
    ),
    update(
      `rooms/${roomId}/playback/current`,
      playbackFields({
        changedBy: firstUser.uid,
        revision: 3,
        videoId: firstVideoId,
      }),
    ),
    remove(`rooms/${roomId}/queue/${secondItemId}`),
    remove(`rooms/${roomId}/queueMembers/${secondUser.uid}`),
  ],
  'owner',
)
assert.equal(seedLastActive.ok, true, JSON.stringify(seedLastActive))

const lastActiveLeave = await commit(
  [
    update(
      `rooms/${roomId}/queueState/current`,
      {
        activePosition: nullValue(),
        itemIds: arrayValue([]),
        lastPosition: integerValue(3),
      },
      requestTimeTransform,
    ),
    remove(`rooms/${roomId}/queue/${firstItemId}`),
    remove(`rooms/${roomId}/queueMembers/${firstUser.uid}`),
    remove(`rooms/${roomId}/playback/current`),
  ],
  firstUser.idToken,
)
assert.equal(lastActiveLeave.ok, true, JSON.stringify(lastActiveLeave))

console.log(
  'Queue rules verification passed: waiting, active-next, active-last.',
)
