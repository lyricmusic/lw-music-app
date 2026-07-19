import {
  collection,
  doc,
  runTransaction,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore'

import { auth, db } from '@/shared/api/firebase'

interface SendRoomMessageInput {
  authorName: string
  authorPhotoURL: null | string
  roomId: string
  text: string
}

export const ROOM_MESSAGE_MAX_LENGTH = 1000
export const GUEST_MESSAGE_MIN_INTERVAL_SECONDS = 10

export class RoomSlowModeError extends Error {
  constructor(readonly retryAfterSeconds: number) {
    super(`Подождите ещё ${retryAfterSeconds} сек. перед следующим сообщением.`)
    this.name = 'RoomSlowModeError'
  }
}

export async function sendRoomMessage({
  authorName,
  authorPhotoURL,
  roomId,
  text,
}: SendRoomMessageInput) {
  const user = auth.currentUser
  const normalizedText = text.trim()

  if (!user) throw new Error('Чтобы отправить сообщение, войдите в аккаунт.')
  if (!roomId) throw new Error('Комната не найдена.')
  if (!normalizedText) return
  if (normalizedText.length > ROOM_MESSAGE_MAX_LENGTH) {
    throw new Error(
      `Сообщение не может быть длиннее ${ROOM_MESSAGE_MAX_LENGTH} символов.`,
    )
  }

  const messageRef = doc(collection(db, 'rooms', roomId, 'messages'))
  const activityRef = doc(db, 'rooms', roomId, 'messageActivity', user.uid)
  const memberRef = doc(db, 'rooms', roomId, 'members', user.uid)
  const roomRef = doc(db, 'rooms', roomId)

  await runTransaction(db, async transaction => {
    const [roomSnapshot, activitySnapshot, memberSnapshot] = await Promise.all([
      transaction.get(roomRef),
      transaction.get(activityRef),
      transaction.get(memberRef),
    ])
    if (!roomSnapshot.exists()) throw new Error('Комната не найдена.')

    const slowModeSeconds = roomSnapshot.data().settings?.slowModeSeconds
    const configuredSlowModeSeconds =
      typeof slowModeSeconds === 'number' &&
      Number.isInteger(slowModeSeconds) &&
      slowModeSeconds > 0
        ? slowModeSeconds
        : 0
    const safeSlowModeSeconds =
      memberSnapshot.data()?.isGuest === true
        ? Math.max(
            configuredSlowModeSeconds,
            GUEST_MESSAGE_MIN_INTERVAL_SECONDS,
          )
        : configuredSlowModeSeconds
    const lastMessageAt = activitySnapshot.data()?.lastMessageAt
    if (safeSlowModeSeconds > 0 && lastMessageAt instanceof Timestamp) {
      const retryAfterMilliseconds =
        lastMessageAt.toMillis() + safeSlowModeSeconds * 1000 - Date.now()
      if (retryAfterMilliseconds > 0) {
        throw new RoomSlowModeError(
          Math.max(1, Math.ceil(retryAfterMilliseconds / 1000)),
        )
      }
    }

    transaction.set(messageRef, {
      authorId: user.uid,
      authorName,
      authorPhotoURL,
      createdAt: serverTimestamp(),
      text: normalizedText,
    })
    transaction.set(activityRef, {
      lastMessageAt: serverTimestamp(),
      messageId: messageRef.id,
    })
  })
}
