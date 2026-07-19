/* global Buffer, console, exports, process, require */

const { cert, getApps, initializeApp } = require('firebase-admin/app')
const { getAuth } = require('firebase-admin/auth')
const {
  FieldValue,
  Timestamp,
  getFirestore,
} = require('firebase-admin/firestore')
const HTTP_STATUS_BY_CODE = {
  aborted: 409,
  'already-exists': 409,
  'failed-precondition': 409,
  internal: 500,
  'invalid-argument': 400,
  'not-found': 404,
  'permission-denied': 403,
  unauthenticated: 401,
}

class HttpsError extends Error {
  constructor(code, message) {
    super(message)
    this.code = code
    this.statusCode = HTTP_STATUS_BY_CODE[code] ?? 400
  }
}

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
const SERVER_TIMESTAMP = FieldValue.serverTimestamp()
const ASSIGNABLE_ROLES = new Set(['host', 'member', 'moderator'])
const MODERATION_ROLES = new Set(['host', 'moderator', 'owner'])
const ROLE_RANK = { host: 2, member: 0, moderator: 1, owner: 3 }
const RESTRICTION_ACTIONS = new Set(['ban', 'kick', 'mute'])
const CLEAR_RESTRICTION_ACTIONS = new Set(['unban', 'unmute'])
const MAX_REASON_LENGTH = 500

function requireAuth(request) {
  const userId = request.auth?.uid
  if (!userId) {
    throw new HttpsError(
      'unauthenticated',
      'Чтобы выполнить это действие, авторизуйтесь.',
    )
  }
  return userId
}

function requiredId(data, field, label) {
  const value = data?.[field]
  if (typeof value !== 'string' || !value.trim() || value.length > 128) {
    throw new HttpsError('invalid-argument', `${label} не найден.`)
  }
  return value.trim()
}

function normalizedReason(data, { optional = false } = {}) {
  const value = typeof data?.reason === 'string' ? data.reason.trim() : ''
  if (!value && optional) return ''
  if (!value) throw new HttpsError('invalid-argument', 'Укажите причину.')
  if (value.length > MAX_REASON_LENGTH) {
    throw new HttpsError(
      'invalid-argument',
      `Причина не может быть длиннее ${MAX_REASON_LENGTH} символов.`,
    )
  }
  return value
}

function restrictionExpiration(data) {
  if (data?.expiresAtMillis == null) return null
  if (
    typeof data.expiresAtMillis !== 'number' ||
    !Number.isSafeInteger(data.expiresAtMillis) ||
    data.expiresAtMillis <= Date.now()
  ) {
    throw new HttpsError(
      'invalid-argument',
      'Срок действия ограничения должен быть в будущем.',
    )
  }
  return Timestamp.fromMillis(data.expiresAtMillis)
}

function memberRef(roomId, userId) {
  return db.doc(`rooms/${roomId}/members/${userId}`)
}

async function activeMember(transaction, roomId, userId) {
  const snapshot = await transaction.get(memberRef(roomId, userId))
  const member = snapshot.data()
  if (!snapshot.exists || member?.status !== 'active') {
    throw new HttpsError(
      'permission-denied',
      'У вас больше нет доступа к управлению этой комнатой.',
    )
  }
  return { member, ref: snapshot.ref }
}

function requireRole(member, roles, message) {
  if (!roles.has(member.role)) {
    throw new HttpsError('permission-denied', message)
  }
}

function requireTargetBelowActor(actor, target) {
  const actorRank = ROLE_RANK[actor.role] ?? -1
  const targetRank = ROLE_RANK[target.role] ?? Number.MAX_SAFE_INTEGER
  if (actorRank <= targetRank) {
    throw new HttpsError(
      'permission-denied',
      'Недостаточно прав для действия с этим участником.',
    )
  }
}

function writeAudit(transaction, roomId, entry) {
  const auditRef = db.collection(`rooms/${roomId}/auditLogs`).doc()
  transaction.set(auditRef, {
    ...entry,
    createdAt: SERVER_TIMESTAMP,
  })
}

function parseQueueState(snapshot) {
  const data = snapshot.data()
  if (!snapshot.exists) return null
  if (
    !Array.isArray(data?.itemIds) ||
    data.itemIds.some(itemId => typeof itemId !== 'string') ||
    typeof data.lastPosition !== 'number'
  ) {
    throw new HttpsError(
      'failed-precondition',
      'Состояние очереди повреждено. Обратитесь к владельцу комнаты.',
    )
  }
  return data
}

async function readQueueRemoval(transaction, roomId, userId) {
  const queueMemberRef = db.doc(`rooms/${roomId}/queueMembers/${userId}`)
  const queueMemberSnapshot = await transaction.get(queueMemberRef)
  if (!queueMemberSnapshot.exists) return null

  const queueStateRef = db.doc(`rooms/${roomId}/queueState/current`)
  const playbackRef = db.doc(`rooms/${roomId}/playback/current`)
  const [queueStateSnapshot, playbackSnapshot] = await Promise.all([
    transaction.get(queueStateRef),
    transaction.get(playbackRef),
  ])
  const queueState = parseQueueState(queueStateSnapshot)
  if (!queueState) {
    throw new HttpsError('failed-precondition', 'Состояние очереди не найдено.')
  }

  const itemId = queueMemberSnapshot.data()?.itemId
  if (typeof itemId !== 'string' || !queueState.itemIds.includes(itemId)) {
    throw new HttpsError(
      'failed-precondition',
      'Запись участника не совпадает с состоянием очереди.',
    )
  }

  const queueItemRef = db.doc(`rooms/${roomId}/queue/${itemId}`)
  const wasActive = queueState.itemIds[0] === itemId
  const nextItemId = wasActive ? (queueState.itemIds[1] ?? null) : null
  const nextItemRef = nextItemId
    ? db.doc(`rooms/${roomId}/queue/${nextItemId}`)
    : null
  const [queueItemSnapshot, nextItemSnapshot] = await Promise.all([
    transaction.get(queueItemRef),
    nextItemRef ? transaction.get(nextItemRef) : Promise.resolve(null),
  ])

  if (
    !queueItemSnapshot.exists ||
    queueItemSnapshot.data()?.userId !== userId
  ) {
    throw new HttpsError('failed-precondition', 'Элемент очереди не найден.')
  }
  if (nextItemRef && !nextItemSnapshot?.exists) {
    throw new HttpsError(
      'failed-precondition',
      'Следующий элемент очереди не найден.',
    )
  }

  return {
    itemId,
    nextItem: nextItemSnapshot?.data() ?? null,
    playbackRef,
    playbackSnapshot,
    queueItemRef,
    queueMemberRef,
    queueState,
    queueStateRef,
    wasActive,
  }
}

function applyQueueRemoval(transaction, removal, changedBy) {
  if (!removal) return false

  const nextPosition = removal.nextItem?.position
  if (
    removal.nextItem &&
    (typeof nextPosition !== 'number' ||
      !Number.isInteger(nextPosition) ||
      typeof removal.nextItem.videoId !== 'string')
  ) {
    throw new HttpsError(
      'failed-precondition',
      'Следующий элемент очереди содержит некорректные данные.',
    )
  }

  transaction.delete(removal.queueItemRef)
  transaction.delete(removal.queueMemberRef)
  transaction.set(removal.queueStateRef, {
    activePosition: removal.wasActive
      ? removal.nextItem
        ? nextPosition
        : null
      : removal.queueState.activePosition,
    itemIds: removal.queueState.itemIds.filter(
      itemId => itemId !== removal.itemId,
    ),
    lastPosition: removal.queueState.lastPosition,
    updatedAt: SERVER_TIMESTAMP,
  })

  if (removal.wasActive) {
    if (removal.nextItem) {
      const currentRevision = removal.playbackSnapshot.exists
        ? Number(removal.playbackSnapshot.data()?.revision) || 0
        : 0
      transaction.set(removal.playbackRef, {
        changedAt: SERVER_TIMESTAMP,
        changedBy,
        positionSeconds: 0,
        revision: currentRevision + 1,
        status: 'playing',
        videoId: removal.nextItem.videoId,
      })
    } else if (removal.playbackSnapshot.exists) {
      transaction.delete(removal.playbackRef)
    }
  }

  return true
}

function callable(handler) {
  return async request => {
    try {
      return await handler(request)
    } catch (error) {
      if (error instanceof HttpsError) throw error
      console.error('Room management operation failed:', error)
      throw new HttpsError(
        'internal',
        'Сервер не смог выполнить действие. Повторите попытку.',
      )
    }
  }
}

exports.setRoomMemberRole = callable(async request => {
  const actorId = requireAuth(request)
  const roomId = requiredId(request.data, 'roomId', 'Комната')
  const targetId = requiredId(request.data, 'memberId', 'Участник')
  const role = request.data?.role
  if (!ASSIGNABLE_ROLES.has(role)) {
    throw new HttpsError('invalid-argument', 'Эту роль нельзя назначить.')
  }

  await db.runTransaction(async transaction => {
    const [{ member: actor }, targetSnapshot] = await Promise.all([
      activeMember(transaction, roomId, actorId),
      transaction.get(memberRef(roomId, targetId)),
    ])
    requireRole(
      actor,
      new Set(['owner']),
      'Только владелец может назначать роли.',
    )
    const target = targetSnapshot.data()
    if (!targetSnapshot.exists || target?.status !== 'active') {
      throw new HttpsError('not-found', 'Активный участник не найден.')
    }
    if (target.role === 'owner') {
      throw new HttpsError(
        'failed-precondition',
        'Роль владельца изменяется только через передачу комнаты.',
      )
    }
    if (target.isGuest === true && role !== 'member') {
      throw new HttpsError(
        'failed-precondition',
        'Гостя нельзя назначить ведущим или модератором.',
      )
    }

    transaction.update(targetSnapshot.ref, { role })
    writeAudit(transaction, roomId, {
      action: 'role_changed',
      actorId,
      fromRole: target.role,
      targetId,
      toRole: role,
    })
  })

  return { ok: true }
})

exports.transferRoomOwnership = callable(async request => {
  const actorId = requireAuth(request)
  const roomId = requiredId(request.data, 'roomId', 'Комната')
  const targetId = requiredId(request.data, 'memberId', 'Участник')
  if (actorId === targetId) {
    throw new HttpsError('invalid-argument', 'Вы уже владелец этой комнаты.')
  }

  await db.runTransaction(async transaction => {
    const roomRef = db.doc(`rooms/${roomId}`)
    const [roomSnapshot, actorSnapshot, targetSnapshot] = await Promise.all([
      transaction.get(roomRef),
      transaction.get(memberRef(roomId, actorId)),
      transaction.get(memberRef(roomId, targetId)),
    ])
    const room = roomSnapshot.data()
    const actor = actorSnapshot.data()
    const target = targetSnapshot.data()
    if (!roomSnapshot.exists || room?.ownerId !== actorId) {
      throw new HttpsError(
        'permission-denied',
        'Только текущий владелец может передать комнату.',
      )
    }
    if (actor?.status !== 'active' || actor.role !== 'owner') {
      throw new HttpsError(
        'failed-precondition',
        'Профиль владельца повреждён.',
      )
    }
    if (!targetSnapshot.exists || target?.status !== 'active') {
      throw new HttpsError('not-found', 'Активный участник не найден.')
    }
    if (target.isGuest === true) {
      throw new HttpsError(
        'failed-precondition',
        'Нельзя передать комнату гостевому аккаунту.',
      )
    }

    transaction.update(roomRef, {
      ownerId: targetId,
      updatedAt: SERVER_TIMESTAMP,
    })
    transaction.update(actorSnapshot.ref, { role: 'host' })
    transaction.update(targetSnapshot.ref, { role: 'owner' })
    if (typeof room.nameKey === 'string' && room.nameKey) {
      transaction.update(db.doc(`roomNames/${room.nameKey}`), {
        ownerId: targetId,
      })
    }
    writeAudit(transaction, roomId, {
      action: 'ownership_transferred',
      actorId,
      previousOwnerId: actorId,
      targetId,
    })
  })

  return { ok: true }
})

exports.moderateRoomMember = callable(async request => {
  const actorId = requireAuth(request)
  const roomId = requiredId(request.data, 'roomId', 'Комната')
  const targetId = requiredId(request.data, 'memberId', 'Участник')
  const action = request.data?.action
  if (!RESTRICTION_ACTIONS.has(action)) {
    throw new HttpsError('invalid-argument', 'Неизвестное действие модерации.')
  }
  if (actorId === targetId) {
    throw new HttpsError(
      'invalid-argument',
      'Нельзя применить действие к себе.',
    )
  }
  const reason = normalizedReason(request.data, { optional: action === 'kick' })
  const expiresAt =
    action === 'kick' ? null : restrictionExpiration(request.data)

  await db.runTransaction(async transaction => {
    const [{ member: actor }, targetSnapshot] = await Promise.all([
      activeMember(transaction, roomId, actorId),
      transaction.get(memberRef(roomId, targetId)),
    ])
    requireRole(actor, MODERATION_ROLES, 'Недостаточно прав для модерации.')
    const target = targetSnapshot.data()
    if (!targetSnapshot.exists || target?.status !== 'active') {
      throw new HttpsError('not-found', 'Активный участник не найден.')
    }
    requireTargetBelowActor(actor, target)

    const removal =
      action === 'ban' || action === 'kick'
        ? await readQueueRemoval(transaction, roomId, targetId)
        : null

    if (action === 'ban') {
      transaction.set(db.doc(`rooms/${roomId}/bans/${targetId}`), {
        bannedBy: actorId,
        createdAt: SERVER_TIMESTAMP,
        expiresAt,
        reason,
      })
      transaction.update(targetSnapshot.ref, { status: 'left' })
      applyQueueRemoval(transaction, removal, actorId)
    } else if (action === 'mute') {
      transaction.set(db.doc(`rooms/${roomId}/mutes/${targetId}`), {
        expiresAt,
        mutedBy: actorId,
        reason,
      })
    } else {
      transaction.update(targetSnapshot.ref, { status: 'left' })
      applyQueueRemoval(transaction, removal, actorId)
    }

    writeAudit(transaction, roomId, {
      action: `member_${action}`,
      actorId,
      expiresAt,
      reason,
      targetId,
    })
  })

  return { ok: true }
})

exports.clearRoomRestriction = callable(async request => {
  const actorId = requireAuth(request)
  const roomId = requiredId(request.data, 'roomId', 'Комната')
  const targetId = requiredId(request.data, 'memberId', 'Участник')
  const action = request.data?.action
  if (!CLEAR_RESTRICTION_ACTIONS.has(action)) {
    throw new HttpsError('invalid-argument', 'Неизвестный тип ограничения.')
  }

  await db.runTransaction(async transaction => {
    const { member: actor } = await activeMember(transaction, roomId, actorId)
    requireRole(actor, MODERATION_ROLES, 'Недостаточно прав для модерации.')
    const collection = action === 'unban' ? 'bans' : 'mutes'
    const restrictionRef = db.doc(`rooms/${roomId}/${collection}/${targetId}`)
    const restrictionSnapshot = await transaction.get(restrictionRef)
    if (restrictionSnapshot.exists) transaction.delete(restrictionRef)
    writeAudit(transaction, roomId, {
      action: `member_${action}`,
      actorId,
      targetId,
    })
  })

  return { ok: true }
})

async function advanceQueueForActor({
  actorId,
  auditAction,
  expectedVideoId = null,
  managerOnly,
  roomId,
}) {
  return db.runTransaction(async transaction => {
    const { member: actor } = await activeMember(transaction, roomId, actorId)
    if (managerOnly) {
      requireRole(
        actor,
        new Set(['host', 'owner']),
        'Пропускать видео может только владелец или ведущий.',
      )
    }

    const queueStateSnapshot = await transaction.get(
      db.doc(`rooms/${roomId}/queueState/current`),
    )
    const queueState = parseQueueState(queueStateSnapshot)
    const currentItemId = queueState?.itemIds?.[0]
    if (!currentItemId) {
      if (expectedVideoId) return { advanced: false }
      throw new HttpsError('failed-precondition', 'Очередь уже пуста.')
    }
    const currentItemSnapshot = await transaction.get(
      db.doc(`rooms/${roomId}/queue/${currentItemId}`),
    )
    const currentItem = currentItemSnapshot.data()
    if (
      !currentItemSnapshot.exists ||
      typeof currentItem?.userId !== 'string'
    ) {
      throw new HttpsError('failed-precondition', 'Текущее видео не найдено.')
    }
    if (
      !managerOnly &&
      !['host', 'owner'].includes(actor.role) &&
      currentItem.userId !== actorId
    ) {
      throw new HttpsError(
        'permission-denied',
        'Завершить видео может только владелец очереди, ведущий или владелец комнаты.',
      )
    }

    const removal = await readQueueRemoval(
      transaction,
      roomId,
      currentItem.userId,
    )
    if (!removal?.wasActive) {
      if (expectedVideoId) return { advanced: false }
      throw new HttpsError('aborted', 'Очередь уже была изменена.')
    }
    if (
      expectedVideoId &&
      (currentItem.videoId !== expectedVideoId ||
        removal.playbackSnapshot.data()?.videoId !== expectedVideoId)
    ) {
      return { advanced: false }
    }

    applyQueueRemoval(transaction, removal, actorId)
    writeAudit(transaction, roomId, {
      action: auditAction,
      actorId,
      targetId: currentItem.userId,
      videoId: currentItem.videoId,
    })
    return { advanced: true, skippedVideoId: currentItem.videoId }
  })
}

exports.advanceRoomVideo = callable(async request => {
  const actorId = requireAuth(request)
  const roomId = requiredId(request.data, 'roomId', 'Комната')
  const expectedVideoId = requiredId(request.data, 'finishedVideoId', 'Видео')
  if (!/^[-_A-Za-z0-9]{11}$/.test(expectedVideoId)) {
    throw new HttpsError(
      'invalid-argument',
      'Некорректный идентификатор видео.',
    )
  }

  const result = await advanceQueueForActor({
    actorId,
    auditAction: 'video_advanced',
    expectedVideoId,
    managerOnly: false,
    roomId,
  })
  return { ok: true, ...result }
})

exports.skipRoomVideo = callable(async request => {
  const actorId = requireAuth(request)
  const roomId = requiredId(request.data, 'roomId', 'Комната')

  const result = await advanceQueueForActor({
    actorId,
    auditAction: 'video_skipped',
    managerOnly: true,
    roomId,
  })

  return { ok: true, ...result }
})

exports.deleteRoomMessage = callable(async request => {
  const actorId = requireAuth(request)
  const roomId = requiredId(request.data, 'roomId', 'Комната')
  const messageId = requiredId(request.data, 'messageId', 'Сообщение')

  await db.runTransaction(async transaction => {
    const { member: actor } = await activeMember(transaction, roomId, actorId)
    requireRole(
      actor,
      MODERATION_ROLES,
      'Недостаточно прав для удаления сообщений.',
    )
    const messageRef = db.doc(`rooms/${roomId}/messages/${messageId}`)
    const messageSnapshot = await transaction.get(messageRef)
    if (!messageSnapshot.exists) return
    transaction.delete(messageRef)
    writeAudit(transaction, roomId, {
      action: 'message_deleted',
      actorId,
      messageId,
      targetId: messageSnapshot.data()?.authorId ?? null,
    })
  })

  return { ok: true }
})

exports.reportRoomMessage = callable(async request => {
  const actorId = requireAuth(request)
  const roomId = requiredId(request.data, 'roomId', 'Комната')
  const messageId = requiredId(request.data, 'messageId', 'Сообщение')
  const reason = normalizedReason(request.data)

  await db.runTransaction(async transaction => {
    await activeMember(transaction, roomId, actorId)
    const messageRef = db.doc(`rooms/${roomId}/messages/${messageId}`)
    const messageSnapshot = await transaction.get(messageRef)
    if (!messageSnapshot.exists) {
      throw new HttpsError('not-found', 'Сообщение уже удалено.')
    }
    if (messageSnapshot.data()?.authorId === actorId) {
      throw new HttpsError('invalid-argument', 'Нельзя пожаловаться на себя.')
    }

    const reportRef = db.doc(`rooms/${roomId}/reports/${messageId}_${actorId}`)
    const reportSnapshot = await transaction.get(reportRef)
    if (reportSnapshot.exists) {
      throw new HttpsError(
        'already-exists',
        'Вы уже отправили жалобу на это сообщение.',
      )
    }
    transaction.set(reportRef, {
      createdAt: SERVER_TIMESTAMP,
      messageId,
      reason,
      reportedUserId: messageSnapshot.data()?.authorId ?? null,
      reporterId: actorId,
      status: 'open',
    })
  })

  return { ok: true }
})

const OPERATIONS = {
  advanceRoomVideo: exports.advanceRoomVideo,
  clearRoomRestriction: exports.clearRoomRestriction,
  deleteRoomMessage: exports.deleteRoomMessage,
  moderateRoomMember: exports.moderateRoomMember,
  reportRoomMessage: exports.reportRoomMessage,
  setRoomMemberRole: exports.setRoomMemberRole,
  skipRoomVideo: exports.skipRoomVideo,
  transferRoomOwnership: exports.transferRoomOwnership,
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
    throw new HttpsError('permission-denied', 'Источник запроса запрещён.')
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
  if (!event.body) throw new HttpsError('invalid-argument', 'Пустой запрос.')
  const body = event.isBase64Encoded
    ? Buffer.from(event.body, 'base64').toString('utf8')
    : event.body

  try {
    const parsed = JSON.parse(body)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Invalid JSON object')
    }
    return parsed
  } catch {
    throw new HttpsError('invalid-argument', 'Некорректный запрос.')
  }
}

async function authenticate(event) {
  const authorization = getHeader(event, 'authorization')
  const match = /^Bearer\s+(.+)$/i.exec(authorization ?? '')
  if (!match) {
    throw new HttpsError('unauthenticated', 'Авторизация обязательна.')
  }

  try {
    return await getAuth(getFirebaseApp()).verifyIdToken(match[1], true)
  } catch {
    throw new HttpsError('unauthenticated', 'Сессия недействительна.')
  }
}

exports.handler = async function handler(event) {
  let corsHeaders
  try {
    corsHeaders = getCorsHeaders(event)
    if (event.httpMethod === 'OPTIONS') {
      return { body: '', headers: corsHeaders, statusCode: 204 }
    }
    if (event.httpMethod !== 'POST') {
      throw new HttpsError(
        'invalid-argument',
        'Метод запроса не поддерживается.',
      )
    }

    const decodedToken = await authenticate(event)
    const body = parseJsonBody(event)
    const operation =
      typeof body.operation === 'string' ? body.operation.trim() : ''
    const operationHandler = OPERATIONS[operation]
    if (!operationHandler) {
      throw new HttpsError('invalid-argument', 'Неизвестная операция.')
    }

    const data = { ...body }
    delete data.operation
    const result = await operationHandler({
      auth: { uid: decodedToken.uid },
      data,
    })
    return jsonResponse(200, result, corsHeaders)
  } catch (error) {
    const knownError = error instanceof HttpsError
    if (!knownError) console.error('Room management request failed:', error)
    const headers = corsHeaders ?? {
      'Cache-Control': 'no-store, max-age=0',
      'Content-Type': 'application/json; charset=utf-8',
    }
    return jsonResponse(
      knownError ? error.statusCode : 500,
      {
        error: knownError ? error.code : 'internal',
        message: knownError
          ? error.message
          : 'Сервер не смог выполнить действие. Повторите попытку.',
      },
      headers,
    )
  }
}
