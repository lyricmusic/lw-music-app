/* global console */

import { createRequire } from 'node:module'
import { rmSync } from 'node:fs'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'

import { applicationDefault, cert, initializeApp } from 'firebase-admin/app'
import { FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore'

const apply = process.argv.includes('--apply')
const useFirebaseCliAuth = process.argv.includes('--firebase-cli-auth')
const projectArgumentIndex = process.argv.indexOf('--project')
const backupArgumentIndex = process.argv.indexOf('--backup')
const projectId =
  projectArgumentIndex >= 0 ? process.argv[projectArgumentIndex + 1] : undefined
const backupPath =
  backupArgumentIndex >= 0 ? process.argv[backupArgumentIndex + 1] : undefined

if (projectArgumentIndex >= 0 && !projectId) {
  throw new Error('После --project укажите Firebase project id.')
}
if (backupArgumentIndex >= 0 && !backupPath) {
  throw new Error('После --backup укажите путь к JSON-файлу.')
}
if (apply && !backupPath) {
  throw new Error('Для --apply обязательно укажите --backup <path>.')
}

async function prepareFirebaseCliAdc() {
  const require = createRequire(import.meta.url)
  const { getGlobalDefaultAccount } = require('firebase-tools/lib/auth')
  const { clientId, clientSecret } = require('firebase-tools/lib/api')
  const account = getGlobalDefaultAccount()
  if (!account?.tokens?.refresh_token) {
    throw new Error('Firebase CLI не авторизован. Выполните firebase login.')
  }

  const temporaryDirectory = await mkdtemp(join(tmpdir(), 'lwmusic-adc-'))
  const credentialPath = join(temporaryDirectory, 'application-default.json')
  await writeFile(
    credentialPath,
    JSON.stringify({
      client_id: clientId(),
      client_secret: clientSecret(),
      refresh_token: account.tokens.refresh_token,
      type: 'authorized_user',
    }),
    { encoding: 'utf8', mode: 0o600 },
  )
  process.env.GOOGLE_APPLICATION_CREDENTIALS = credentialPath
  process.on('exit', () => {
    rmSync(temporaryDirectory, { force: true, recursive: true })
  })
}

const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
if (!serviceAccountJson && useFirebaseCliAuth) await prepareFirebaseCliAdc()
const credential = serviceAccountJson
  ? cert(JSON.parse(serviceAccountJson))
  : applicationDefault()

initializeApp({ credential, projectId })
const db = getFirestore()

function normalizeRoomName(name) {
  return name.normalize('NFKC').trim().replace(/\s+/gu, ' ')
}

function getRoomNameKey(name) {
  return `v1:${encodeURIComponent(normalizeRoomName(name).toLocaleLowerCase('ru-RU'))}`
}

function validVisibility(value) {
  return ['private', 'public', 'unlisted'].includes(value)
}

function validStatus(value) {
  return ['active', 'archived'].includes(value)
}

function normalizedSettings(value) {
  const settings = value && typeof value === 'object' ? value : {}
  return {
    allowGuestChat:
      typeof settings.allowGuestChat === 'boolean'
        ? settings.allowGuestChat
        : true,
    allowGuestQueue:
      typeof settings.allowGuestQueue === 'boolean'
        ? settings.allowGuestQueue
        : true,
    slowModeSeconds:
      Number.isInteger(settings.slowModeSeconds) &&
      settings.slowModeSeconds >= 0 &&
      settings.slowModeSeconds <= 300
        ? settings.slowModeSeconds
        : 0,
  }
}

function sameSettings(left, right) {
  return (
    left?.allowGuestChat === right.allowGuestChat &&
    left?.allowGuestQueue === right.allowGuestQueue &&
    left?.slowModeSeconds === right.slowModeSeconds
  )
}

function serializeFirestoreValue(value) {
  if (value instanceof Timestamp) {
    return {
      __type: 'timestamp',
      nanoseconds: value.nanoseconds,
      seconds: value.seconds,
    }
  }
  if (Array.isArray(value)) return value.map(serializeFirestoreValue)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [
        key,
        serializeFirestoreValue(nestedValue),
      ]),
    )
  }
  return value
}

const roomsSnapshot = await db.collection('rooms').get()
const plannedWrites = []
const warnings = []

for (const roomSnapshot of roomsSnapshot.docs) {
  const room = roomSnapshot.data()
  const roomId = roomSnapshot.id
  if (typeof room.ownerId !== 'string' || !room.ownerId) {
    warnings.push(`${roomId}: отсутствует ownerId, комната пропущена`)
    continue
  }
  if (typeof room.name !== 'string' || !room.name.trim()) {
    warnings.push(`${roomId}: отсутствует name, комната пропущена`)
    continue
  }

  const desiredNameKey = getRoomNameKey(room.name)
  const roomPatch = {}
  const settings = normalizedSettings(room.settings)
  if (!sameSettings(room.settings, settings)) roomPatch.settings = settings
  if (!validStatus(room.status)) roomPatch.status = 'active'
  if (!validVisibility(room.visibility)) roomPatch.visibility = 'public'

  const roomNameRef = db.collection('roomNames').doc(desiredNameKey)
  const roomNameSnapshot = await roomNameRef.get()
  const reservationBelongsToRoom =
    !roomNameSnapshot.exists || roomNameSnapshot.data()?.roomId === roomId

  if (!reservationBelongsToRoom) {
    warnings.push(
      `${roomId}: имя конфликтует с комнатой ${roomNameSnapshot.data()?.roomId}; nameKey не изменён`,
    )
  } else {
    if (room.nameKey !== desiredNameKey) roomPatch.nameKey = desiredNameKey
    if (!roomNameSnapshot.exists) {
      plannedWrites.push({
        data: {
          createdAt:
            room.createdAt instanceof Timestamp
              ? room.createdAt
              : FieldValue.serverTimestamp(),
          name: room.name,
          ownerId: room.ownerId,
          roomId,
        },
        kind: 'set',
        ref: roomNameRef,
      })
    } else if (
      roomNameSnapshot.data()?.name !== room.name ||
      roomNameSnapshot.data()?.ownerId !== room.ownerId
    ) {
      plannedWrites.push({
        data: { name: room.name, ownerId: room.ownerId, roomId },
        kind: 'merge',
        ref: roomNameRef,
      })
    }
  }

  if (Object.keys(roomPatch).length > 0) {
    plannedWrites.push({
      data: { ...roomPatch, updatedAt: FieldValue.serverTimestamp() },
      kind: 'update',
      ref: roomSnapshot.ref,
    })
  }

  const ownerMemberRef = roomSnapshot.ref
    .collection('members')
    .doc(room.ownerId)
  const ownerMemberSnapshot = await ownerMemberRef.get()
  const ownerMember = ownerMemberSnapshot.data()
  if (
    !ownerMemberSnapshot.exists ||
    ownerMember?.invitedBy !== null ||
    ownerMember?.isGuest !== false ||
    !(ownerMember?.joinedAt instanceof Timestamp) ||
    ownerMember?.role !== 'owner' ||
    ownerMember?.status !== 'active'
  ) {
    plannedWrites.push({
      data: {
        invitedBy: null,
        isGuest: false,
        joinedAt:
          ownerMember?.joinedAt instanceof Timestamp
            ? ownerMember.joinedAt
            : room.createdAt instanceof Timestamp
              ? room.createdAt
              : FieldValue.serverTimestamp(),
        role: 'owner',
        status: 'active',
      },
      kind: 'set',
      ref: ownerMemberRef,
    })
  }
}

console.log(
  `${apply ? 'APPLY' : 'DRY RUN'}: комнат ${roomsSnapshot.size}, запланировано записей ${plannedWrites.length}`,
)
plannedWrites.forEach(write => console.log(`PLAN ${write.kind}: ${write.ref.path}`))
warnings.forEach(warning => console.warn(`WARN: ${warning}`))

if (!apply) {
  console.log('Изменения не применены. Для записи добавьте --apply.')
  process.exit(0)
}

if (warnings.length > 0) {
  throw new Error('Миграция отменена: сначала устраните все WARN из dry-run.')
}

const uniqueRefs = Array.from(
  new Map(plannedWrites.map(write => [write.ref.path, write.ref])).values(),
)
const backupDocuments = []
for (let offset = 0; offset < uniqueRefs.length; offset += 100) {
  const snapshots = await db.getAll(...uniqueRefs.slice(offset, offset + 100))
  backupDocuments.push(
    ...snapshots.map(snapshot => ({
      data: snapshot.exists ? serializeFirestoreValue(snapshot.data()) : null,
      exists: snapshot.exists,
      path: snapshot.ref.path,
    })),
  )
}

const resolvedBackupPath = resolve(backupPath)
await mkdir(dirname(resolvedBackupPath), { recursive: true })
await writeFile(
  resolvedBackupPath,
  `${JSON.stringify(
    {
      createdAt: new Date().toISOString(),
      documents: backupDocuments,
      projectId,
    },
    null,
    2,
  )}\n`,
  'utf8',
)
console.log(`Backup сохранён: ${resolvedBackupPath}`)

for (let offset = 0; offset < plannedWrites.length; offset += 400) {
  const batch = db.batch()
  for (const write of plannedWrites.slice(offset, offset + 400)) {
    if (write.kind === 'update') batch.update(write.ref, write.data)
    else if (write.kind === 'merge')
      batch.set(write.ref, write.data, { merge: true })
    else batch.set(write.ref, write.data)
  }
  await batch.commit()
}

console.log(`Миграция завершена: применено записей ${plannedWrites.length}.`)
