/* global console */

import { createRequire } from 'node:module'
import { rmSync } from 'node:fs'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'

import { applicationDefault, cert, initializeApp } from 'firebase-admin/app'
import { Timestamp, getFirestore } from 'firebase-admin/firestore'

// Backfill the server-managed expiration used by scheduled message cleanup.
const MESSAGE_RETENTION_MILLISECONDS = 24 * 60 * 60_000
const apply = process.argv.includes('--apply')
const useFirebaseCliAuth = process.argv.includes('--firebase-cli-auth')
const projectArgumentIndex = process.argv.indexOf('--project')
const projectId =
  projectArgumentIndex >= 0 ? process.argv[projectArgumentIndex + 1] : undefined

if (projectArgumentIndex >= 0 && !projectId) {
  throw new Error('После --project укажите Firebase project id.')
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
const messagesSnapshot = await db.collectionGroup('messages').get()
const plannedWrites = messagesSnapshot.docs.flatMap(messageSnapshot => {
  const message = messageSnapshot.data()
  if (!(message.createdAt instanceof Timestamp)) {
    console.warn(`WARN: ${messageSnapshot.ref.path}: отсутствует createdAt`)
    return []
  }

  const desiredExpiresAt = Timestamp.fromMillis(
    message.createdAt.toMillis() + MESSAGE_RETENTION_MILLISECONDS,
  )
  if (
    message.expiresAt instanceof Timestamp &&
    message.expiresAt.isEqual(desiredExpiresAt)
  ) {
    return []
  }

  return [{ expiresAt: desiredExpiresAt, ref: messageSnapshot.ref }]
})

console.log(
  `${apply ? 'APPLY' : 'DRY RUN'}: сообщений ${messagesSnapshot.size}, запланировано обновлений ${plannedWrites.length}`,
)
plannedWrites.forEach(write =>
  console.log(
    `PLAN update: ${write.ref.path} expiresAt=${write.expiresAt.toDate().toISOString()}`,
  ),
)

if (!apply) {
  console.log('Изменения не применены. Для записи добавьте --apply.')
  process.exit(0)
}

for (let offset = 0; offset < plannedWrites.length; offset += 400) {
  const batch = db.batch()
  for (const write of plannedWrites.slice(offset, offset + 400)) {
    batch.update(write.ref, { expiresAt: write.expiresAt })
  }
  await batch.commit()
}

console.log(`Миграция завершена: обновлено сообщений ${plannedWrites.length}.`)
