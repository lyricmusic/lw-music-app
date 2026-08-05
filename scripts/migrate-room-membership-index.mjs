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
import { Timestamp, getFirestore } from 'firebase-admin/firestore'

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

const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
if (!serviceAccountJson && useFirebaseCliAuth) await prepareFirebaseCliAdc()
const credential = serviceAccountJson
  ? cert(JSON.parse(serviceAccountJson))
  : applicationDefault()
const app = initializeApp({ credential, projectId })
const db = getFirestore(app)

console.log('Читаем membership-документы комнат...')
const membershipsSnapshot = await db.collectionGroup('members').get()
const plannedWrites = []
const warnings = []

for (const membershipSnapshot of membershipsSnapshot.docs) {
  const expectedUserId = membershipSnapshot.id
  const storedUserId = membershipSnapshot.data().userId
  if (storedUserId === expectedUserId) continue
  if (storedUserId !== undefined) {
    warnings.push(
      `${membershipSnapshot.ref.path}: userId=${JSON.stringify(storedUserId)}, ожидался ${expectedUserId}`,
    )
    continue
  }
  plannedWrites.push({
    data: membershipSnapshot.data(),
    ref: membershipSnapshot.ref,
    userId: expectedUserId,
  })
}

console.log(
  `${apply ? 'APPLY' : 'DRY RUN'}: документов ${membershipsSnapshot.size}, запланировано обновлений ${plannedWrites.length}.`,
)
plannedWrites.forEach(write => console.log(`PLAN update: ${write.ref.path}`))
warnings.forEach(warning => console.warn(`WARN: ${warning}`))

if (!apply) {
  console.log(
    'Изменения не применены. Для записи добавьте --apply --backup <path>.',
  )
  await deleteApp(app)
  process.exit(0)
}
if (warnings.length > 0) {
  throw new Error('Миграция отменена: сначала устраните все WARN из dry-run.')
}

const resolvedBackupPath = resolve(backupPath)
await mkdir(dirname(resolvedBackupPath), { recursive: true })
await writeFile(
  resolvedBackupPath,
  `${JSON.stringify(
    {
      createdAt: new Date().toISOString(),
      documents: plannedWrites.map(write => ({
        data: serializeFirestoreValue(write.data),
        exists: true,
        path: write.ref.path,
      })),
      projectId,
    },
    null,
    2,
  )}\n`,
  'utf8',
)

for (let offset = 0; offset < plannedWrites.length; offset += 400) {
  const batch = db.batch()
  for (const write of plannedWrites.slice(offset, offset + 400)) {
    batch.update(write.ref, { userId: write.userId })
  }
  await batch.commit()
}

console.log(
  `Миграция завершена: обновлено ${plannedWrites.length}. Backup: ${resolvedBackupPath}`,
)
await deleteApp(app)
