/* global console, exports, process, require */

const { cert, getApps, initializeApp } = require('firebase-admin/app')
const { Timestamp, getFirestore } = require('firebase-admin/firestore')

const DELETE_BATCH_SIZE = 400
const MAX_BATCHES_PER_INVOCATION = 10
const TIMER_EVENT_TYPE = 'yandex.cloud.events.serverless.triggers.TimerMessage'

function requiredEnvironment(name) {
  const value = process.env[name]
  if (!value) throw new Error(`Missing environment variable: ${name}`)
  return value
}

function getFirebaseApp() {
  if (getApps().length > 0) return getApps()[0]

  if (process.env.FIRESTORE_EMULATOR_HOST) {
    return initializeApp({
      projectId: process.env.FIREBASE_PROJECT_ID || 'demo-lwmusic',
    })
  }

  const serviceAccount = JSON.parse(
    requiredEnvironment('FIREBASE_SERVICE_ACCOUNT_JSON'),
  )
  return initializeApp({ credential: cert(serviceAccount) })
}

const db = getFirestore(getFirebaseApp())

function isTimerEvent(event) {
  return (
    Array.isArray(event?.messages) &&
    event.messages.some(
      message => message?.event_metadata?.event_type === TIMER_EVENT_TYPE,
    )
  )
}

async function cleanupExpiredMessages(cutoff = Timestamp.now()) {
  let deletedCount = 0
  let finished = false

  for (
    let batchNumber = 0;
    batchNumber < MAX_BATCHES_PER_INVOCATION;
    batchNumber += 1
  ) {
    const expiredSnapshot = await db
      .collectionGroup('messages')
      .where('expiresAt', '<=', cutoff)
      .orderBy('expiresAt', 'asc')
      .limit(DELETE_BATCH_SIZE)
      .get()

    if (expiredSnapshot.empty) {
      finished = true
      break
    }

    const batch = db.batch()
    expiredSnapshot.docs.forEach(messageSnapshot => {
      batch.delete(messageSnapshot.ref)
    })
    await batch.commit()
    deletedCount += expiredSnapshot.size

    if (expiredSnapshot.size < DELETE_BATCH_SIZE) {
      finished = true
      break
    }
  }

  return { cutoff: cutoff.toDate().toISOString(), deletedCount, finished }
}

exports.cleanupExpiredMessages = cleanupExpiredMessages

exports.handler = async function handler(event) {
  if (!isTimerEvent(event)) {
    throw new Error('Message cleanup accepts Yandex Cloud Timer events only.')
  }

  const result = await cleanupExpiredMessages()
  console.log('Expired room messages cleanup completed:', result)
  return result
}
