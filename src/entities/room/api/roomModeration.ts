import { auth, db } from '@/shared/api/firebase'
import {
  deleteDoc,
  doc,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
} from 'firebase/firestore'

interface ModerateRoomUserInput {
  expiresAt?: Date | null
  reason: string
  roomId: string
  userId: string
}

function normalizeReason(reason: string) {
  const normalizedReason = reason.trim()
  if (!normalizedReason) throw new Error('Укажите причину.')
  if (normalizedReason.length > 500) {
    throw new Error('Причина не может быть длиннее 500 символов.')
  }
  return normalizedReason
}

function toExpiresAt(expiresAt?: Date | null) {
  if (!expiresAt) return null
  if (expiresAt.getTime() <= Date.now()) {
    throw new Error('Срок действия должен быть в будущем.')
  }
  return Timestamp.fromDate(expiresAt)
}

export async function banRoomUser({
  expiresAt,
  reason,
  roomId,
  userId,
}: ModerateRoomUserInput) {
  const user = auth.currentUser
  if (!user) throw new Error('Чтобы заблокировать участника, авторизуйтесь.')
  if (user.uid === userId) throw new Error('Нельзя заблокировать себя.')

  const banRef = doc(db, 'rooms', roomId, 'bans', userId)
  const memberRef = doc(db, 'rooms', roomId, 'members', userId)
  await runTransaction(db, async transaction => {
    const memberSnapshot = await transaction.get(memberRef)
    if (memberSnapshot.data()?.role === 'owner') {
      throw new Error('Владельца комнаты нельзя заблокировать.')
    }

    transaction.set(banRef, {
      bannedBy: user.uid,
      createdAt: serverTimestamp(),
      expiresAt: toExpiresAt(expiresAt),
      reason: normalizeReason(reason),
    })
    if (memberSnapshot.exists() && memberSnapshot.data().status === 'active') {
      transaction.update(memberRef, { status: 'left' })
    }
  })
}

export async function unbanRoomUser(roomId: string, userId: string) {
  const user = auth.currentUser
  if (!user) throw new Error('Чтобы снять блокировку, авторизуйтесь.')
  await deleteDoc(doc(db, 'rooms', roomId, 'bans', userId))
}

export async function muteRoomUser({
  expiresAt,
  reason,
  roomId,
  userId,
}: ModerateRoomUserInput) {
  const user = auth.currentUser
  if (!user) throw new Error('Чтобы ограничить участника, авторизуйтесь.')
  if (user.uid === userId) throw new Error('Нельзя ограничить себя.')

  await setDoc(doc(db, 'rooms', roomId, 'mutes', userId), {
    expiresAt: toExpiresAt(expiresAt),
    mutedBy: user.uid,
    reason: normalizeReason(reason),
  })
}

export async function unmuteRoomUser(roomId: string, userId: string) {
  const user = auth.currentUser
  if (!user) throw new Error('Чтобы снять ограничение, авторизуйтесь.')
  await deleteDoc(doc(db, 'rooms', roomId, 'mutes', userId))
}
