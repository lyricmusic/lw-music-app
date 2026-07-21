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

function patch(path, fields, fieldPaths, updateTransforms = []) {
  return {
    update: { fields, name: documentPath(path) },
    updateMask: { fieldPaths },
    ...(updateTransforms.length > 0 ? { updateTransforms } : {}),
  }
}

function remove(path) {
  return { delete: documentPath(path) }
}

async function createAuthUser(label) {
  const email = `${label}-${Date.now()}@example.test`
  const response = await fetch(
    `http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake`,
    {
      body: JSON.stringify({
        email,
        password: 'room-model-rules-password',
        returnSecureToken: true,
      }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    },
  )
  const body = await response.json()
  assert.equal(response.ok, true, JSON.stringify(body))
  return { email, idToken: body.idToken, uid: body.localId }
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

async function upgradeAnonymousUser(user, label) {
  const response = await fetch(
    `http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:update?key=fake`,
    {
      body: JSON.stringify({
        email: `${label}-${Date.now()}@example.test`,
        idToken: user.idToken,
        password: 'upgraded-guest-password',
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

async function readDocument(path, token) {
  const headers = token ? { authorization: `Bearer ${token}` } : undefined
  const response = await fetch(
    `http://${firestoreHost}/v1/${documentPath(path)}`,
    { headers },
  )
  const body = await response.json()
  return { body, ok: response.ok, status: response.status }
}

async function queryRooms(token, constrained) {
  const where = constrained
    ? {
        fieldFilter: {
          field: { fieldPath: 'visibility' },
          op: 'EQUAL',
          value: stringValue('public'),
        },
      }
    : undefined
  const response = await fetch(
    `http://${firestoreHost}/v1/projects/${projectId}/databases/(default)/documents:runQuery`,
    {
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: 'rooms' }],
          ...(where ? { where } : {}),
          ...(constrained
            ? {
                limit: 20,
                orderBy: [
                  {
                    direction: 'DESCENDING',
                    field: { fieldPath: 'createdAt' },
                  },
                ],
              }
            : {}),
        },
      }),
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

async function queryCollectionByField(collectionId, fieldPath, value, token) {
  const headers = { 'content-type': 'application/json' }
  if (token) headers.authorization = `Bearer ${token}`

  const response = await fetch(
    `http://${firestoreHost}/v1/projects/${projectId}/databases/(default)/documents:runQuery`,
    {
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId }],
          where: {
            fieldFilter: {
              field: { fieldPath },
              op: 'EQUAL',
              value: stringValue(value),
            },
          },
        },
      }),
      headers,
      method: 'POST',
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
  slowModeSeconds = 0,
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
      slowModeSeconds: integerValue(slowModeSeconds),
    }),
    status: stringValue(status),
    visibility: stringValue(visibility),
  }
}

function memberFields({ invitedBy = null, isGuest, role, status = 'active' }) {
  return {
    invitedBy: invitedBy == null ? nullValue() : stringValue(invitedBy),
    isGuest: booleanValue(isGuest),
    role: stringValue(role),
    status: stringValue(status),
  }
}

function roomCreationWrites({
  includeMember = true,
  isGuest = false,
  ownerId,
  role = 'owner',
  slowModeSeconds = 0,
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
      roomFields({
        name,
        nameKey,
        ownerId,
        roomId,
        slowModeSeconds,
        status,
        visibility,
      }),
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
const invitee = await createAuthUser('invitee')
const anonymousUser = await createAnonymousUser()
const runId = `${Date.now()}`

const validRoom = roomCreationWrites({
  ownerId: owner.uid,
  suffix: `${runId}-valid`,
})
const clientRoomCreate = await commit(validRoom.writes, owner.idToken)
assert.equal(clientRoomCreate.ok, false, JSON.stringify(clientRoomCreate))
const validCreate = await commit(validRoom.writes, 'owner')
assert.equal(validCreate.ok, true, JSON.stringify(validCreate))

const unconstrainedRoomList = await queryRooms(otherUser.idToken, false)
assert.equal(
  unconstrainedRoomList.ok,
  false,
  JSON.stringify(unconstrainedRoomList),
)

const publicRoomList = await queryRooms(otherUser.idToken, true)
assert.equal(publicRoomList.ok, true, JSON.stringify(publicRoomList))

const anonymousPublicRoomList = await queryRooms(anonymousUser.idToken, true)
assert.equal(
  anonymousPublicRoomList.ok,
  true,
  JSON.stringify(anonymousPublicRoomList),
)

const publicRoomMemberReadBeforeJoin = await readDocument(
  `rooms/${validRoom.roomId}/members/${owner.uid}`,
  otherUser.idToken,
)
assert.equal(
  publicRoomMemberReadBeforeJoin.ok,
  false,
  JSON.stringify(publicRoomMemberReadBeforeJoin),
)

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
        character: mapValue({
          accentColor: stringValue('violet'),
          appearanceId: stringValue('base'),
          danceId: stringValue('side-step'),
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

const unlistedRoom = roomCreationWrites({
  ownerId: owner.uid,
  suffix: `${runId}-unlisted`,
  visibility: 'unlisted',
})
const unlistedRoomCreate = await commit(unlistedRoom.writes, 'owner')
assert.equal(unlistedRoomCreate.ok, true, JSON.stringify(unlistedRoomCreate))

const unlistedRoomList = await queryRooms(otherUser.idToken, true)
assert.equal(unlistedRoomList.ok, true, JSON.stringify(unlistedRoomList))
assert.equal(
  JSON.stringify(unlistedRoomList.body).includes(unlistedRoom.roomId),
  false,
  JSON.stringify(unlistedRoomList),
)

const unlistedRoomRead = await readDocument(
  `rooms/${unlistedRoom.roomId}`,
  otherUser.idToken,
)
assert.equal(unlistedRoomRead.ok, true, JSON.stringify(unlistedRoomRead))

const unlistedMembership = await commit(
  [
    update(
      `rooms/${unlistedRoom.roomId}/members/${otherUser.uid}`,
      memberFields({ isGuest: false, role: 'member' }),
      [requestTime('joinedAt')],
    ),
  ],
  otherUser.idToken,
)
assert.equal(unlistedMembership.ok, true, JSON.stringify(unlistedMembership))

const promoteGuest = await commit(
  [
    patch(
      `rooms/${validRoom.roomId}/members/${anonymousUser.uid}`,
      { role: stringValue('moderator') },
      ['role'],
    ),
  ],
  owner.idToken,
)
assert.equal(promoteGuest.ok, false, JSON.stringify(promoteGuest))

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
    update(
      `rooms/${validRoom.roomId}/messageActivity/${anonymousUser.uid}`,
      {
        messageId: stringValue(`guest-${runId}`),
      },
      [requestTime('lastMessageAt')],
    ),
  ],
  anonymousUser.idToken,
)
assert.equal(anonymousMessage.ok, false, JSON.stringify(anonymousMessage))

const secondAnonymousMessage = await commit(
  [
    update(
      `rooms/${validRoom.roomId}/messages/guest-second-${runId}`,
      {
        authorId: stringValue(anonymousUser.uid),
        authorName: stringValue('Guest'),
        authorPhotoURL: stringValue('/avatars/pulse.svg'),
        text: stringValue('Guest anti-spam check'),
      },
      [requestTime('createdAt')],
    ),
    update(
      `rooms/${validRoom.roomId}/messageActivity/${anonymousUser.uid}`,
      { messageId: stringValue(`guest-second-${runId}`) },
      [requestTime('lastMessageAt')],
    ),
  ],
  anonymousUser.idToken,
)
assert.equal(
  secondAnonymousMessage.ok,
  false,
  JSON.stringify(secondAnonymousMessage),
)

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

const roleChange = await commit(
  [
    patch(
      `rooms/${validRoom.roomId}/members/${otherUser.uid}`,
      { role: stringValue('host') },
      ['role'],
    ),
  ],
  owner.idToken,
)
assert.equal(roleChange.ok, false, JSON.stringify(roleChange))

const serverRoleChange = await commit(
  [
    patch(
      `rooms/${validRoom.roomId}/members/${otherUser.uid}`,
      { role: stringValue('host') },
      ['role'],
    ),
  ],
  'owner',
)
assert.equal(serverRoleChange.ok, true, JSON.stringify(serverRoleChange))

const selfLeave = await commit(
  [
    patch(
      `rooms/${validRoom.roomId}/members/${otherUser.uid}`,
      { status: stringValue('left') },
      ['status'],
    ),
  ],
  otherUser.idToken,
)
assert.equal(selfLeave.ok, true, JSON.stringify(selfLeave))

const publicRejoin = await commit(
  [
    update(
      `rooms/${validRoom.roomId}/members/${otherUser.uid}`,
      memberFields({ isGuest: false, role: 'member' }),
      [requestTime('joinedAt')],
    ),
  ],
  otherUser.idToken,
)
assert.equal(publicRejoin.ok, true, JSON.stringify(publicRejoin))

const ownerKick = await commit(
  [
    patch(
      `rooms/${validRoom.roomId}/members/${otherUser.uid}`,
      { status: stringValue('left') },
      ['status'],
    ),
  ],
  owner.idToken,
)
assert.equal(ownerKick.ok, false, JSON.stringify(ownerKick))

const serverOwnerKick = await commit(
  [
    patch(
      `rooms/${validRoom.roomId}/members/${otherUser.uid}`,
      { status: stringValue('left') },
      ['status'],
    ),
  ],
  'owner',
)
assert.equal(serverOwnerKick.ok, true, JSON.stringify(serverOwnerKick))

const publicRejoinAfterKick = await commit(
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
  publicRejoinAfterKick.ok,
  true,
  JSON.stringify(publicRejoinAfterKick),
)

const secondRegisteredMembership = await commit(
  [
    update(
      `rooms/${validRoom.roomId}/members/${invitee.uid}`,
      memberFields({ isGuest: false, role: 'member' }),
      [requestTime('joinedAt')],
    ),
  ],
  invitee.idToken,
)
assert.equal(
  secondRegisteredMembership.ok,
  true,
  JSON.stringify(secondRegisteredMembership),
)

const makeHost = await commit(
  [
    patch(
      `rooms/${validRoom.roomId}/members/${otherUser.uid}`,
      { role: stringValue('host') },
      ['role'],
    ),
  ],
  'owner',
)
assert.equal(makeHost.ok, true, JSON.stringify(makeHost))

const hostKickMember = await commit(
  [
    patch(
      `rooms/${validRoom.roomId}/members/${invitee.uid}`,
      { status: stringValue('left') },
      ['status'],
    ),
  ],
  otherUser.idToken,
)
assert.equal(hostKickMember.ok, false, JSON.stringify(hostKickMember))

const serverHostKickMember = await commit(
  [
    patch(
      `rooms/${validRoom.roomId}/members/${invitee.uid}`,
      { status: stringValue('left') },
      ['status'],
    ),
  ],
  'owner',
)
assert.equal(
  serverHostKickMember.ok,
  true,
  JSON.stringify(serverHostKickMember),
)

const kickedMemberRejoin = await commit(
  [
    update(
      `rooms/${validRoom.roomId}/members/${invitee.uid}`,
      memberFields({ isGuest: false, role: 'member' }),
      [requestTime('joinedAt')],
    ),
  ],
  invitee.idToken,
)
assert.equal(kickedMemberRejoin.ok, true, JSON.stringify(kickedMemberRejoin))

const makeModerator = await commit(
  [
    patch(
      `rooms/${validRoom.roomId}/members/${invitee.uid}`,
      { role: stringValue('moderator') },
      ['role'],
    ),
  ],
  'owner',
)
assert.equal(makeModerator.ok, true, JSON.stringify(makeModerator))

const hostKickModerator = await commit(
  [
    patch(
      `rooms/${validRoom.roomId}/members/${invitee.uid}`,
      { status: stringValue('left') },
      ['status'],
    ),
  ],
  otherUser.idToken,
)
assert.equal(hostKickModerator.ok, false, JSON.stringify(hostKickModerator))

const moderatorKickHost = await commit(
  [
    patch(
      `rooms/${validRoom.roomId}/members/${otherUser.uid}`,
      { status: stringValue('left') },
      ['status'],
    ),
  ],
  invitee.idToken,
)
assert.equal(moderatorKickHost.ok, false, JSON.stringify(moderatorKickHost))

const resetManagementRoles = await commit(
  [
    patch(
      `rooms/${validRoom.roomId}/members/${otherUser.uid}`,
      { role: stringValue('member') },
      ['role'],
    ),
    patch(
      `rooms/${validRoom.roomId}/members/${invitee.uid}`,
      { role: stringValue('member') },
      ['role'],
    ),
  ],
  'owner',
)
assert.equal(
  resetManagementRoles.ok,
  true,
  JSON.stringify(resetManagementRoles),
)

const memberKickMember = await commit(
  [
    patch(
      `rooms/${validRoom.roomId}/members/${invitee.uid}`,
      { status: stringValue('left') },
      ['status'],
    ),
  ],
  otherUser.idToken,
)
assert.equal(memberKickMember.ok, false, JSON.stringify(memberKickMember))

const registeredProfile = await commit(
  [
    update(
      `users/${otherUser.uid}`,
      {
        avatar: mapValue({
          presetId: stringValue('beat'),
          storagePath: nullValue(),
          type: stringValue('preset'),
        }),
        character: mapValue({
          accentColor: stringValue('cyan'),
          appearanceId: stringValue('base'),
          danceId: stringValue('side-step'),
        }),
        displayName: stringValue('Registered member'),
        email: stringValue(otherUser.email),
        onboardingCompleted: booleanValue(true),
        photoURL: stringValue('/avatars/beat.svg'),
      },
      [requestTime('createdAt'), requestTime('updatedAt')],
    ),
  ],
  otherUser.idToken,
)
assert.equal(registeredProfile.ok, true, JSON.stringify(registeredProfile))

const validCharacterUpdate = await commit(
  [
    patch(
      `users/${otherUser.uid}`,
      {
        character: mapValue({
          accentColor: stringValue('pink'),
          appearanceId: stringValue('base'),
          danceId: stringValue('side-step'),
          genderId: stringValue('female'),
        }),
      },
      ['character'],
      [requestTime('updatedAt')],
    ),
  ],
  otherUser.idToken,
)
assert.equal(
  validCharacterUpdate.ok,
  true,
  JSON.stringify(validCharacterUpdate),
)

const validNeonCharacterUpdate = await commit(
  [
    patch(
      `users/${otherUser.uid}`,
      {
        character: mapValue({
          accentColor: stringValue('pink'),
          appearanceId: stringValue('neon'),
          danceId: stringValue('side-step'),
          genderId: stringValue('male'),
        }),
      },
      ['character'],
      [requestTime('updatedAt')],
    ),
  ],
  otherUser.idToken,
)
assert.equal(
  validNeonCharacterUpdate.ok,
  true,
  JSON.stringify(validNeonCharacterUpdate),
)

const unavailableCharacterUpdate = await commit(
  [
    patch(
      `users/${otherUser.uid}`,
      {
        character: mapValue({
          accentColor: stringValue('pink'),
          appearanceId: stringValue('club'),
          danceId: stringValue('side-step'),
          genderId: stringValue('male'),
        }),
      },
      ['character'],
      [requestTime('updatedAt')],
    ),
  ],
  otherUser.idToken,
)
assert.equal(
  unavailableCharacterUpdate.ok,
  false,
  JSON.stringify(unavailableCharacterUpdate),
)

const userBlock = await commit(
  [
    update(`users/${otherUser.uid}/blockedUsers/${owner.uid}`, {}, [
      requestTime('createdAt'),
    ]),
  ],
  otherUser.idToken,
)
assert.equal(userBlock.ok, true, JSON.stringify(userBlock))

const mute = await commit(
  [
    update(`rooms/${validRoom.roomId}/mutes/${otherUser.uid}`, {
      expiresAt: nullValue(),
      mutedBy: stringValue(owner.uid),
      reason: stringValue('Muted by rules test'),
    }),
  ],
  owner.idToken,
)
assert.equal(mute.ok, false, JSON.stringify(mute))

const serverMute = await commit(
  [
    update(`rooms/${validRoom.roomId}/mutes/${otherUser.uid}`, {
      expiresAt: nullValue(),
      mutedBy: stringValue(owner.uid),
      reason: stringValue('Muted by server rules test'),
    }),
  ],
  'owner',
)
assert.equal(serverMute.ok, true, JSON.stringify(serverMute))

const mutedMessageId = `muted-${runId}`
const mutedMessage = await commit(
  [
    update(
      `rooms/${validRoom.roomId}/messages/${mutedMessageId}`,
      {
        authorId: stringValue(otherUser.uid),
        authorName: stringValue('Registered member'),
        authorPhotoURL: stringValue('/avatars/beat.svg'),
        text: stringValue('This message must be denied'),
      },
      [requestTime('createdAt')],
    ),
    update(
      `rooms/${validRoom.roomId}/messageActivity/${otherUser.uid}`,
      { messageId: stringValue(mutedMessageId) },
      [requestTime('lastMessageAt')],
    ),
  ],
  otherUser.idToken,
)
assert.equal(mutedMessage.ok, false, JSON.stringify(mutedMessage))

const unmute = await commit(
  [remove(`rooms/${validRoom.roomId}/mutes/${otherUser.uid}`)],
  owner.idToken,
)
assert.equal(unmute.ok, false, JSON.stringify(unmute))

const serverUnmute = await commit(
  [remove(`rooms/${validRoom.roomId}/mutes/${otherUser.uid}`)],
  'owner',
)
assert.equal(serverUnmute.ok, true, JSON.stringify(serverUnmute))

const ban = await commit(
  [
    update(
      `rooms/${validRoom.roomId}/bans/${otherUser.uid}`,
      {
        bannedBy: stringValue(owner.uid),
        expiresAt: nullValue(),
        reason: stringValue('Banned by rules test'),
      },
      [requestTime('createdAt')],
    ),
    patch(
      `rooms/${validRoom.roomId}/members/${otherUser.uid}`,
      { status: stringValue('left') },
      ['status'],
    ),
  ],
  owner.idToken,
)
assert.equal(ban.ok, false, JSON.stringify(ban))

const serverBan = await commit(
  [
    update(
      `rooms/${validRoom.roomId}/bans/${otherUser.uid}`,
      {
        bannedBy: stringValue(owner.uid),
        expiresAt: nullValue(),
        reason: stringValue('Banned by server rules test'),
      },
      [requestTime('createdAt')],
    ),
    patch(
      `rooms/${validRoom.roomId}/members/${otherUser.uid}`,
      { status: stringValue('left') },
      ['status'],
    ),
  ],
  'owner',
)
assert.equal(serverBan.ok, true, JSON.stringify(serverBan))

const bannedRoomRead = await readDocument(
  `rooms/${validRoom.roomId}`,
  otherUser.idToken,
)
assert.equal(bannedRoomRead.ok, false, JSON.stringify(bannedRoomRead))

const unban = await commit(
  [remove(`rooms/${validRoom.roomId}/bans/${otherUser.uid}`)],
  owner.idToken,
)
assert.equal(unban.ok, false, JSON.stringify(unban))

const serverUnban = await commit(
  [remove(`rooms/${validRoom.roomId}/bans/${otherUser.uid}`)],
  'owner',
)
assert.equal(serverUnban.ok, true, JSON.stringify(serverUnban))

const rejoinAfterBan = await commit(
  [
    update(
      `rooms/${validRoom.roomId}/members/${otherUser.uid}`,
      memberFields({ isGuest: false, role: 'member' }),
      [requestTime('joinedAt')],
    ),
  ],
  otherUser.idToken,
)
assert.equal(rejoinAfterBan.ok, true, JSON.stringify(rejoinAfterBan))

const privateRoom = roomCreationWrites({
  ownerId: owner.uid,
  suffix: `${runId}-private`,
  visibility: 'private',
})
const privateRoomCreate = await commit(privateRoom.writes, 'owner')
assert.equal(privateRoomCreate.ok, true, JSON.stringify(privateRoomCreate))

const registeredPrivateRoomRead = await readDocument(
  `rooms/${privateRoom.roomId}`,
  otherUser.idToken,
)
assert.equal(
  registeredPrivateRoomRead.ok,
  false,
  JSON.stringify(registeredPrivateRoomRead),
)

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

const registeredPrivateMembership = await commit(
  [
    update(
      `rooms/${privateRoom.roomId}/members/${otherUser.uid}`,
      memberFields({ isGuest: false, role: 'member' }),
      [requestTime('joinedAt')],
    ),
  ],
  otherUser.idToken,
)
assert.equal(
  registeredPrivateMembership.ok,
  false,
  JSON.stringify(registeredPrivateMembership),
)

const privateMessageReadBeforeInvite = await readDocument(
  `rooms/${privateRoom.roomId}/messages/not-created`,
  invitee.idToken,
)
assert.equal(
  privateMessageReadBeforeInvite.status,
  403,
  JSON.stringify(privateMessageReadBeforeInvite),
)

const privateQueueReadBeforeInvite = await readDocument(
  `rooms/${privateRoom.roomId}/queue/not-created`,
  invitee.idToken,
)
assert.equal(
  privateQueueReadBeforeInvite.status,
  403,
  JSON.stringify(privateQueueReadBeforeInvite),
)

const inviteId = 'a'.repeat(64)
const inviteToken = 'A'.repeat(43)
const inviteExpiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString()
const clientInviteCreate = await commit(
  [
    update(
      `roomInvites/${inviteId}`,
      {
        createdBy: stringValue(owner.uid),
        expiresAt: timestampValue(inviteExpiresAt),
        maxUses: integerValue(2),
        participantCount: integerValue(1),
        revokedAt: nullValue(),
        roomId: stringValue(privateRoom.roomId),
        roomImageUrl: stringValue(
          `https://storage.yandexcloud.net/test-bucket/room-covers/${privateRoom.roomId}/cover.png`,
        ),
        roomName: stringValue(`Room model ${runId}-private`),
        tokenHash: stringValue(inviteId),
        uses: integerValue(0),
      },
      [requestTime('createdAt')],
    ),
    update(
      `roomInviteSecrets/${inviteId}`,
      {
        createdBy: stringValue(owner.uid),
        roomId: stringValue(privateRoom.roomId),
        token: stringValue(inviteToken),
        tokenHash: stringValue(inviteId),
      },
      [requestTime('createdAt')],
    ),
  ],
  owner.idToken,
)
assert.equal(clientInviteCreate.ok, false, JSON.stringify(clientInviteCreate))
const inviteCreate = await commit(
  [
    update(
      `roomInvites/${inviteId}`,
      {
        createdBy: stringValue(owner.uid),
        expiresAt: timestampValue(inviteExpiresAt),
        maxUses: integerValue(2),
        participantCount: integerValue(1),
        revokedAt: nullValue(),
        roomId: stringValue(privateRoom.roomId),
        roomImageUrl: stringValue(
          `https://storage.yandexcloud.net/test-bucket/room-covers/${privateRoom.roomId}/cover.png`,
        ),
        roomName: stringValue(`Room model ${runId}-private`),
        tokenHash: stringValue(inviteId),
        uses: integerValue(0),
      },
      [requestTime('createdAt')],
    ),
    update(
      `roomInviteSecrets/${inviteId}`,
      {
        createdBy: stringValue(owner.uid),
        roomId: stringValue(privateRoom.roomId),
        token: stringValue(inviteToken),
        tokenHash: stringValue(inviteId),
      },
      [requestTime('createdAt')],
    ),
  ],
  'owner',
)
assert.equal(inviteCreate.ok, true, JSON.stringify(inviteCreate))

const publicInvitePreview = await readDocument(`roomInvites/${inviteId}`)
assert.equal(publicInvitePreview.ok, true, JSON.stringify(publicInvitePreview))

const ownerInviteList = await queryCollectionByField(
  'roomInvites',
  'roomId',
  privateRoom.roomId,
  owner.idToken,
)
assert.equal(ownerInviteList.ok, true, JSON.stringify(ownerInviteList))

const inviteeInviteList = await queryCollectionByField(
  'roomInvites',
  'roomId',
  privateRoom.roomId,
  invitee.idToken,
)
assert.equal(inviteeInviteList.ok, false, JSON.stringify(inviteeInviteList))

const ownerSecretList = await queryCollectionByField(
  'roomInviteSecrets',
  'roomId',
  privateRoom.roomId,
  owner.idToken,
)
assert.equal(ownerSecretList.ok, true, JSON.stringify(ownerSecretList))

const ownerSecretRead = await readDocument(
  `roomInviteSecrets/${inviteId}`,
  owner.idToken,
)
assert.equal(ownerSecretRead.ok, true, JSON.stringify(ownerSecretRead))

const inviteeSecretRead = await readDocument(
  `roomInviteSecrets/${inviteId}`,
  invitee.idToken,
)
assert.equal(inviteeSecretRead.ok, false, JSON.stringify(inviteeSecretRead))

const unauthenticatedSecretRead = await readDocument(
  `roomInviteSecrets/${inviteId}`,
)
assert.equal(
  unauthenticatedSecretRead.ok,
  false,
  JSON.stringify(unauthenticatedSecretRead),
)

const clientInviteRedemption = await commit(
  [
    patch(`roomInvites/${inviteId}`, { uses: integerValue(1) }, ['uses']),
    update(
      `rooms/${privateRoom.roomId}/members/${invitee.uid}`,
      memberFields({
        invitedBy: owner.uid,
        isGuest: false,
        role: 'member',
      }),
      [requestTime('joinedAt')],
    ),
  ],
  invitee.idToken,
)
assert.equal(
  clientInviteRedemption.ok,
  false,
  JSON.stringify(clientInviteRedemption),
)

const ownerUsesUpdate = await commit(
  [patch(`roomInvites/${inviteId}`, { uses: integerValue(1) }, ['uses'])],
  owner.idToken,
)
assert.equal(ownerUsesUpdate.ok, false, JSON.stringify(ownerUsesUpdate))

const anonymousClientRedemption = await commit(
  [
    patch(`roomInvites/${inviteId}`, { uses: integerValue(1) }, ['uses']),
    update(
      `rooms/${privateRoom.roomId}/members/${anonymousUser.uid}`,
      memberFields({
        invitedBy: owner.uid,
        isGuest: true,
        role: 'member',
      }),
      [requestTime('joinedAt')],
    ),
  ],
  anonymousUser.idToken,
)
assert.equal(
  anonymousClientRedemption.ok,
  false,
  JSON.stringify(anonymousClientRedemption),
)

const privateRoomReadWithoutServerRedemption = await readDocument(
  `rooms/${privateRoom.roomId}`,
  invitee.idToken,
)
assert.equal(
  privateRoomReadWithoutServerRedemption.ok,
  false,
  JSON.stringify(privateRoomReadWithoutServerRedemption),
)

const invalidInviteCreate = await commit(
  [
    update(
      `roomInvites/${'c'.repeat(64)}`,
      {
        createdBy: stringValue(owner.uid),
        expiresAt: timestampValue(inviteExpiresAt),
        maxUses: integerValue(1),
        revokedAt: nullValue(),
        roomId: stringValue(privateRoom.roomId),
        uses: integerValue(0),
      },
      [requestTime('createdAt')],
    ),
  ],
  owner.idToken,
)
assert.equal(invalidInviteCreate.ok, false, JSON.stringify(invalidInviteCreate))

const revokedInviteId = 'b'.repeat(64)
const revokedInviteToken = 'B'.repeat(43)
const revokedInviteCreate = await commit(
  [
    update(
      `roomInvites/${revokedInviteId}`,
      {
        createdBy: stringValue(owner.uid),
        expiresAt: timestampValue(inviteExpiresAt),
        maxUses: integerValue(1),
        participantCount: integerValue(3),
        revokedAt: nullValue(),
        roomId: stringValue(privateRoom.roomId),
        roomImageUrl: stringValue(
          `https://storage.yandexcloud.net/test-bucket/room-covers/${privateRoom.roomId}/cover.png`,
        ),
        roomName: stringValue(`Room model ${runId}-private`),
        tokenHash: stringValue(revokedInviteId),
        uses: integerValue(0),
      },
      [requestTime('createdAt')],
    ),
    update(
      `roomInviteSecrets/${revokedInviteId}`,
      {
        createdBy: stringValue(owner.uid),
        roomId: stringValue(privateRoom.roomId),
        token: stringValue(revokedInviteToken),
        tokenHash: stringValue(revokedInviteId),
      },
      [requestTime('createdAt')],
    ),
  ],
  'owner',
)
assert.equal(revokedInviteCreate.ok, true, JSON.stringify(revokedInviteCreate))

const clientInviteRevocation = await commit(
  [
    patch(
      `roomInvites/${revokedInviteId}`,
      {},
      ['revokedAt'],
      [requestTime('revokedAt')],
    ),
    remove(`roomInviteSecrets/${revokedInviteId}`),
  ],
  owner.idToken,
)
assert.equal(
  clientInviteRevocation.ok,
  false,
  JSON.stringify(clientInviteRevocation),
)
const inviteRevocation = await commit(
  [
    patch(
      `roomInvites/${revokedInviteId}`,
      {},
      ['revokedAt'],
      [requestTime('revokedAt')],
    ),
    remove(`roomInviteSecrets/${revokedInviteId}`),
  ],
  'owner',
)
assert.equal(inviteRevocation.ok, true, JSON.stringify(inviteRevocation))

const revokedInviteRedemption = await commit(
  [
    patch(`roomInvites/${revokedInviteId}`, { uses: integerValue(1) }, [
      'uses',
    ]),
  ],
  otherUser.idToken,
)
assert.equal(
  revokedInviteRedemption.ok,
  false,
  JSON.stringify(revokedInviteRedemption),
)

const slowRoom = roomCreationWrites({
  ownerId: owner.uid,
  slowModeSeconds: 30,
  suffix: `${runId}-slow-mode`,
})
const slowRoomCreate = await commit(slowRoom.writes, 'owner')
assert.equal(slowRoomCreate.ok, true, JSON.stringify(slowRoomCreate))

const slowRoomMembership = await commit(
  [
    update(
      `rooms/${slowRoom.roomId}/members/${otherUser.uid}`,
      memberFields({ isGuest: false, role: 'member' }),
      [requestTime('joinedAt')],
    ),
  ],
  otherUser.idToken,
)
assert.equal(slowRoomMembership.ok, true, JSON.stringify(slowRoomMembership))

const firstSlowMessageId = `slow-first-${runId}`
const firstSlowMessage = await commit(
  [
    update(
      `rooms/${slowRoom.roomId}/messages/${firstSlowMessageId}`,
      {
        authorId: stringValue(otherUser.uid),
        authorName: stringValue('Registered member'),
        authorPhotoURL: stringValue('/avatars/beat.svg'),
        text: stringValue('First slow mode message'),
      },
      [requestTime('createdAt')],
    ),
    update(
      `rooms/${slowRoom.roomId}/messageActivity/${otherUser.uid}`,
      { messageId: stringValue(firstSlowMessageId) },
      [requestTime('lastMessageAt')],
    ),
  ],
  otherUser.idToken,
)
assert.equal(firstSlowMessage.ok, false, JSON.stringify(firstSlowMessage))

const secondSlowMessageId = `slow-second-${runId}`
const secondSlowMessage = await commit(
  [
    update(
      `rooms/${slowRoom.roomId}/messages/${secondSlowMessageId}`,
      {
        authorId: stringValue(otherUser.uid),
        authorName: stringValue('Registered member'),
        authorPhotoURL: stringValue('/avatars/beat.svg'),
        text: stringValue('Second slow mode message'),
      },
      [requestTime('createdAt')],
    ),
    update(
      `rooms/${slowRoom.roomId}/messageActivity/${otherUser.uid}`,
      {
        messageId: stringValue(secondSlowMessageId),
      },
      [requestTime('lastMessageAt')],
    ),
  ],
  otherUser.idToken,
)
assert.equal(secondSlowMessage.ok, false, JSON.stringify(secondSlowMessage))

const archivedRoom = roomCreationWrites({
  ownerId: owner.uid,
  status: 'archived',
  suffix: `${runId}-archived`,
})
const archivedRoomCreate = await commit(archivedRoom.writes, 'owner')
assert.equal(archivedRoomCreate.ok, true, JSON.stringify(archivedRoomCreate))

const registeredArchivedRoomRead = await readDocument(
  `rooms/${archivedRoom.roomId}`,
  otherUser.idToken,
)
assert.equal(
  registeredArchivedRoomRead.ok,
  false,
  JSON.stringify(registeredArchivedRoomRead),
)

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

const upgradedAnonymousUser = await upgradeAnonymousUser(
  anonymousUser,
  'upgraded-guest',
)
const guestMembershipUpgrade = await commit(
  [
    patch(
      `rooms/${validRoom.roomId}/members/${anonymousUser.uid}`,
      { isGuest: booleanValue(false) },
      ['isGuest'],
    ),
  ],
  upgradedAnonymousUser.idToken,
)
assert.equal(
  guestMembershipUpgrade.ok,
  true,
  JSON.stringify(guestMembershipUpgrade),
)

console.log(
  'Room model rules verification passed: paginated public listing, unlisted direct access, private content membership, hashed invite creation and manager listing, client redemption denial, revocation, guest onboarding and upgrade, roles, bans, mutes, blocks, and slow mode.',
)
