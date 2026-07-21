import { auth, callRoomManagementApi, db } from '@/shared/api/firebase'
import {
  doc,
  runTransaction,
  serverTimestamp,
  type Transaction,
} from 'firebase/firestore'

import { ROOM_QUEUE_LIMIT } from './useRoomQueue'

interface EnqueueRoomVideoInput {
  displayName: string
  photoURL: null | string
  roomId: string
  videoId: string
}

interface SearchRoomRutubeVideosInput {
  musicOnly: boolean
  query: string
  roomId: string
}

export interface RutubeSearchResult {
  channelTitle: string
  thumbnailUrl: string
  title: string
  videoId: string
}

interface AdvanceRoomQueueInput {
  finishedVideoId: string
  roomId: string
}

interface LeaveRoomQueueInput {
  roomId: string
}

interface SetRoomPlaybackStatusInput {
  positionSeconds: number
  roomId: string
  status: 'paused' | 'playing'
}

interface RemoveRoomQueueMemberInput {
  changedBy: string
  memberId: string
  roomId: string
  strict?: boolean
}

interface QueueState {
  activePosition: number | null
  itemIds: string[]
  lastPosition: number
}

const MAX_QUEUE_POSITION = 999_999_999_999

export async function searchRoomRutubeVideos({
  musicOnly,
  query,
  roomId,
}: SearchRoomRutubeVideosInput) {
  const result = await callRoomManagementApi<{
    items: RutubeSearchResult[]
  }>('searchRutubeVideos', { musicOnly, query, roomId })

  return Array.isArray(result.items) ? result.items.slice(0, 5) : []
}

export async function getRoomRutubeVideo({
  roomId,
  videoId,
}: {
  roomId: string
  videoId: string
}) {
  return callRoomManagementApi<RutubeSearchResult>('getRutubeVideo', {
    roomId,
    videoId,
  })
}

function getQueueItemId(position: number) {
  return String(position).padStart(12, '0')
}

function parseQueueState(data: Record<string, unknown>): QueueState | null {
  const activePosition = data.activePosition
  const storedItemIds = data.itemIds
  const lastPosition = data.lastPosition

  if (
    (activePosition !== null &&
      (typeof activePosition !== 'number' ||
        !Number.isInteger(activePosition) ||
        activePosition <= 0)) ||
    typeof lastPosition !== 'number' ||
    !Number.isInteger(lastPosition) ||
    lastPosition < 0 ||
    lastPosition > MAX_QUEUE_POSITION ||
    (typeof activePosition === 'number' && activePosition > lastPosition)
  ) {
    return null
  }

  const legacyItemCount =
    activePosition === null ? 0 : lastPosition - activePosition + 1
  if (!Array.isArray(storedItemIds) && legacyItemCount > ROOM_QUEUE_LIMIT) {
    return null
  }

  const itemIds = Array.isArray(storedItemIds)
    ? storedItemIds
    : Array.from({ length: legacyItemCount }, (_, index) =>
        getQueueItemId((activePosition ?? 1) + index),
      )

  if (
    itemIds.length > ROOM_QUEUE_LIMIT ||
    itemIds.some(itemId => !/^\d{12}$/.test(itemId)) ||
    new Set(itemIds).size !== itemIds.length ||
    (activePosition === null) !== (itemIds.length === 0) ||
    (activePosition !== null && itemIds[0] !== getQueueItemId(activePosition))
  ) {
    return null
  }

  return { activePosition, itemIds, lastPosition }
}

export async function enqueueRoomVideo({
  displayName,
  photoURL,
  roomId,
  videoId,
}: EnqueueRoomVideoInput) {
  const user = auth.currentUser
  const normalizedDisplayName = displayName.trim()

  if (!user) throw new Error('Чтобы встать в очередь, войдите в аккаунт.')
  if (!roomId) throw new Error('Комната не найдена.')
  if (!normalizedDisplayName) throw new Error('В профиле не указан никнейм.')
  if (!/^[a-f\d]{32}$/i.test(videoId)) {
    throw new Error('Указана некорректная ссылка на видео RUTUBE.')
  }

  const playbackRef = doc(db, 'rooms', roomId, 'playback', 'current')
  const queueStateRef = doc(db, 'rooms', roomId, 'queueState', 'current')
  const queueMemberRef = doc(db, 'rooms', roomId, 'queueMembers', user.uid)

  return runTransaction(db, async transaction => {
    const [queueStateSnapshot, playbackSnapshot, queueMemberSnapshot] =
      await Promise.all([
        transaction.get(queueStateRef),
        transaction.get(playbackRef),
        transaction.get(queueMemberRef),
      ])

    if (queueMemberSnapshot.exists()) {
      throw new Error('Вы уже стоите в очереди.')
    }

    const queueState = queueStateSnapshot.exists()
      ? parseQueueState(queueStateSnapshot.data())
      : { activePosition: null, itemIds: [], lastPosition: 0 }

    if (!queueState) {
      throw new Error('В комнате сохранено некорректное состояние очереди.')
    }

    if (queueState.itemIds.length >= ROOM_QUEUE_LIMIT) {
      throw new Error('В очереди уже нет свободных мест.')
    }

    const nextPosition = queueState.lastPosition + 1
    if (nextPosition > MAX_QUEUE_POSITION) {
      throw new Error('Очередь комнаты переполнена.')
    }

    const queueItemId = getQueueItemId(nextPosition)
    const queueItemRef = doc(db, 'rooms', roomId, 'queue', queueItemId)
    const queueItemSnapshot = await transaction.get(queueItemRef)

    if (queueItemSnapshot.exists()) {
      throw new Error('Не удалось определить позицию в очереди.')
    }

    const becomesActive = queueState.activePosition === null
    const currentRevision = playbackSnapshot.exists()
      ? Number(playbackSnapshot.data().revision) || 0
      : 0

    transaction.set(queueItemRef, {
      createdAt: serverTimestamp(),
      displayName: normalizedDisplayName,
      photoURL,
      position: nextPosition,
      userId: user.uid,
      videoId,
    })
    transaction.set(queueMemberRef, {
      createdAt: serverTimestamp(),
      itemId: queueItemId,
      userId: user.uid,
    })
    transaction.set(queueStateRef, {
      activePosition: becomesActive ? nextPosition : queueState.activePosition,
      itemIds: [...queueState.itemIds, queueItemId],
      lastPosition: nextPosition,
      updatedAt: serverTimestamp(),
    })

    if (becomesActive) {
      transaction.set(playbackRef, {
        changedAt: serverTimestamp(),
        changedBy: user.uid,
        positionSeconds: 0,
        revision: currentRevision + 1,
        status: 'playing',
        videoId,
      })
    }

    return { isActive: becomesActive }
  })
}

export async function advanceRoomQueue({
  finishedVideoId,
  roomId,
}: AdvanceRoomQueueInput) {
  const user = auth.currentUser
  if (
    !user ||
    !roomId ||
    !/^([-_A-Za-z0-9]{11}|[a-f\d]{32})$/.test(finishedVideoId)
  ) {
    return false
  }

  const result = await callRoomManagementApi<{ advanced: boolean }>(
    'advanceRoomVideo',
    { finishedVideoId, roomId },
  )
  return result.advanced
}

export async function skipRoomVideo(roomId: string) {
  if (!auth.currentUser) {
    throw new Error('Чтобы пропустить видео, авторизуйтесь.')
  }
  await callRoomManagementApi('skipRoomVideo', { roomId })
}

export async function setRoomPlaybackStatus({
  positionSeconds,
  roomId,
  status,
}: SetRoomPlaybackStatusInput) {
  const user = auth.currentUser
  if (!user) throw new Error('Чтобы управлять плеером, авторизуйтесь.')
  if (!Number.isFinite(positionSeconds) || positionSeconds < 0) {
    throw new Error('Некорректная позиция воспроизведения.')
  }

  const playbackRef = doc(db, 'rooms', roomId, 'playback', 'current')
  return runTransaction(db, async transaction => {
    const playbackSnapshot = await transaction.get(playbackRef)
    if (!playbackSnapshot.exists()) return false

    const playback = playbackSnapshot.data()
    const revision = Number(playback.revision) || 0
    if (typeof playback.videoId !== 'string') return false

    transaction.set(playbackRef, {
      changedAt: serverTimestamp(),
      changedBy: user.uid,
      positionSeconds: Math.min(86_400, positionSeconds),
      revision: revision + 1,
      status,
      videoId: playback.videoId,
    })
    return true
  })
}

export async function removeRoomQueueMemberInTransaction(
  transaction: Transaction,
  { changedBy, memberId, roomId, strict = true }: RemoveRoomQueueMemberInput,
) {
  const playbackRef = doc(db, 'rooms', roomId, 'playback', 'current')
  const queueStateRef = doc(db, 'rooms', roomId, 'queueState', 'current')
  const queueMemberRef = doc(db, 'rooms', roomId, 'queueMembers', memberId)

  const [queueStateSnapshot, playbackSnapshot, queueMemberSnapshot] =
    await Promise.all([
      transaction.get(queueStateRef),
      transaction.get(playbackRef),
      transaction.get(queueMemberRef),
    ])

  if (!queueMemberSnapshot.exists()) {
    return { removed: false, wasActive: false }
  }

  if (!queueStateSnapshot.exists()) {
    if (strict) {
      throw new Error('Состояние очереди не найдено.')
    }
    return { removed: false, wasActive: false }
  }

  const queueState = parseQueueState(queueStateSnapshot.data())
  const queueItemId = queueMemberSnapshot.data().itemId

  if (!queueState) {
    if (strict) {
      throw new Error('В комнате сохранено некорректное состояние очереди.')
    }
    return { removed: false, wasActive: false }
  }
  if (
    typeof queueItemId !== 'string' ||
    !queueState.itemIds.includes(queueItemId)
  ) {
    if (strict) {
      throw new Error('Не удалось найти вашу позицию в очереди.')
    }
    return { removed: false, wasActive: false }
  }

  const queueItemRef = doc(db, 'rooms', roomId, 'queue', queueItemId)
  const wasActive = queueState.itemIds[0] === queueItemId
  const nextItemId = wasActive ? (queueState.itemIds[1] ?? null) : null
  const nextItemRef = nextItemId
    ? doc(db, 'rooms', roomId, 'queue', nextItemId)
    : null
  const [queueItemSnapshot, nextItemSnapshot] = await Promise.all([
    transaction.get(queueItemRef),
    nextItemRef ? transaction.get(nextItemRef) : Promise.resolve(null),
  ])

  if (
    !queueItemSnapshot.exists() ||
    queueItemSnapshot.data().userId !== memberId
  ) {
    if (strict) {
      throw new Error('Не удалось найти вашу запись в очереди.')
    }
    return { removed: false, wasActive: false }
  }
  if (nextItemRef && !nextItemSnapshot?.exists()) {
    if (strict) {
      throw new Error('Следующий элемент очереди не найден.')
    }
    return { removed: false, wasActive: false }
  }

  const nextItem = nextItemSnapshot?.data()
  const nextPosition = nextItem?.position
  if (
    nextItem &&
    (typeof nextPosition !== 'number' ||
      !Number.isInteger(nextPosition) ||
      nextPosition <= (queueState.activePosition ?? 0) ||
      typeof nextItem.videoId !== 'string' ||
      !/^([-_A-Za-z0-9]{11}|[a-f\d]{32})$/.test(nextItem.videoId))
  ) {
    if (strict) {
      throw new Error('Следующий элемент очереди содержит некорректные данные.')
    }
    return { removed: false, wasActive: false }
  }

  transaction.delete(queueItemRef)
  transaction.delete(queueMemberRef)
  transaction.set(queueStateRef, {
    activePosition: wasActive
      ? nextItem
        ? nextPosition
        : null
      : queueState.activePosition,
    itemIds: queueState.itemIds.filter(itemId => itemId !== queueItemId),
    lastPosition: queueState.lastPosition,
    updatedAt: serverTimestamp(),
  })

  if (wasActive) {
    if (nextItem) {
      const currentRevision = playbackSnapshot.exists()
        ? Number(playbackSnapshot.data().revision) || 0
        : 0

      transaction.set(playbackRef, {
        changedAt: serverTimestamp(),
        changedBy,
        positionSeconds: 0,
        revision: currentRevision + 1,
        status: 'playing',
        videoId: nextItem.videoId,
      })
    } else if (playbackSnapshot.exists()) {
      transaction.delete(playbackRef)
    }
  }

  return { removed: true, wasActive }
}

export async function leaveRoomQueue({ roomId }: LeaveRoomQueueInput) {
  const user = auth.currentUser

  if (!user) throw new Error('Чтобы покинуть очередь, войдите в аккаунт.')
  if (!roomId) throw new Error('Комната не найдена.')

  return runTransaction(db, transaction => {
    return removeRoomQueueMemberInTransaction(transaction, {
      changedBy: user.uid,
      memberId: user.uid,
      roomId,
    })
  })
}
