/* global console, process */

import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { deleteApp, getApps, initializeApp } from 'firebase-admin/app'
import { Timestamp, getFirestore } from 'firebase-admin/firestore'

const projectId = process.env.GCLOUD_PROJECT || 'demo-lwmusic'
process.env.FIREBASE_PROJECT_ID = projectId

getApps()[0] ?? initializeApp({ projectId })
const db = getFirestore()
const require = createRequire(import.meta.url)
const {
  cleanupExpiredMessages,
} = require('../serverless/message-cleanup/index.js')

const now = Timestamp.fromMillis(Date.now())
const expiredAt = Timestamp.fromMillis(now.toMillis() - 1)
const activeUntil = Timestamp.fromMillis(now.toMillis() + 60_000)
const roomId = `message-cleanup-${Date.now()}`
const messages = db.collection(`rooms/${roomId}/messages`)

await Promise.all([
  messages.doc('expired').set({ expiresAt: expiredAt, text: 'expired' }),
  messages.doc('active').set({ expiresAt: activeUntil, text: 'active' }),
  messages.doc('legacy').set({ text: 'legacy without expiresAt' }),
])

const result = await cleanupExpiredMessages(now)
assert.equal(result.deletedCount, 1)
assert.equal(result.finished, true)
assert.equal((await messages.doc('expired').get()).exists, false)
assert.equal((await messages.doc('active').get()).exists, true)
assert.equal((await messages.doc('legacy').get()).exists, true)

console.log(
  'Message cleanup verification passed: expired deleted, active and legacy retained.',
)

await Promise.all(getApps().map(deleteApp))
