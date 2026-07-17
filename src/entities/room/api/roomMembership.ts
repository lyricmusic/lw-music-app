import { auth, db } from '@/shared/api/firebase'
import { doc, runTransaction, serverTimestamp } from 'firebase/firestore'

import type { RoomMemberRole } from '../model/types'

const ASSIGNABLE_ROLES: RoomMemberRole[] = ['host', 'member', 'moderator']

export async function leaveRoom(roomId: string) {
  const user = auth.currentUser
  if (!user) throw new Error('Чтобы покинуть комнату, авторизуйтесь.')

  const memberRef = doc(db, 'rooms', roomId, 'members', user.uid)
  await runTransaction(db, async transaction => {
    const memberSnapshot = await transaction.get(memberRef)
    if (!memberSnapshot.exists() || memberSnapshot.data().status !== 'active') {
      return
    }
    if (memberSnapshot.data().role === 'owner') {
      throw new Error('Владелец не может покинуть комнату без передачи прав.')
    }

    transaction.update(memberRef, { status: 'left' })
  })
}

export async function setRoomMemberRole(
  roomId: string,
  memberId: string,
  role: RoomMemberRole,
) {
  const user = auth.currentUser
  if (!user) throw new Error('Чтобы изменить роль, авторизуйтесь.')
  if (!ASSIGNABLE_ROLES.includes(role)) {
    throw new Error('Эту роль нельзя назначить участнику.')
  }

  const memberRef = doc(db, 'rooms', roomId, 'members', memberId)
  await runTransaction(db, async transaction => {
    const memberSnapshot = await transaction.get(memberRef)
    if (!memberSnapshot.exists()) throw new Error('Участник не найден.')
    if (memberSnapshot.data().role === 'owner') {
      throw new Error('Роль владельца нельзя изменить.')
    }

    transaction.update(memberRef, { role })
  })
}

export async function restorePublicRoomMembership(roomId: string) {
  const user = auth.currentUser
  if (!user) throw new Error('Чтобы вернуться в комнату, авторизуйтесь.')

  const memberRef = doc(db, 'rooms', roomId, 'members', user.uid)
  await runTransaction(db, async transaction => {
    const memberSnapshot = await transaction.get(memberRef)
    if (!memberSnapshot.exists()) throw new Error('Участник не найден.')
    if (memberSnapshot.data().status === 'active') return

    transaction.set(memberRef, {
      invitedBy: null,
      isGuest: user.isAnonymous,
      joinedAt: serverTimestamp(),
      role: 'member',
      status: 'active',
    })
  })
}
