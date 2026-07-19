/* global Buffer, console, exports, process, require */

const crypto = require('node:crypto')
const { cert, getApps, initializeApp } = require('firebase-admin/app')
const { getAuth } = require('firebase-admin/auth')
const { FieldValue, getFirestore } = require('firebase-admin/firestore')

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43,128}$/

class InviteError extends Error {
  constructor(code, statusCode) {
    super(code)
    this.code = code
    this.statusCode = statusCode
  }
}

function requiredEnvironment(name) {
  const value = process.env[name]
  if (!value) throw new Error(`Missing environment variable: ${name}`)
  return value
}

function getAllowedOrigins() {
  return new Set(
    requiredEnvironment('ALLOWED_ORIGINS')
      .split(';')
      .map(value => value.trim())
      .filter(Boolean),
  )
}

function getHeader(event, name) {
  const normalizedName = name.toLowerCase()
  return Object.entries(event.headers ?? {}).find(
    ([key]) => key.toLowerCase() === normalizedName,
  )?.[1]
}

function getCorsHeaders(event) {
  const origin = getHeader(event, 'origin')
  if (!origin || !getAllowedOrigins().has(origin)) {
    throw new InviteError('origin-not-allowed', 403)
  }

  return {
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Origin': origin,
    'Cache-Control': 'no-store, max-age=0',
    'Content-Type': 'application/json; charset=utf-8',
    Vary: 'Origin',
  }
}

function jsonResponse(statusCode, value, headers = {}) {
  return {
    body: JSON.stringify(value),
    headers,
    isBase64Encoded: false,
    statusCode,
  }
}

function parseJsonBody(event) {
  if (!event.body) throw new InviteError('invalid-request', 400)
  const body = event.isBase64Encoded
    ? Buffer.from(event.body, 'base64').toString('utf8')
    : event.body

  try {
    return JSON.parse(body)
  } catch {
    throw new InviteError('invalid-request', 400)
  }
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

function hashToken(token) {
  return crypto.createHash('sha256').update(token, 'utf8').digest('hex')
}

function isActiveBan(ban, nowMillis) {
  if (!ban) return false
  if (ban.expiresAt == null) return true
  return (
    typeof ban.expiresAt.toMillis === 'function' &&
    ban.expiresAt.toMillis() > nowMillis
  )
}

async function authenticate(event) {
  const authorization = getHeader(event, 'authorization')
  const match = /^Bearer\s+(.+)$/i.exec(authorization ?? '')
  if (!match) throw new InviteError('unauthenticated', 401)

  try {
    return await getAuth(getFirebaseApp()).verifyIdToken(match[1], true)
  } catch {
    throw new InviteError('unauthenticated', 401)
  }
}

async function redeemRoomInvite(event) {
  const decodedToken = await authenticate(event)
  const body = parseJsonBody(event)
  const token = typeof body.token === 'string' ? body.token.trim() : ''
  const expectedRoomId =
    typeof body.expectedRoomId === 'string' ? body.expectedRoomId.trim() : ''

  if (
    !TOKEN_PATTERN.test(token) ||
    expectedRoomId.length > 128 ||
    (body.expectedRoomId !== undefined && !expectedRoomId)
  ) {
    throw new InviteError('invalid-request', 400)
  }

  const tokenHash = hashToken(token)
  const firestore = getFirestore(getFirebaseApp())
  const inviteRef = firestore.collection('roomInvites').doc(tokenHash)
  const nowMillis = Date.now()
  const isAnonymous = decodedToken.firebase?.sign_in_provider === 'anonymous'

  return firestore.runTransaction(async transaction => {
    const inviteSnapshot = await transaction.get(inviteRef)
    if (!inviteSnapshot.exists) {
      throw new InviteError('invite-not-found', 404)
    }

    const invite = inviteSnapshot.data()
    if (
      invite.tokenHash !== tokenHash ||
      typeof invite.roomId !== 'string' ||
      !invite.roomId ||
      typeof invite.createdBy !== 'string' ||
      !invite.createdBy
    ) {
      throw new InviteError('invite-not-found', 404)
    }
    if (expectedRoomId && invite.roomId !== expectedRoomId) {
      throw new InviteError('wrong-room', 400)
    }

    const roomRef = firestore.collection('rooms').doc(invite.roomId)
    const memberRef = roomRef.collection('members').doc(decodedToken.uid)
    const banRef = roomRef.collection('bans').doc(decodedToken.uid)
    const [roomSnapshot, memberSnapshot, banSnapshot] = await Promise.all([
      transaction.get(roomRef),
      transaction.get(memberRef),
      transaction.get(banRef),
    ])

    if (!roomSnapshot.exists) {
      throw new InviteError('room-not-found', 404)
    }
    const room = roomSnapshot.data()
    if (room.status === 'archived' || room.visibility !== 'private') {
      throw new InviteError('invite-unavailable', 409)
    }
    if (
      isActiveBan(banSnapshot.exists ? banSnapshot.data() : null, nowMillis)
    ) {
      throw new InviteError('banned', 403)
    }

    if (memberSnapshot.exists && memberSnapshot.data().status === 'active') {
      if (memberSnapshot.data().isGuest === true && !isAnonymous) {
        transaction.update(memberRef, { isGuest: false })
      }
      return invite.roomId
    }

    if (
      invite.revokedAt != null ||
      typeof invite.expiresAt?.toMillis !== 'function' ||
      invite.expiresAt.toMillis() <= nowMillis ||
      !Number.isInteger(invite.maxUses) ||
      !Number.isInteger(invite.uses) ||
      invite.maxUses < 1 ||
      invite.uses < 0 ||
      invite.uses >= invite.maxUses
    ) {
      throw new InviteError('invite-unavailable', 409)
    }

    transaction.update(inviteRef, { uses: invite.uses + 1 })
    transaction.set(memberRef, {
      invitedBy: invite.createdBy,
      isGuest: isAnonymous,
      joinedAt: FieldValue.serverTimestamp(),
      role: 'member',
      status: 'active',
    })

    return invite.roomId
  })
}

exports.handler = async function handler(event) {
  let corsHeaders
  try {
    corsHeaders = getCorsHeaders(event)
    if (event.httpMethod === 'OPTIONS') {
      return { body: '', headers: corsHeaders, statusCode: 204 }
    }
    if (event.httpMethod !== 'POST') {
      throw new InviteError('method-not-allowed', 405)
    }

    const roomId = await redeemRoomInvite(event)
    return jsonResponse(200, { roomId }, corsHeaders)
  } catch (error) {
    const knownError = error instanceof InviteError
    if (!knownError) console.error('Room invite redemption failed:', error)

    const headers = corsHeaders ?? {
      'Cache-Control': 'no-store, max-age=0',
      'Content-Type': 'application/json; charset=utf-8',
    }
    return jsonResponse(
      knownError ? error.statusCode : 500,
      { error: knownError ? error.code : 'server-error' },
      headers,
    )
  }
}
