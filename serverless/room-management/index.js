/* global AbortSignal, Buffer, URLSearchParams, console, exports, fetch, process, require */

const { createHash, randomBytes } = require('node:crypto')
const { cert, getApps, initializeApp } = require('firebase-admin/app')
const { getAuth } = require('firebase-admin/auth')
const { getDatabase } = require('firebase-admin/database')
const {
  FieldValue,
  Timestamp,
  getFirestore,
} = require('firebase-admin/firestore')
const {
  AppCheckRequestError,
  verifyRequestAppCheck,
} = require('../shared/firebase-app-check')
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
    const projectId = process.env.FIREBASE_PROJECT_ID || 'demo-lwmusic'
    return initializeApp({
      databaseURL:
        process.env.FIREBASE_DATABASE_URL ||
        `https://${projectId}-default-rtdb.firebaseio.com`,
      projectId,
    })
  }

  const serviceAccount = JSON.parse(
    requiredEnvironment('FIREBASE_SERVICE_ACCOUNT_JSON'),
  )
  return initializeApp({
    credential: cert(serviceAccount),
    databaseURL: requiredEnvironment('FIREBASE_DATABASE_URL'),
  })
}

const db = getFirestore(getFirebaseApp())
const realtimeDb = getDatabase(getFirebaseApp())
const SERVER_TIMESTAMP = FieldValue.serverTimestamp()
const REALTIME_ACCESS_LEASE_MILLISECONDS = 2 * 60_000
const ASSIGNABLE_ROLES = new Set(['host', 'member', 'moderator'])
const MODERATION_ROLES = new Set(['host', 'moderator', 'owner'])
const ROLE_RANK = { host: 2, member: 0, moderator: 1, owner: 3 }
const RESTRICTION_ACTIONS = new Set(['ban', 'kick', 'mute'])
const CLEAR_RESTRICTION_ACTIONS = new Set(['unban', 'unmute'])
const MAX_REASON_LENGTH = 500
const MAX_REPORT_COMMENT_LENGTH = 1000
const MAX_MESSAGE_LENGTH = 1000
const MAX_MESSAGE_LINKS = 2
const MAX_MESSAGES_PER_WINDOW = 5
const MESSAGE_RETENTION_MILLISECONDS = 24 * 60 * 60_000
const MESSAGE_WINDOW_MILLISECONDS = 20_000
const REGISTERED_MESSAGE_INTERVAL_MILLISECONDS = 2_000
const GUEST_MESSAGE_INTERVAL_MILLISECONDS = 5_000
const GUEST_CHAT_DELAY_MILLISECONDS = 15_000
const REPEATED_MESSAGE_WINDOW_MILLISECONDS = 120_000
const MAX_ACTIVE_INVITES = 10
const MAX_INVITES_PER_WINDOW = 5
const INVITE_WINDOW_MILLISECONDS = 10 * 60_000
const MAX_ROOMS_PER_USER = 10
const MAX_REPORTS_PER_HOUR = 5
const REPORT_WINDOW_MILLISECONDS = 60 * 60_000
const REPORT_DUPLICATE_WINDOW_MILLISECONDS = 24 * 60 * 60_000
const REPORT_TARGET_TYPES = new Set([
  'cover',
  'message',
  'nickname',
  'room',
  'user',
])
const ROOM_VISIBILITIES = new Set(['private', 'public', 'unlisted'])
const RUTUBE_SEARCH_CACHE_LIMIT = 200
const RUTUBE_SEARCH_CACHE_TTL_MILLISECONDS = 30 * 60_000
const RUTUBE_SEARCH_MIN_INTERVAL_MILLISECONDS = 1_500
const RUTUBE_SEARCH_FETCH_LIMIT = 40
const RUTUBE_SEARCH_RESULT_LIMIT = 5
const RUTUBE_VIDEO_ID_PATTERN = /^[a-f\d]{32}$/i
const RUTUBE_MUSIC_CATEGORY_IDS = new Set([6, 48])
const rutubeSearchCache = new Map()
const rutubeSearchInFlight = new Map()
const rutubeSearchLastRequestAt = new Map()
const ROOM_CATEGORIES = new Map([
  [1, 'Поп'],
  [2, 'Рок'],
  [3, 'Хип-хоп и рэп'],
  [4, 'Электронная музыка'],
  [5, 'R&B и соул'],
  [6, 'Джаз и блюз'],
  [7, 'Классическая музыка'],
  [8, 'Инди'],
  [9, 'Метал'],
  [10, 'Панк'],
  [11, 'Ретро'],
  [12, 'Саундтреки'],
  [13, 'Лоу-фай и чилл'],
  [14, 'Другое'],
])

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

function normalizedComment(data) {
  const value = typeof data?.comment === 'string' ? data.comment.trim() : ''
  if (value.length > MAX_REPORT_COMMENT_LENGTH) {
    throw new HttpsError(
      'invalid-argument',
      `Комментарий не может быть длиннее ${MAX_REPORT_COMMENT_LENGTH} символов.`,
    )
  }
  return value
}

function normalizeRoomName(value) {
  return typeof value === 'string'
    ? value.normalize('NFKC').trim().replace(/\s+/gu, ' ')
    : ''
}

function roomNameKey(value) {
  return `v1:${encodeURIComponent(value.toLocaleLowerCase('ru-RU'))}`
}

function validatedCategories(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 3) {
    throw new HttpsError(
      'invalid-argument',
      'Выберите от одной до трёх категорий.',
    )
  }
  const ids = new Set()
  return value.map(category => {
    const title = ROOM_CATEGORIES.get(category?.id)
    if (!title || category?.title !== title || ids.has(category.id)) {
      throw new HttpsError('invalid-argument', 'Категории комнаты некорректны.')
    }
    ids.add(category.id)
    return { id: category.id, title }
  })
}

function safeProfileSnapshot(snapshot) {
  const profile = snapshot.data() ?? {}
  return {
    displayName:
      typeof profile.displayName === 'string' ? profile.displayName : null,
    photoURL: typeof profile.photoURL === 'string' ? profile.photoURL : null,
    userId: snapshot.id,
  }
}

function safeRoomSnapshot(snapshot) {
  const room = snapshot.data() ?? {}
  return {
    imagePath: typeof room.imagePath === 'string' ? room.imagePath : null,
    imageUrl: typeof room.imageUrl === 'string' ? room.imageUrl : null,
    name: typeof room.name === 'string' ? room.name : null,
    ownerId: typeof room.ownerId === 'string' ? room.ownerId : null,
    roomId: snapshot.id,
    status: typeof room.status === 'string' ? room.status : null,
    visibility: typeof room.visibility === 'string' ? room.visibility : null,
  }
}

function normalizeMessageText(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function messageFingerprint(value) {
  return createHash('sha256')
    .update(
      value.normalize('NFKC').toLocaleLowerCase('ru-RU').replace(/\s+/gu, ' '),
    )
    .digest('hex')
}

function countLinks(value) {
  return value.match(/(?:https?:\/\/|www\.)\S+/giu)?.length ?? 0
}

function retryAfterError(milliseconds, label) {
  const seconds = Math.max(1, Math.ceil(milliseconds / 1000))
  return new HttpsError(
    'failed-precondition',
    `${label} Подождите ещё ${seconds} сек.`,
  )
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

function validatedRoomAccess(data) {
  const settings = data?.settings
  const status = data?.status
  const visibility = data?.visibility
  if (
    !settings ||
    typeof settings.allowGuestChat !== 'boolean' ||
    typeof settings.allowGuestQueue !== 'boolean' ||
    !Number.isInteger(settings.slowModeSeconds) ||
    settings.slowModeSeconds < 0 ||
    settings.slowModeSeconds > 300 ||
    !['active', 'archived'].includes(status) ||
    !ROOM_VISIBILITIES.has(visibility)
  ) {
    throw new HttpsError(
      'invalid-argument',
      'Некорректные настройки доступа к комнате.',
    )
  }
  return {
    settings: {
      allowGuestChat: settings.allowGuestChat,
      allowGuestQueue: settings.allowGuestQueue,
      slowModeSeconds: settings.slowModeSeconds,
    },
    status,
    visibility,
  }
}

function realtimeRoomAccessRef(roomId) {
  return realtimeDb.ref(`roomAccess/${roomId}`)
}

function isActiveBan(ban, nowMillis = Date.now()) {
  return (
    ban != null &&
    (ban.expiresAt == null ||
      (typeof ban.expiresAt.toMillis === 'function' &&
        ban.expiresAt.toMillis() > nowMillis))
  )
}

function realtimeBanExpiration(expiresAt) {
  return expiresAt == null ? 0 : expiresAt.toMillis()
}

async function grantRealtimeRoomAccess(roomId, userId, room) {
  await realtimeRoomAccessRef(roomId).update({
    [`members/${userId}`]: Date.now() + REALTIME_ACCESS_LEASE_MILLISECONDS,
    status: room.status,
    visibility: room.visibility,
  })
}

async function revokeRealtimeRoomAccess(roomId, userId) {
  await realtimeDb.ref().update({
    [`roomAccess/${roomId}/members/${userId}`]: null,
    [`roomPresence/${roomId}/${userId}`]: null,
    [`roomReactions/${roomId}/${userId}`]: null,
  })
}

async function syncRealtimeRoomMetadata(roomId, room) {
  if (room.status === 'archived') {
    await realtimeDb.ref().update({
      [`roomAccess/${roomId}/members`]: null,
      [`roomAccess/${roomId}/status`]: room.status,
      [`roomAccess/${roomId}/visibility`]: room.visibility,
      [`roomPresence/${roomId}`]: null,
      [`roomReactions/${roomId}`]: null,
    })
    return
  }

  await realtimeRoomAccessRef(roomId).update({
    status: room.status,
    visibility: room.visibility,
  })
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

async function requireRoomQueueSearchAccess(roomId, userId) {
  const [memberSnapshot, roomSnapshot] = await Promise.all([
    memberRef(roomId, userId).get(),
    db.doc(`rooms/${roomId}`).get(),
  ])
  const member = memberSnapshot.data()
  const room = roomSnapshot.data()
  if (
    !memberSnapshot.exists ||
    member?.status !== 'active' ||
    !roomSnapshot.exists ||
    room?.status !== 'active'
  ) {
    throw new HttpsError(
      'permission-denied',
      'У вас больше нет доступа к этой комнате.',
    )
  }
  if (member.isGuest && room?.settings?.allowGuestQueue !== true) {
    throw new HttpsError(
      'permission-denied',
      'Владелец комнаты отключил очередь для гостей.',
    )
  }
}

function normalizeRutubeQuery(value) {
  if (typeof value !== 'string') return ''
  return value.normalize('NFKC').replace(/\s+/gu, ' ').trim()
}

function decodeHtmlText(value) {
  if (typeof value !== 'string') return ''

  const namedEntities = {
    amp: '&',
    apos: "'",
    gt: '>',
    lt: '<',
    quot: '"',
  }

  return value
    .replace(/&#(\d+);/gu, (match, code) => {
      const codePoint = Number(code)
      return Number.isInteger(codePoint) && codePoint <= 0x10ffff
        ? String.fromCodePoint(codePoint)
        : match
    })
    .replace(/&#x([\da-f]+);/giu, (match, code) => {
      const codePoint = Number.parseInt(code, 16)
      return Number.isInteger(codePoint) && codePoint <= 0x10ffff
        ? String.fromCodePoint(codePoint)
        : match
    })
    .replace(/&(amp|apos|gt|lt|quot);/gu, (_, name) => namedEntities[name])
}

function safeRutubeSearchItem(item, musicOnly) {
  const videoId = item?.id
  if (
    !RUTUBE_VIDEO_ID_PATTERN.test(videoId) ||
    item?.content_type !== 'video' ||
    item?.is_hidden === true ||
    item?.is_adult === true ||
    item?.is_paid === true ||
    item?.is_livestream === true ||
    item?.is_on_air === true ||
    (musicOnly && !RUTUBE_MUSIC_CATEGORY_IDS.has(item?.category?.id))
  ) {
    return null
  }

  const thumbnailUrl = item?.thumbnail_url
  const title = decodeHtmlText(item?.title).trim()
  const embedUrl = item?.embed_url
  if (typeof thumbnailUrl !== 'string' || !title) return null
  if (
    !thumbnailUrl.startsWith('https://') ||
    typeof embedUrl !== 'string' ||
    !embedUrl.startsWith(`https://rutube.ru/play/embed/${videoId}`)
  ) {
    return null
  }

  return {
    channelTitle: decodeHtmlText(item?.author?.name).trim(),
    thumbnailUrl,
    title,
    videoId: videoId.toLowerCase(),
  }
}

function safeRutubePlaybackItem(item, expectedVideoId) {
  const videoId = item?.video_id
  const thumbnailUrl = item?.thumbnail_url
  const title = decodeHtmlText(item?.title).trim()
  const restrictions = item?.restrictions
  const hasRestrictions =
    restrictions != null &&
    (typeof restrictions !== 'object' || Object.keys(restrictions).length > 0)
  if (
    !RUTUBE_VIDEO_ID_PATTERN.test(videoId) ||
    videoId.toLowerCase() !== expectedVideoId.toLowerCase() ||
    typeof thumbnailUrl !== 'string' ||
    !thumbnailUrl.startsWith('https://') ||
    !title ||
    item?.is_hidden === true ||
    item?.is_adult === true ||
    item?.is_paid === true ||
    item?.is_livestream === true ||
    item?.is_on_air === true ||
    hasRestrictions
  ) {
    return null
  }

  return {
    channelTitle: decodeHtmlText(item?.author?.name).trim(),
    thumbnailUrl,
    title,
    videoId: videoId.toLowerCase(),
  }
}

function cachedRutubeSearch(cacheKey) {
  const cached = rutubeSearchCache.get(cacheKey)
  if (!cached) return null
  if (cached.expiresAt <= Date.now()) {
    rutubeSearchCache.delete(cacheKey)
    return null
  }

  rutubeSearchCache.delete(cacheKey)
  rutubeSearchCache.set(cacheKey, cached)
  return cached.items
}

function cacheRutubeSearch(cacheKey, items) {
  rutubeSearchCache.set(cacheKey, {
    expiresAt: Date.now() + RUTUBE_SEARCH_CACHE_TTL_MILLISECONDS,
    items,
  })
  while (rutubeSearchCache.size > RUTUBE_SEARCH_CACHE_LIMIT) {
    rutubeSearchCache.delete(rutubeSearchCache.keys().next().value)
  }
}

async function requestRutubeSearch(query, musicOnly) {
  const parameters = new URLSearchParams({
    content_type: 'video',
    page: '1',
    per_page: String(RUTUBE_SEARCH_FETCH_LIMIT),
    query,
  })

  let response
  try {
    response = await fetch(
      `https://rutube.ru/api/search/combined/video_playlist?${parameters}`,
      {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'Syncly/1.0 (+https://syncly.lyricweb.ru)',
        },
        signal: AbortSignal.timeout(8_000),
      },
    )
  } catch {
    throw new HttpsError(
      'internal',
      'RUTUBE не ответил вовремя. Повторите поиск.',
    )
  }

  if (!response.ok) {
    if (response.status === 429) {
      throw new HttpsError(
        'failed-precondition',
        'Поиск RUTUBE временно ограничен. Повторите позже или вставьте ссылку.',
      )
    }
    console.error('RUTUBE search failed:', response.status)
    throw new HttpsError('internal', 'Не удалось выполнить поиск на RUTUBE.')
  }

  const payload = await response.json()
  return Array.isArray(payload?.results)
    ? payload.results
        .map(item => safeRutubeSearchItem(item, musicOnly))
        .filter(Boolean)
        .slice(0, RUTUBE_SEARCH_RESULT_LIMIT)
    : []
}

async function requestRutubeVideo(videoId) {
  let response
  try {
    response = await fetch(`https://rutube.ru/api/play/options/${videoId}`, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Syncly/1.0 (+https://syncly.lyricweb.ru)',
      },
      signal: AbortSignal.timeout(8_000),
    })
  } catch {
    throw new HttpsError(
      'internal',
      'RUTUBE не ответил вовремя. Повторите попытку.',
    )
  }

  if (response.status === 404) {
    throw new HttpsError('not-found', 'Видео RUTUBE не найдено.')
  }
  if (!response.ok) {
    console.error('RUTUBE video lookup failed:', response.status)
    throw new HttpsError('internal', 'Не удалось проверить видео RUTUBE.')
  }

  const item = safeRutubePlaybackItem(await response.json(), videoId)
  if (!item) {
    throw new HttpsError(
      'failed-precondition',
      'Это видео RUTUBE нельзя воспроизвести в комнате.',
    )
  }
  return item
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

exports.searchRutubeVideos = callable(async request => {
  const actorId = requireAuth(request)
  const roomId = requiredId(request.data, 'roomId', 'Комната')
  const query = normalizeRutubeQuery(request.data?.query)
  const musicOnly = request.data?.musicOnly

  if (query.length < 2 || query.length > 100) {
    throw new HttpsError(
      'invalid-argument',
      'Запрос должен содержать от 2 до 100 символов.',
    )
  }
  if (typeof musicOnly !== 'boolean') {
    throw new HttpsError('invalid-argument', 'Некорректный фильтр поиска.')
  }

  await requireRoomQueueSearchAccess(roomId, actorId)

  const cacheKey = `${musicOnly ? 'music' : 'all'}:${query.toLocaleLowerCase(
    'ru-RU',
  )}`
  const cachedItems = cachedRutubeSearch(cacheKey)
  if (cachedItems) return { items: cachedItems }

  const existingRequest = rutubeSearchInFlight.get(cacheKey)
  if (existingRequest) return { items: await existingRequest }

  const now = Date.now()
  const lastRequestAt = rutubeSearchLastRequestAt.get(actorId) ?? 0
  const retryAfter =
    RUTUBE_SEARCH_MIN_INTERVAL_MILLISECONDS - (now - lastRequestAt)
  if (retryAfter > 0) {
    throw retryAfterError(retryAfter, 'Слишком частый поиск.')
  }
  rutubeSearchLastRequestAt.delete(actorId)
  rutubeSearchLastRequestAt.set(actorId, now)
  while (rutubeSearchLastRequestAt.size > 1_000) {
    rutubeSearchLastRequestAt.delete(
      rutubeSearchLastRequestAt.keys().next().value,
    )
  }

  const pendingRequest = requestRutubeSearch(query, musicOnly)
  rutubeSearchInFlight.set(cacheKey, pendingRequest)
  try {
    const items = await pendingRequest
    cacheRutubeSearch(cacheKey, items)
    return { items }
  } finally {
    rutubeSearchInFlight.delete(cacheKey)
  }
})

exports.getRutubeVideo = callable(async request => {
  const actorId = requireAuth(request)
  const roomId = requiredId(request.data, 'roomId', 'Комната')
  const videoId = requiredId(request.data, 'videoId', 'Видео')
  if (!RUTUBE_VIDEO_ID_PATTERN.test(videoId)) {
    throw new HttpsError(
      'invalid-argument',
      'Некорректная ссылка на видео RUTUBE.',
    )
  }

  await requireRoomQueueSearchAccess(roomId, actorId)
  return requestRutubeVideo(videoId.toLowerCase())
})

exports.createRoom = callable(async request => {
  const actorId = requireAuth(request)
  if (request.auth?.token?.firebase?.sign_in_provider === 'anonymous') {
    throw new HttpsError(
      'permission-denied',
      'Гостевой аккаунт не может создавать комнаты.',
    )
  }

  const roomId = requiredId(request.data, 'roomId', 'Комната')
  if (!/^[A-Za-z0-9_-]{10,40}$/.test(roomId)) {
    throw new HttpsError(
      'invalid-argument',
      'Некорректный идентификатор комнаты.',
    )
  }
  const name = normalizeRoomName(request.data?.name)
  if (!name || name.length > 80) {
    throw new HttpsError(
      'invalid-argument',
      'Название комнаты должно содержать от 1 до 80 символов.',
    )
  }
  const nameKey = roomNameKey(name)
  const categories = validatedCategories(request.data?.categories)
  const visibility = request.data?.visibility
  if (!ROOM_VISIBILITIES.has(visibility)) {
    throw new HttpsError('invalid-argument', 'Некорректная видимость комнаты.')
  }

  const imagePath =
    typeof request.data?.imagePath === 'string' ? request.data.imagePath : ''
  const imageUrl =
    typeof request.data?.imageUrl === 'string' ? request.data.imageUrl : ''
  const escapedRoomId = roomId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const imagePathPattern = new RegExp(
    `^room-covers/${escapedRoomId}/cover-[0-9a-f-]{36}\\.(?:jpg|png|webp)$`,
  )
  const imageUrlPattern = new RegExp(
    `^https://storage\\.yandexcloud\\.net/[^/]+/${imagePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`,
  )
  if (
    !imagePathPattern.test(imagePath) ||
    imageUrl.length > 2048 ||
    !imageUrlPattern.test(imageUrl)
  ) {
    throw new HttpsError('invalid-argument', 'Некорректная обложка комнаты.')
  }

  const roomRef = db.doc(`rooms/${roomId}`)
  const nameRef = db.doc(`roomNames/${nameKey}`)
  const ownerMemberRef = memberRef(roomId, actorId)
  const ownerRoomsQuery = db.collection('rooms').where('ownerId', '==', actorId)

  await db.runTransaction(async transaction => {
    const [roomSnapshot, nameSnapshot, ownerRoomsSnapshot] = await Promise.all([
      transaction.get(roomRef),
      transaction.get(nameRef),
      transaction.get(ownerRoomsQuery),
    ])
    if (roomSnapshot.exists) {
      throw new HttpsError('already-exists', 'Комната уже существует.')
    }
    if (nameSnapshot.exists) {
      throw new HttpsError(
        'already-exists',
        'Комната с таким названием уже существует.',
      )
    }
    if (ownerRoomsSnapshot.size >= MAX_ROOMS_PER_USER) {
      throw new HttpsError(
        'failed-precondition',
        `Можно создать не больше ${MAX_ROOMS_PER_USER} комнат.`,
      )
    }

    transaction.set(nameRef, {
      createdAt: SERVER_TIMESTAMP,
      name,
      ownerId: actorId,
      roomId,
    })
    transaction.set(roomRef, {
      categories,
      createdAt: SERVER_TIMESTAMP,
      imagePath,
      imageUrl,
      name,
      nameKey,
      ownerId: actorId,
      settings: {
        allowGuestChat: true,
        allowGuestQueue: true,
        slowModeSeconds: 0,
      },
      status: 'active',
      updatedAt: SERVER_TIMESTAMP,
      visibility,
    })
    transaction.set(ownerMemberRef, {
      invitedBy: null,
      isGuest: false,
      joinedAt: SERVER_TIMESTAMP,
      role: 'owner',
      status: 'active',
      userId: actorId,
    })
  })

  await syncRealtimeRoomMetadata(roomId, { status: 'active', visibility })
  await grantRealtimeRoomAccess(roomId, actorId, {
    status: 'active',
    visibility,
  })

  return { ok: true, roomId }
})

exports.authorizeRealtimeRoom = callable(async request => {
  const actorId = requireAuth(request)
  const roomId = requiredId(request.data, 'roomId', 'Комната')
  const [roomSnapshot, memberSnapshot, banSnapshot] = await Promise.all([
    db.doc(`rooms/${roomId}`).get(),
    memberRef(roomId, actorId).get(),
    db.doc(`rooms/${roomId}/bans/${actorId}`).get(),
  ])
  const room = roomSnapshot.data()
  const member = memberSnapshot.data()
  const ban = banSnapshot.exists ? banSnapshot.data() : null
  if (isActiveBan(ban)) {
    await realtimeDb.ref().update({
      [`roomAccess/${roomId}/bans/${actorId}`]: realtimeBanExpiration(
        ban.expiresAt,
      ),
      [`roomAccess/${roomId}/members/${actorId}`]: null,
      [`roomPresence/${roomId}/${actorId}`]: null,
      [`roomReactions/${roomId}/${actorId}`]: null,
    })
    throw new HttpsError(
      'permission-denied',
      'У вас нет доступа к realtime-данным этой комнаты.',
    )
  }
  if (
    !roomSnapshot.exists ||
    room?.status !== 'active' ||
    !ROOM_VISIBILITIES.has(room?.visibility) ||
    !memberSnapshot.exists ||
    member?.status !== 'active'
  ) {
    if (
      roomSnapshot.exists &&
      ['active', 'archived'].includes(room?.status) &&
      ROOM_VISIBILITIES.has(room?.visibility)
    ) {
      await syncRealtimeRoomMetadata(roomId, room)
    }
    await revokeRealtimeRoomAccess(roomId, actorId)
    throw new HttpsError(
      'permission-denied',
      'У вас нет доступа к realtime-данным этой комнаты.',
    )
  }

  if (member.userId !== actorId) {
    await memberRef(roomId, actorId).update({ userId: actorId })
  }
  await grantRealtimeRoomAccess(roomId, actorId, room)
  if (banSnapshot.exists) {
    await realtimeRoomAccessRef(roomId).child(`bans/${actorId}`).remove()
  }
  return {
    expiresAt: Date.now() + REALTIME_ACCESS_LEASE_MILLISECONDS,
    ok: true,
  }
})

exports.revokeRealtimeRoomAccess = callable(async request => {
  const actorId = requireAuth(request)
  const roomId = requiredId(request.data, 'roomId', 'Комната')
  await revokeRealtimeRoomAccess(roomId, actorId)
  return { ok: true }
})

exports.leaveRoom = callable(async request => {
  const actorId = requireAuth(request)
  const roomId = requiredId(request.data, 'roomId', 'Комната')
  let membershipChanged = false

  await db.runTransaction(async transaction => {
    const [roomSnapshot, memberSnapshot] = await Promise.all([
      transaction.get(db.doc(`rooms/${roomId}`)),
      transaction.get(memberRef(roomId, actorId)),
    ])
    const member = memberSnapshot.data()
    if (
      member?.role === 'owner' ||
      (roomSnapshot.exists && roomSnapshot.data()?.ownerId === actorId)
    ) {
      throw new HttpsError(
        'failed-precondition',
        'Владелец не может покинуть комнату без передачи прав.',
      )
    }
    if (!memberSnapshot.exists || member?.status !== 'active') return

    const removal = await readQueueRemoval(transaction, roomId, actorId)
    transaction.update(memberSnapshot.ref, { status: 'left' })
    applyQueueRemoval(transaction, removal, actorId)
    writeAudit(transaction, roomId, {
      action: 'member_left',
      actorId,
      targetId: actorId,
    })
    membershipChanged = true
  })

  await revokeRealtimeRoomAccess(roomId, actorId)
  return { membershipChanged, ok: true }
})

exports.updateRoomAccess = callable(async request => {
  const actorId = requireAuth(request)
  const roomId = requiredId(request.data, 'roomId', 'Комната')
  const access = validatedRoomAccess(request.data)
  const roomRef = db.doc(`rooms/${roomId}`)

  await db.runTransaction(async transaction => {
    const [roomSnapshot, actorSnapshot] = await Promise.all([
      transaction.get(roomRef),
      transaction.get(memberRef(roomId, actorId)),
    ])
    if (
      !roomSnapshot.exists ||
      roomSnapshot.data()?.ownerId !== actorId ||
      !actorSnapshot.exists ||
      actorSnapshot.data()?.status !== 'active' ||
      actorSnapshot.data()?.role !== 'owner'
    ) {
      throw new HttpsError(
        'permission-denied',
        'Только владелец может менять настройки комнаты.',
      )
    }
    transaction.update(roomRef, {
      ...access,
      updatedAt: SERVER_TIMESTAMP,
    })
  })

  await syncRealtimeRoomMetadata(roomId, access)
  return { ok: true }
})

exports.createRoomInvite = callable(async request => {
  const actorId = requireAuth(request)
  if (request.auth?.token?.firebase?.sign_in_provider === 'anonymous') {
    throw new HttpsError(
      'permission-denied',
      'Гостевой аккаунт не может создавать приглашения.',
    )
  }
  const roomId = requiredId(request.data, 'roomId', 'Комната')
  const expiresAtMillis = request.data?.expiresAtMillis
  const maxUses = request.data?.maxUses ?? 1
  if (
    typeof expiresAtMillis !== 'number' ||
    !Number.isSafeInteger(expiresAtMillis) ||
    expiresAtMillis <= Date.now()
  ) {
    throw new HttpsError(
      'invalid-argument',
      'Срок действия приглашения должен быть в будущем.',
    )
  }
  if (!Number.isInteger(maxUses) || maxUses < 1 || maxUses > 100) {
    throw new HttpsError(
      'invalid-argument',
      'Количество использований должно быть от 1 до 100.',
    )
  }

  const token = randomBytes(32).toString('base64url')
  const tokenHash = createHash('sha256').update(token).digest('hex')
  const inviteRef = db.doc(`roomInvites/${tokenHash}`)
  const secretRef = db.doc(`roomInviteSecrets/${tokenHash}`)
  const roomRef = db.doc(`rooms/${roomId}`)
  const actorRef = memberRef(roomId, actorId)
  const actorInvitesQuery = db
    .collection('roomInvites')
    .where('createdBy', '==', actorId)
  const activeMembersQuery = db
    .collection(`rooms/${roomId}/members`)
    .where('status', '==', 'active')
  const nowMillis = Date.now()

  await db.runTransaction(async transaction => {
    const [roomSnapshot, actorSnapshot, invitesSnapshot, membersSnapshot] =
      await Promise.all([
        transaction.get(roomRef),
        transaction.get(actorRef),
        transaction.get(actorInvitesQuery),
        transaction.get(activeMembersQuery),
      ])
    const room = roomSnapshot.data()
    const actor = actorSnapshot.data()
    if (!roomSnapshot.exists || room?.visibility !== 'private') {
      throw new HttpsError(
        'failed-precondition',
        'Приглашения создаются только для приватных комнат.',
      )
    }
    if (!actorSnapshot.exists || actor?.status !== 'active') {
      throw new HttpsError('permission-denied', 'Вы не участвуете в комнате.')
    }
    requireRole(actor, MODERATION_ROLES, 'Недостаточно прав для приглашения.')

    const invites = invitesSnapshot.docs.map(snapshot => snapshot.data())
    const activeInviteCount = invites.filter(invite => {
      const expiresAt = invite.expiresAt
      return (
        invite.revokedAt == null &&
        expiresAt instanceof Timestamp &&
        expiresAt.toMillis() > nowMillis &&
        Number.isInteger(invite.uses) &&
        Number.isInteger(invite.maxUses) &&
        invite.uses < invite.maxUses
      )
    }).length
    if (activeInviteCount >= MAX_ACTIVE_INVITES) {
      throw new HttpsError(
        'failed-precondition',
        `Можно держать не больше ${MAX_ACTIVE_INVITES} активных приглашений.`,
      )
    }
    const recentInviteCount = invites.filter(
      invite =>
        invite.createdAt instanceof Timestamp &&
        invite.createdAt.toMillis() > nowMillis - INVITE_WINDOW_MILLISECONDS,
    ).length
    if (recentInviteCount >= MAX_INVITES_PER_WINDOW) {
      throw retryAfterError(
        INVITE_WINDOW_MILLISECONDS,
        'Слишком много приглашений.',
      )
    }

    transaction.set(inviteRef, {
      createdAt: SERVER_TIMESTAMP,
      createdBy: actorId,
      expiresAt: Timestamp.fromMillis(expiresAtMillis),
      maxUses,
      participantCount: membersSnapshot.size,
      revokedAt: null,
      roomId,
      roomImageUrl: room.imageUrl,
      roomName: room.name,
      tokenHash,
      uses: 0,
    })
    transaction.set(secretRef, {
      createdAt: SERVER_TIMESTAMP,
      createdBy: actorId,
      roomId,
      token,
      tokenHash,
    })
  })

  return { ok: true, token }
})

exports.revokeRoomInvite = callable(async request => {
  const actorId = requireAuth(request)
  const tokenHash = requiredId(request.data, 'tokenHash', 'Приглашение')
  if (!/^[a-f0-9]{64}$/.test(tokenHash)) {
    throw new HttpsError('invalid-argument', 'Некорректное приглашение.')
  }
  const inviteRef = db.doc(`roomInvites/${tokenHash}`)

  await db.runTransaction(async transaction => {
    const inviteSnapshot = await transaction.get(inviteRef)
    if (!inviteSnapshot.exists) return
    const invite = inviteSnapshot.data()
    const roomId = invite?.roomId
    if (typeof roomId !== 'string') {
      throw new HttpsError('failed-precondition', 'Приглашение повреждено.')
    }
    const { member: actor } = await activeMember(transaction, roomId, actorId)
    requireRole(
      actor,
      MODERATION_ROLES,
      'Недостаточно прав для отзыва приглашения.',
    )
    transaction.update(inviteRef, { revokedAt: SERVER_TIMESTAMP })
    transaction.delete(db.doc(`roomInviteSecrets/${tokenHash}`))
  })

  return { ok: true }
})

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

  if (action === 'ban') {
    await realtimeDb.ref().update({
      [`roomAccess/${roomId}/bans/${targetId}`]:
        realtimeBanExpiration(expiresAt),
      [`roomAccess/${roomId}/members/${targetId}`]: null,
      [`roomPresence/${roomId}/${targetId}`]: null,
      [`roomReactions/${roomId}/${targetId}`]: null,
    })
  } else if (action === 'kick') {
    await revokeRealtimeRoomAccess(roomId, targetId)
  }

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

  if (action === 'unban') {
    await realtimeRoomAccessRef(roomId).child(`bans/${targetId}`).remove()
  }

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
  if (!/^([-_A-Za-z0-9]{11}|[a-f\d]{32})$/.test(expectedVideoId)) {
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

exports.sendRoomMessage = callable(async request => {
  const actorId = requireAuth(request)
  const roomId = requiredId(request.data, 'roomId', 'Комната')
  const text = normalizeMessageText(request.data?.text)
  if (!text || text.length > MAX_MESSAGE_LENGTH) {
    throw new HttpsError(
      'invalid-argument',
      `Сообщение должно содержать от 1 до ${MAX_MESSAGE_LENGTH} символов.`,
    )
  }
  if (countLinks(text) > MAX_MESSAGE_LINKS) {
    throw new HttpsError(
      'invalid-argument',
      `В одном сообщении можно отправить не больше ${MAX_MESSAGE_LINKS} ссылок.`,
    )
  }

  const now = Timestamp.now()
  const nowMillis = now.toMillis()
  const fingerprint = messageFingerprint(text)
  const roomRef = db.doc(`rooms/${roomId}`)
  const actorMemberRef = memberRef(roomId, actorId)
  const profileRef = db.doc(`users/${actorId}`)
  const muteRef = db.doc(`rooms/${roomId}/mutes/${actorId}`)
  const activityRef = db.doc(`rooms/${roomId}/messageActivity/${actorId}`)
  const messageRef = db.collection(`rooms/${roomId}/messages`).doc()

  await db.runTransaction(async transaction => {
    const [
      roomSnapshot,
      memberSnapshot,
      profileSnapshot,
      muteSnapshot,
      activitySnapshot,
    ] = await Promise.all([
      transaction.get(roomRef),
      transaction.get(actorMemberRef),
      transaction.get(profileRef),
      transaction.get(muteRef),
      transaction.get(activityRef),
    ])
    const room = roomSnapshot.data()
    const member = memberSnapshot.data()
    const profile = profileSnapshot.data()
    if (!roomSnapshot.exists || room?.status === 'archived') {
      throw new HttpsError('failed-precondition', 'Комната закрыта.')
    }
    if (!memberSnapshot.exists || member?.status !== 'active') {
      throw new HttpsError('permission-denied', 'Вы не участвуете в комнате.')
    }
    if (!profileSnapshot.exists || typeof profile?.displayName !== 'string') {
      throw new HttpsError('failed-precondition', 'Сначала заполните профиль.')
    }
    if (member.isGuest === true && room.settings?.allowGuestChat !== true) {
      throw new HttpsError(
        'permission-denied',
        'Владелец комнаты отключил чат для гостей.',
      )
    }

    const mute = muteSnapshot.data()
    if (
      muteSnapshot.exists &&
      (mute?.expiresAt == null ||
        (mute.expiresAt instanceof Timestamp &&
          mute.expiresAt.toMillis() > nowMillis))
    ) {
      throw new HttpsError(
        'permission-denied',
        'Модератор временно запретил вам писать в чат.',
      )
    }

    if (member.isGuest === true && member.joinedAt instanceof Timestamp) {
      const guestDelayRemaining =
        member.joinedAt.toMillis() + GUEST_CHAT_DELAY_MILLISECONDS - nowMillis
      if (guestDelayRemaining > 0) {
        throw retryAfterError(
          guestDelayRemaining,
          'Гости могут писать не сразу после входа.',
        )
      }
    }

    const activity = activitySnapshot.data() ?? {}
    const lastMessageAt = activity.lastMessageAt
    const configuredSlowModeMilliseconds =
      Number.isInteger(room.settings?.slowModeSeconds) &&
      room.settings.slowModeSeconds > 0
        ? room.settings.slowModeSeconds * 1000
        : 0
    const baseIntervalMilliseconds =
      member.isGuest === true
        ? GUEST_MESSAGE_INTERVAL_MILLISECONDS
        : REGISTERED_MESSAGE_INTERVAL_MILLISECONDS
    const requiredIntervalMilliseconds = Math.max(
      baseIntervalMilliseconds,
      configuredSlowModeMilliseconds,
    )
    if (lastMessageAt instanceof Timestamp) {
      const intervalRemaining =
        lastMessageAt.toMillis() + requiredIntervalMilliseconds - nowMillis
      if (intervalRemaining > 0) {
        throw retryAfterError(
          intervalRemaining,
          'Сообщения отправляются слишком часто.',
        )
      }
    }

    const previousMessages = Array.isArray(activity.recentMessages)
      ? activity.recentMessages.filter(
          entry =>
            entry?.createdAt instanceof Timestamp &&
            typeof entry.fingerprint === 'string' &&
            entry.createdAt.toMillis() >
              nowMillis - REPEATED_MESSAGE_WINDOW_MILLISECONDS,
        )
      : []
    const burstMessages = previousMessages.filter(
      entry =>
        entry.createdAt.toMillis() > nowMillis - MESSAGE_WINDOW_MILLISECONDS,
    )
    if (burstMessages.length >= MAX_MESSAGES_PER_WINDOW) {
      const retryAt =
        burstMessages[0].createdAt.toMillis() + MESSAGE_WINDOW_MILLISECONDS
      throw retryAfterError(
        Math.max(1, retryAt - nowMillis),
        `Можно отправить не больше ${MAX_MESSAGES_PER_WINDOW} сообщений за 20 секунд.`,
      )
    }
    if (previousMessages.some(entry => entry.fingerprint === fingerprint)) {
      throw new HttpsError(
        'failed-precondition',
        'Не отправляйте одно и то же сообщение повторно.',
      )
    }

    transaction.set(messageRef, {
      authorId: actorId,
      authorName: profile.displayName,
      authorPhotoURL:
        typeof profile.photoURL === 'string' ? profile.photoURL : null,
      createdAt: now,
      expiresAt: Timestamp.fromMillis(
        nowMillis + MESSAGE_RETENTION_MILLISECONDS,
      ),
      text,
    })
    transaction.set(activityRef, {
      lastMessageAt: now,
      messageId: messageRef.id,
      recentMessages: [
        ...previousMessages.slice(-(MAX_MESSAGES_PER_WINDOW - 1)),
        { createdAt: now, fingerprint },
      ],
    })
  })

  return { messageId: messageRef.id, ok: true }
})

exports.deleteRoomMessage = callable(async request => {
  const actorId = requireAuth(request)
  const roomId = requiredId(request.data, 'roomId', 'Комната')
  const messageId = requiredId(request.data, 'messageId', 'Сообщение')
  const moderationLogRef = db.collection('moderationLogs').doc()
  let deleted = false

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
    deleted = true
    transaction.set(moderationLogRef, {
      action: 'message_deleted',
      actorId,
      createdAt: SERVER_TIMESTAMP,
      messageId,
      original: messageSnapshot.data(),
      roomId,
    })
    transaction.delete(messageRef)
    writeAudit(transaction, roomId, {
      action: 'message_deleted',
      actorId,
      messageId,
      targetId: messageSnapshot.data()?.authorId ?? null,
    })
  })

  return {
    moderationLogId: deleted ? moderationLogRef.id : null,
    ok: true,
  }
})

exports.createReport = callable(async request => {
  const actorId = requireAuth(request)
  const roomId = requiredId(request.data, 'roomId', 'Комната')
  const targetId = requiredId(request.data, 'targetId', 'Объект жалобы')
  const targetType = request.data?.targetType
  if (!REPORT_TARGET_TYPES.has(targetType)) {
    throw new HttpsError('invalid-argument', 'Некорректный объект жалобы.')
  }
  const reason = normalizedReason(request.data)
  const comment = normalizedComment(request.data)
  const reportRef = db.collection('reports').doc()
  const reportActivityRef = db.doc(`reportActivity/${actorId}`)
  const roomRef = db.doc(`rooms/${roomId}`)
  const now = Timestamp.now()
  const nowMillis = now.toMillis()
  const duplicateKey = createHash('sha256')
    .update(`${targetType}\u0000${targetId}\u0000${roomId}`)
    .digest('hex')

  await db.runTransaction(async transaction => {
    await activeMember(transaction, roomId, actorId)
    const [roomSnapshot, activitySnapshot] = await Promise.all([
      transaction.get(roomRef),
      transaction.get(reportActivityRef),
    ])
    if (!roomSnapshot.exists) {
      throw new HttpsError('not-found', 'Комната не найдена.')
    }

    const recentReports = Array.isArray(activitySnapshot.data()?.recentReports)
      ? activitySnapshot
          .data()
          .recentReports.filter(
            entry =>
              entry?.createdAt instanceof Timestamp &&
              typeof entry.duplicateKey === 'string' &&
              entry.createdAt.toMillis() >
                nowMillis - REPORT_DUPLICATE_WINDOW_MILLISECONDS,
          )
      : []
    if (
      recentReports.filter(
        entry =>
          entry.createdAt.toMillis() > nowMillis - REPORT_WINDOW_MILLISECONDS,
      ).length >= MAX_REPORTS_PER_HOUR
    ) {
      throw new HttpsError(
        'failed-precondition',
        `Можно отправить не больше ${MAX_REPORTS_PER_HOUR} жалоб в час.`,
      )
    }
    if (recentReports.some(entry => entry.duplicateKey === duplicateKey)) {
      throw new HttpsError(
        'already-exists',
        'Вы уже отправляли жалобу на этот объект за последние сутки.',
      )
    }

    let snapshot
    if (targetType === 'message') {
      const messageSnapshot = await transaction.get(
        db.doc(`rooms/${roomId}/messages/${targetId}`),
      )
      if (!messageSnapshot.exists) {
        throw new HttpsError('not-found', 'Сообщение уже удалено.')
      }
      const message = messageSnapshot.data()
      if (message?.authorId === actorId) {
        throw new HttpsError('invalid-argument', 'Нельзя пожаловаться на себя.')
      }
      snapshot = {
        message: {
          authorId: message?.authorId ?? null,
          authorName: message?.authorName ?? null,
          authorPhotoURL: message?.authorPhotoURL ?? null,
          createdAt: message?.createdAt ?? null,
          messageId: targetId,
          text: message?.text ?? null,
        },
        room: safeRoomSnapshot(roomSnapshot),
      }
    } else if (targetType === 'user' || targetType === 'nickname') {
      if (targetId === actorId) {
        throw new HttpsError('invalid-argument', 'Нельзя пожаловаться на себя.')
      }
      const [targetMemberSnapshot, profileSnapshot] = await Promise.all([
        transaction.get(memberRef(roomId, targetId)),
        transaction.get(db.doc(`users/${targetId}`)),
      ])
      if (
        !targetMemberSnapshot.exists ||
        targetMemberSnapshot.data()?.status !== 'active' ||
        !profileSnapshot.exists
      ) {
        throw new HttpsError('not-found', 'Пользователь не найден в комнате.')
      }
      snapshot = {
        membership: {
          isGuest: targetMemberSnapshot.data()?.isGuest === true,
          role: targetMemberSnapshot.data()?.role ?? null,
        },
        profile: safeProfileSnapshot(profileSnapshot),
        room: safeRoomSnapshot(roomSnapshot),
      }
    } else {
      if (roomSnapshot.data()?.ownerId === actorId) {
        throw new HttpsError(
          'invalid-argument',
          'Владелец не может пожаловаться на собственную комнату.',
        )
      }
      if (targetId !== roomId) {
        throw new HttpsError('invalid-argument', 'Некорректный объект жалобы.')
      }
      snapshot = { room: safeRoomSnapshot(roomSnapshot) }
    }

    transaction.set(reportRef, {
      comment,
      createdAt: now,
      reason,
      reporterId: actorId,
      roomId,
      snapshot,
      status: 'new',
      targetId,
      targetType,
    })
    transaction.set(reportActivityRef, {
      recentReports: [
        ...recentReports.slice(-(MAX_REPORTS_PER_HOUR * 2 - 1)),
        { createdAt: now, duplicateKey },
      ],
    })
  })

  return { ok: true, reportId: reportRef.id }
})

exports.reportRoomMessage = callable(async request =>
  exports.createReport({
    ...request,
    data: {
      ...request.data,
      comment: '',
      targetId: request.data?.messageId,
      targetType: 'message',
    },
  }),
)

const OPERATIONS = {
  advanceRoomVideo: exports.advanceRoomVideo,
  authorizeRealtimeRoom: exports.authorizeRealtimeRoom,
  clearRoomRestriction: exports.clearRoomRestriction,
  createReport: exports.createReport,
  createRoom: exports.createRoom,
  createRoomInvite: exports.createRoomInvite,
  deleteRoomMessage: exports.deleteRoomMessage,
  getRutubeVideo: exports.getRutubeVideo,
  leaveRoom: exports.leaveRoom,
  moderateRoomMember: exports.moderateRoomMember,
  reportRoomMessage: exports.reportRoomMessage,
  revokeRealtimeRoomAccess: exports.revokeRealtimeRoomAccess,
  revokeRoomInvite: exports.revokeRoomInvite,
  searchRutubeVideos: exports.searchRutubeVideos,
  sendRoomMessage: exports.sendRoomMessage,
  setRoomMemberRole: exports.setRoomMemberRole,
  skipRoomVideo: exports.skipRoomVideo,
  transferRoomOwnership: exports.transferRoomOwnership,
  updateRoomAccess: exports.updateRoomAccess,
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
    'Access-Control-Allow-Headers':
      'Content-Type, X-Firebase-AppCheck, X-Firebase-Authorization',
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
  await verifyRequestAppCheck({
    event,
    firebaseApp: getFirebaseApp(),
    service: 'room-management',
  })

  const authorization =
    getHeader(event, 'x-firebase-authorization') ??
    getHeader(event, 'authorization')
  const match = /^Bearer\s+(.+)$/i.exec(authorization ?? '')
  if (!match) {
    throw new HttpsError('unauthenticated', 'Авторизация обязательна.')
  }

  try {
    const decodedToken = await getAuth(getFirebaseApp()).verifyIdToken(
      match[1],
      true,
    )
    return decodedToken
  } catch (error) {
    if (error instanceof HttpsError || error instanceof AppCheckRequestError) {
      throw error
    }
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
      auth: { token: decodedToken, uid: decodedToken.uid },
      data,
    })
    return jsonResponse(200, result, corsHeaders)
  } catch (error) {
    const knownError =
      error instanceof HttpsError || error instanceof AppCheckRequestError
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
