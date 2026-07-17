import { auth, db } from '@/shared/api/firebase'
import {
  collection,
  doc,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
} from 'firebase/firestore'

interface CreateRoomInviteInput {
  expiresAt: Date
  maxUses?: number
  roomId: string
}

export async function createRoomInvite({
  expiresAt,
  maxUses = 1,
  roomId,
}: CreateRoomInviteInput) {
  const user = auth.currentUser
  if (!user) throw new Error('Чтобы создать приглашение, авторизуйтесь.')
  if (!Number.isInteger(maxUses) || maxUses < 1 || maxUses > 100) {
    throw new Error('Количество использований должно быть от 1 до 100.')
  }
  if (expiresAt.getTime() <= Date.now()) {
    throw new Error('Срок действия приглашения должен быть в будущем.')
  }

  const inviteRef = doc(collection(db, 'roomInvites'))
  await setDoc(inviteRef, {
    createdAt: serverTimestamp(),
    createdBy: user.uid,
    expiresAt: Timestamp.fromDate(expiresAt),
    maxUses,
    revokedAt: null,
    roomId,
    uses: 0,
  })

  return inviteRef.id
}

export async function revokeRoomInvite(inviteId: string) {
  const user = auth.currentUser
  if (!user) throw new Error('Чтобы отозвать приглашение, авторизуйтесь.')

  await updateDoc(doc(db, 'roomInvites', inviteId), {
    revokedAt: serverTimestamp(),
  })
}

export function getRoomInviteUrl(roomId: string, inviteId: string) {
  const url = new URL(
    `/rooms/${encodeURIComponent(roomId)}`,
    window.location.origin,
  )
  url.searchParams.set('invite', inviteId)
  return url.toString()
}
