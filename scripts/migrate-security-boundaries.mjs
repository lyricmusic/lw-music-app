/* global console */

import { createRequire } from 'node:module'
import { rmSync } from 'node:fs'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'

import {
  applicationDefault,
  cert,
  deleteApp,
  initializeApp,
} from 'firebase-admin/app'
import { getDatabase } from 'firebase-admin/database'
import { Timestamp, getFirestore } from 'firebase-admin/firestore'

const apply = process.argv.includes('--apply')
const useFirebaseCliAuth = process.argv.includes('--firebase-cli-auth')
const projectArgumentIndex = process.argv.indexOf('--project')
const backupArgumentIndex = process.argv.indexOf('--backup')
const databaseUrlArgumentIndex = process.argv.indexOf('--database-url')
const projectId =
  projectArgumentIndex >= 0 ? process.argv[projectArgumentIndex + 1] : undefined
const backupPath =
  backupArgumentIndex >= 0 ? process.argv[backupArgumentIndex + 1] : undefined
const databaseURL =
  databaseUrlArgumentIndex >= 0
    ? process.argv[databaseUrlArgumentIndex + 1]
    : process.env.FIREBASE_DATABASE_URL

if (projectArgumentIndex >= 0 && !projectId) {
  throw new Error('Pass a Firebase project id after --project.')
}
if (backupArgumentIndex >= 0 && !backupPath) {
  throw new Error('Pass a JSON path after --backup.')
}
if (databaseUrlArgumentIndex >= 0 && !databaseURL) {
  throw new Error('Pass a Realtime Database URL after --database-url.')
}
if (!databaseURL) {
  throw new Error('Set FIREBASE_DATABASE_URL or pass --database-url.')
}
if (apply && !backupPath) {
  throw new Error('--apply requires --backup <path>.')
}

async function prepareFirebaseCliAdc() {
  const require = createRequire(import.meta.url)
  const { getGlobalDefaultAccount } = require('firebase-tools/lib/auth')
  const { clientId, clientSecret } = require('firebase-tools/lib/api')
  const account = getGlobalDefaultAccount()
  if (!account?.tokens?.refresh_token) {
    throw new Error('Firebase CLI is not authenticated. Run firebase login.')
  }

  const temporaryDirectory = await mkdtemp(join(tmpdir(), 'syncly-adc-'))
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
const app = initializeApp({ credential, databaseURL, projectId })
const db = getFirestore(app)
const realtimeDb = getDatabase(app)
const warnings = []

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

function publicProfile(userId, profile) {
  if (
    !profile?.avatar ||
    !(profile.createdAt instanceof Timestamp) ||
    typeof profile.displayName !== 'string' ||
    !profile.displayName.trim() ||
    profile.displayName.length > 50 ||
    (profile.photoURL !== null && typeof profile.photoURL !== 'string') ||
    !(profile.updatedAt instanceof Timestamp)
  ) {
    warnings.push(`${userId}: private profile is incomplete; skipped`)
    return null
  }
  const character = profile.character ?? {
    accentColor: 'violet',
    appearanceId: 'base',
    danceId: 'side-step',
    genderId: 'male',
  }
  return {
    avatar: profile.avatar,
    character,
    createdAt: profile.createdAt,
    displayName: profile.displayName,
    photoURL: profile.photoURL,
    updatedAt: profile.updatedAt,
  }
}

function activeBanExpiration(ban, nowMillis) {
  if (!ban) return null
  if (ban.expiresAt == null) return 0
  if (!(ban.expiresAt instanceof Timestamp)) return null
  return ban.expiresAt.toMillis() > nowMillis ? ban.expiresAt.toMillis() : null
}

console.log('Reading private user profiles from Firestore...')
const usersSnapshot = await db.collection('users').get()
console.log(`Read ${usersSnapshot.size} private user profiles.`)
console.log('Reading rooms from Firestore...')
const roomsSnapshot = await db.collection('rooms').get()
console.log(`Read ${roomsSnapshot.size} rooms.`)
console.log('Reading the existing RTDB roomAccess index...')
const existingRoomAccessSnapshot = await realtimeDb.ref('roomAccess').get()
console.log('Read the existing RTDB roomAccess index.')
const profileWrites = []
for (const userSnapshot of usersSnapshot.docs) {
  const profile = publicProfile(userSnapshot.id, userSnapshot.data())
  if (profile) {
    profileWrites.push({
      data: profile,
      ref: db.collection('userProfiles').doc(userSnapshot.id),
    })
  }
}

const roomAccess = {}
const nowMillis = Date.now()
const bootstrapLeaseExpiresAt = nowMillis + 30 * 60_000
for (const roomSnapshot of roomsSnapshot.docs) {
  const room = roomSnapshot.data()
  if (
    !['active', 'archived'].includes(room.status) ||
    !['private', 'public', 'unlisted'].includes(room.visibility)
  ) {
    warnings.push(
      `${roomSnapshot.id}: room access metadata is invalid; skipped`,
    )
    continue
  }

  const [membersSnapshot, bansSnapshot] = await Promise.all([
    roomSnapshot.ref.collection('members').get(),
    roomSnapshot.ref.collection('bans').get(),
  ])
  console.log(
    `Read ${roomSnapshot.id}: ${membersSnapshot.size} members, ${bansSnapshot.size} bans.`,
  )
  const bans = {}
  for (const banSnapshot of bansSnapshot.docs) {
    const expiration = activeBanExpiration(banSnapshot.data(), nowMillis)
    if (expiration !== null) bans[banSnapshot.id] = expiration
  }
  const members = {}
  for (const memberSnapshot of membersSnapshot.docs) {
    if (
      memberSnapshot.data()?.status === 'active' &&
      bans[memberSnapshot.id] === undefined
    ) {
      members[memberSnapshot.id] = bootstrapLeaseExpiresAt
    }
  }
  roomAccess[roomSnapshot.id] = {
    bans,
    members,
    status: room.status,
    visibility: room.visibility,
  }
}

console.log(
  `${apply ? 'APPLY' : 'DRY RUN'}: ${profileWrites.length} public profiles and ${Object.keys(roomAccess).length} room ACL entries planned.`,
)
warnings.forEach(warning => console.warn(`WARN: ${warning}`))
if (!apply) {
  console.log('No changes applied. Add --apply with --backup to write data.')
  process.exit(0)
}
if (warnings.length > 0) {
  throw new Error('Migration aborted: resolve every WARN before applying.')
}

const existingProfiles = []
for (let offset = 0; offset < profileWrites.length; offset += 100) {
  const snapshots = await db.getAll(
    ...profileWrites.slice(offset, offset + 100).map(write => write.ref),
  )
  existingProfiles.push(
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
      firestore: existingProfiles,
      projectId,
      realtimeDatabase: {
        path: 'roomAccess',
        value: existingRoomAccessSnapshot.val(),
      },
    },
    null,
    2,
  )}\n`,
  'utf8',
)

for (let offset = 0; offset < profileWrites.length; offset += 400) {
  const batch = db.batch()
  for (const write of profileWrites.slice(offset, offset + 400)) {
    batch.set(write.ref, write.data)
  }
  await batch.commit()
}
await realtimeDb.ref('roomAccess').set(roomAccess)
console.log(`Migration complete. Backup: ${resolvedBackupPath}`)
await deleteApp(app)
