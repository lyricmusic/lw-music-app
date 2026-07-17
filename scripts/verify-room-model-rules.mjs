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
const nullValue = () => ({ nullValue: null })
const mapValue = fields => ({ mapValue: { fields } })
const arrayValue = values => ({ arrayValue: { values } })

function documentPath(path) {
  return `${databaseRoot}/${path}`
}

function update(path, fields, updateTransforms = []) {
  return {
    update: { fields, name: documentPath(path) },
    ...(updateTransforms.length > 0 ? { updateTransforms } : {}),
  }
}

async function createAuthUser(label) {
  const response = await fetch(
    `http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake`,
    {
      body: JSON.stringify({
        email: `${label}-${Date.now()}@example.test`,
        password: 'room-model-rules-password',
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

async function createAnonymousUser() {
  const response = await fetch(
    `http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake`,
    {
      body: JSON.stringify({ returnSecureToken: true }),
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

async function readDocument(path, token) {
  const response = await fetch(
    `http://${firestoreHost}/v1/${documentPath(path)}`,
    {
      headers: { authorization: `Bearer ${token}` },
    },
  )
  const body = await response.json()
  return { body, ok: response.ok, status: response.status }
}

const requestTime = fieldPath => ({
  fieldPath,
  setToServerValue: 'REQUEST_TIME',
})

function roomFields({
  name,
  nameKey,
  ownerId,
  roomId,
  status = 'active',
  visibility,
}) {
  return {
    categories: arrayValue([
      mapValue({ id: integerValue(1), title: stringValue('Рок') }),
    ]),
    imagePath: stringValue(`room-covers/${roomId}/cover.png`),
    imageUrl: stringValue(
      `https://storage.yandexcloud.net/test-bucket/room-covers/${roomId}/cover.png`,
    ),
    name: stringValue(name),
    nameKey: stringValue(nameKey),
    ownerId: stringValue(ownerId),
    settings: mapValue({
      allowGuestChat: booleanValue(true),
      allowGuestQueue: booleanValue(true),
      slowModeSeconds: integerValue(0),
    }),
    status: stringValue(status),
    visibility: stringValue(visibility),
  }
}

function memberFields({ isGuest, role }) {
  return {
    invitedBy: nullValue(),
    isGuest: booleanValue(isGuest),
    role: stringValue(role),
    status: stringValue('active'),
  }
}

function roomCreationWrites({
  includeMember = true,
  isGuest = false,
  ownerId,
  role = 'owner',
  status = 'active',
  suffix,
  visibility = 'public',
}) {
  const roomId = `room-model-${suffix}`
  const name = `Room model ${suffix}`
  const nameKey = `v1:room-model-${suffix}`
  const writes = [
    update(
      `roomNames/${nameKey}`,
      {
        name: stringValue(name),
        ownerId: stringValue(ownerId),
        roomId: stringValue(roomId),
      },
      [requestTime('createdAt')],
    ),
    update(
      `rooms/${roomId}`,
      roomFields({ name, nameKey, ownerId, roomId, status, visibility }),
      [requestTime('createdAt'), requestTime('updatedAt')],
    ),
  ]

  if (includeMember) {
    writes.push(
      update(
        `rooms/${roomId}/members/${ownerId}`,
        memberFields({ isGuest, role }),
        [requestTime('joinedAt')],
      ),
    )
  }

  return { roomId, writes }
}

const owner = await createAuthUser('owner')
const otherUser = await createAuthUser('other')
const anonymousUser = await createAnonymousUser()
const runId = `${Date.now()}`

const validRoom = roomCreationWrites({
  ownerId: owner.uid,
  suffix: `${runId}-valid`,
})
const validCreate = await commit(validRoom.writes, owner.idToken)
assert.equal(validCreate.ok, true, JSON.stringify(validCreate))

const anonymousProfile = await commit(
  [
    update(
      `users/${anonymousUser.uid}`,
      {
        avatar: mapValue({
          presetId: stringValue('pulse'),
          storagePath: nullValue(),
          type: stringValue('preset'),
        }),
        displayName: stringValue('Guest'),
        email: stringValue(''),
        onboardingCompleted: booleanValue(true),
        photoURL: stringValue('/avatars/pulse.svg'),
      },
      [requestTime('createdAt'), requestTime('updatedAt')],
    ),
  ],
  anonymousUser.idToken,
)
assert.equal(anonymousProfile.ok, true, JSON.stringify(anonymousProfile))

const anonymousPublicRoomRead = await readDocument(
  `rooms/${validRoom.roomId}`,
  anonymousUser.idToken,
)
assert.equal(
  anonymousPublicRoomRead.ok,
  true,
  JSON.stringify(anonymousPublicRoomRead),
)

const anonymousMembership = await commit(
  [
    update(
      `rooms/${validRoom.roomId}/members/${anonymousUser.uid}`,
      memberFields({ isGuest: true, role: 'member' }),
      [requestTime('joinedAt')],
    ),
  ],
  anonymousUser.idToken,
)
assert.equal(anonymousMembership.ok, true, JSON.stringify(anonymousMembership))

const anonymousMessage = await commit(
  [
    update(
      `rooms/${validRoom.roomId}/messages/guest-${runId}`,
      {
        authorId: stringValue(anonymousUser.uid),
        authorName: stringValue('Guest'),
        authorPhotoURL: stringValue('/avatars/pulse.svg'),
        text: stringValue('Hello from guest'),
      },
      [requestTime('createdAt')],
    ),
  ],
  anonymousUser.idToken,
)
assert.equal(anonymousMessage.ok, true, JSON.stringify(anonymousMessage))

const registeredMembership = await commit(
  [
    update(
      `rooms/${validRoom.roomId}/members/${otherUser.uid}`,
      memberFields({ isGuest: false, role: 'member' }),
      [requestTime('joinedAt')],
    ),
  ],
  otherUser.idToken,
)
assert.equal(
  registeredMembership.ok,
  true,
  JSON.stringify(registeredMembership),
)

const privateRoom = roomCreationWrites({
  ownerId: owner.uid,
  suffix: `${runId}-private`,
  visibility: 'private',
})
const privateRoomCreate = await commit(privateRoom.writes, owner.idToken)
assert.equal(privateRoomCreate.ok, true, JSON.stringify(privateRoomCreate))

const anonymousPrivateRoomRead = await readDocument(
  `rooms/${privateRoom.roomId}`,
  anonymousUser.idToken,
)
assert.equal(
  anonymousPrivateRoomRead.ok,
  false,
  JSON.stringify(anonymousPrivateRoomRead),
)

const anonymousPrivateMembership = await commit(
  [
    update(
      `rooms/${privateRoom.roomId}/members/${anonymousUser.uid}`,
      memberFields({ isGuest: true, role: 'member' }),
      [requestTime('joinedAt')],
    ),
  ],
  anonymousUser.idToken,
)
assert.equal(
  anonymousPrivateMembership.ok,
  false,
  JSON.stringify(anonymousPrivateMembership),
)

const archivedRoom = roomCreationWrites({
  ownerId: owner.uid,
  status: 'archived',
  suffix: `${runId}-archived`,
})
const archivedRoomCreate = await commit(archivedRoom.writes, owner.idToken)
assert.equal(archivedRoomCreate.ok, true, JSON.stringify(archivedRoomCreate))

const anonymousArchivedMembership = await commit(
  [
    update(
      `rooms/${archivedRoom.roomId}/members/${anonymousUser.uid}`,
      memberFields({ isGuest: true, role: 'member' }),
      [requestTime('joinedAt')],
    ),
  ],
  anonymousUser.idToken,
)
assert.equal(
  anonymousArchivedMembership.ok,
  false,
  JSON.stringify(anonymousArchivedMembership),
)

const missingMember = roomCreationWrites({
  includeMember: false,
  ownerId: owner.uid,
  suffix: `${runId}-missing-member`,
})
const missingMemberCreate = await commit(missingMember.writes, owner.idToken)
assert.equal(missingMemberCreate.ok, false, JSON.stringify(missingMemberCreate))

const wrongOwnerRole = roomCreationWrites({
  ownerId: owner.uid,
  role: 'member',
  suffix: `${runId}-wrong-role`,
})
const wrongOwnerRoleCreate = await commit(wrongOwnerRole.writes, owner.idToken)
assert.equal(
  wrongOwnerRoleCreate.ok,
  false,
  JSON.stringify(wrongOwnerRoleCreate),
)

const invalidVisibility = roomCreationWrites({
  ownerId: owner.uid,
  suffix: `${runId}-invalid-visibility`,
  visibility: 'secret',
})
const invalidVisibilityCreate = await commit(
  invalidVisibility.writes,
  owner.idToken,
)
assert.equal(
  invalidVisibilityCreate.ok,
  false,
  JSON.stringify(invalidVisibilityCreate),
)

const anonymousRoom = roomCreationWrites({
  isGuest: true,
  ownerId: anonymousUser.uid,
  suffix: `${runId}-anonymous`,
})
const anonymousCreate = await commit(
  anonymousRoom.writes,
  anonymousUser.idToken,
)
assert.equal(anonymousCreate.ok, false, JSON.stringify(anonymousCreate))

const foreignOwnerMembership = await commit(
  [
    update(
      `rooms/${validRoom.roomId}/members/${otherUser.uid}`,
      memberFields({ isGuest: false, role: 'owner' }),
      [requestTime('joinedAt')],
    ),
  ],
  otherUser.idToken,
)
assert.equal(
  foreignOwnerMembership.ok,
  false,
  JSON.stringify(foreignOwnerMembership),
)

console.log(
  'Room model rules verification passed: owner model, anonymous profile, public self-join, private and archived room denial.',
)
