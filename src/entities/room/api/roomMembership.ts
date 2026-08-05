import { auth, callRoomManagementApi, db } from '@/shared/api/firebase'
import { doc, runTransaction, serverTimestamp } from 'firebase/firestore'

import type { RoomMemberRole } from '../model/types'
const ASSIGNABLE_ROLES: RoomMemberRole[] = ['host', 'member', 'moderator']

export async function leaveRoom(roomId: string) {
  const user = auth.currentUser
  if (!user) throw new Error('Чтобы покинуть комнату, авторизуйтесь.')
  if (!roomId) throw new Error('Комната не найдена.')

  await callRoomManagementApi('leaveRoom', { roomId })
}

export async function kickRoomMember(roomId: string, memberId: string) {
  const user = auth.currentUser
  if (!user) {
    throw new Error('Чтобы выгнать участника, авторизуйтесь.')
  }
  if (!roomId || !memberId) throw new Error('Участник комнаты не найден.')
  if (user.uid === memberId) throw new Error('Нельзя выгнать себя из комнаты.')

  await callRoomManagementApi('moderateRoomMember', {
    action: 'kick',
    memberId,
    roomId,
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

  await callRoomManagementApi('setRoomMemberRole', {
    memberId,
    role,
    roomId,
  })
}

export async function transferRoomOwnership(roomId: string, memberId: string) {
  const user = auth.currentUser
  if (!user) throw new Error('Чтобы передать комнату, авторизуйтесь.')
  if (user.uid === memberId) throw new Error('Вы уже владелец этой комнаты.')

  await callRoomManagementApi('transferRoomOwnership', { memberId, roomId })
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
      userId: user.uid,
    })
  })
}
