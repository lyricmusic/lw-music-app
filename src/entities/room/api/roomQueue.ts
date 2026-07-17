import { auth, db } from '@/shared/api/firebase'
import { doc, runTransaction, serverTimestamp } from 'firebase/firestore'

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

interface QueueState {
  activePosition: number | null
  lastPosition: number
}

const MAX_QUEUE_POSITION = 999_999_999_999

function getQueueItemId(position: number) {
  return String(position).padStart(12, '0')
}

function parseQueueState(data: Record<string, unknown>): QueueState | null {
  const activePosition = data.activePosition
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

  return { activePosition, lastPosition }
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
      : { activePosition: null, lastPosition: 0 }

    if (!queueState) {
      throw new Error('В комнате сохранено некорректное состояние очереди.')
    }

    const queuedItemCount =
      queueState.activePosition === null
        ? 0
        : queueState.lastPosition - queueState.activePosition + 1

    if (queuedItemCount >= ROOM_QUEUE_LIMIT) {
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

    if (!queueState.activePosition) {
      transaction.delete(playbackRef)
      return true
    }

    const currentItemId = getQueueItemId(queueState.activePosition)
    const currentItemRef = doc(db, 'rooms', roomId, 'queue', currentItemId)
    const nextPosition =
      queueState.activePosition < queueState.lastPosition
        ? queueState.activePosition + 1
        : null
    const nextItemRef = nextPosition
      ? doc(db, 'rooms', roomId, 'queue', getQueueItemId(nextPosition))
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
      activePosition: nextPosition,
      lastPosition: queueState.lastPosition,
      updatedAt: serverTimestamp(),
    })

    if (nextItemSnapshot?.exists()) {
      transaction.set(playbackRef, {
        changedAt: serverTimestamp(),
        changedBy: user.uid,
        positionSeconds: 0,
        revision: currentRevision + 1,
        status: 'playing',
        videoId: nextItemSnapshot.data().videoId,
      })
    } else {
      transaction.delete(playbackRef)
    }

    return true
  })
}
