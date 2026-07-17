import { auth, db } from '@/shared/api/firebase'
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

interface AdvanceRoomQueueInput {
  finishedVideoId: string
  roomId: string
}

interface LeaveRoomQueueInput {
  roomId: string
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
  if (!/^[\w-]{11}$/.test(videoId)) {
    throw new Error('Указано некорректное видео YouTube.')
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
  if (!user || !roomId || !/^[\w-]{11}$/.test(finishedVideoId)) return false

  const playbackRef = doc(db, 'rooms', roomId, 'playback', 'current')
  const queueStateRef = doc(db, 'rooms', roomId, 'queueState', 'current')

  return runTransaction(db, async transaction => {
    const [queueStateSnapshot, playbackSnapshot] = await Promise.all([
      transaction.get(queueStateRef),
      transaction.get(playbackRef),
    ])

    if (
      !playbackSnapshot.exists() ||
      playbackSnapshot.data().videoId !== finishedVideoId
    ) {
      return false
    }

    if (!queueStateSnapshot.exists()) {
      transaction.delete(playbackRef)
      return true
    }

    const queueState = parseQueueState(queueStateSnapshot.data())
    if (!queueState) {
      throw new Error('В комнате сохранено некорректное состояние очереди.')
    }

    if (!queueState.activePosition || queueState.itemIds.length === 0) {
      transaction.delete(playbackRef)
      return true
    }

    const currentItemId = queueState.itemIds[0]
    const currentItemRef = doc(db, 'rooms', roomId, 'queue', currentItemId)
    const nextItemId = queueState.itemIds[1] ?? null
    const nextItemRef = nextItemId
      ? doc(db, 'rooms', roomId, 'queue', nextItemId)
      : null

    const [currentItemSnapshot, nextItemSnapshot] = await Promise.all([
      transaction.get(currentItemRef),
      nextItemRef ? transaction.get(nextItemRef) : Promise.resolve(null),
    ])

    if (!currentItemSnapshot.exists()) return false

    const currentItem = currentItemSnapshot.data()
    if (
      currentItem.videoId !== finishedVideoId ||
      typeof currentItem.userId !== 'string'
    ) {
      return false
    }

    if (nextItemRef && !nextItemSnapshot?.exists()) {
      throw new Error('Следующий элемент очереди не найден.')
    }

    const nextItem = nextItemSnapshot?.data()
    const nextPosition = nextItem?.position
    if (
      nextItem &&
      (typeof nextPosition !== 'number' ||
        !Number.isInteger(nextPosition) ||
        nextPosition <= queueState.activePosition)
    ) {
      throw new Error('Следующий элемент очереди содержит некорректные данные.')
    }

    const queueMemberRef = doc(
      db,
      'rooms',
      roomId,
      'queueMembers',
      currentItem.userId,
    )
    const queueMemberSnapshot = await transaction.get(queueMemberRef)
    const currentRevision = Number(playbackSnapshot.data().revision) || 0

    transaction.delete(currentItemRef)
    if (queueMemberSnapshot.exists()) transaction.delete(queueMemberRef)
    transaction.set(queueStateRef, {
      activePosition: nextItem ? nextPosition : null,
      itemIds: queueState.itemIds.slice(1),
      lastPosition: queueState.lastPosition,
      updatedAt: serverTimestamp(),
    })

    if (nextItem) {
      transaction.set(playbackRef, {
        changedAt: serverTimestamp(),
        changedBy: user.uid,
        positionSeconds: 0,
        revision: currentRevision + 1,
        status: 'playing',
        videoId: nextItem.videoId,
      })
    } else {
      transaction.delete(playbackRef)
    }

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
      !/^[\w-]{11}$/.test(nextItem.videoId))
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
