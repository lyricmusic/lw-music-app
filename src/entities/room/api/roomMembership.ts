import { auth, db } from '@/shared/api/firebase'
import { doc, runTransaction, serverTimestamp } from 'firebase/firestore'

import type { RoomMemberRole } from '../model/types'
import { removeRoomQueueMemberInTransaction } from './roomQueue'

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

export async function kickRoomMember(roomId: string, memberId: string) {
  const user = auth.currentUser
  if (!user) {
    throw new Error('Чтобы выгнать участника, авторизуйтесь.')
  }
  if (!roomId || !memberId) throw new Error('Участник комнаты не найден.')
  if (user.uid === memberId) throw new Error('Нельзя выгнать себя из комнаты.')

  const actorRef = doc(db, 'rooms', roomId, 'members', user.uid)
  const memberRef = doc(db, 'rooms', roomId, 'members', memberId)

  await runTransaction(db, async transaction => {
    const [actorSnapshot, memberSnapshot] = await Promise.all([
      transaction.get(actorRef),
      transaction.get(memberRef),
    ])

    if (!actorSnapshot.exists() || actorSnapshot.data().status !== 'active') {
      throw new Error('У вас больше нет доступа к управлению этой комнатой.')
    }
    if (!memberSnapshot.exists() || memberSnapshot.data().status !== 'active') {
      throw new Error('Участник уже покинул комнату.')
    }

    const actorRole = actorSnapshot.data().role
    const memberRole = memberSnapshot.data().role
    const canKick =
      (actorRole === 'owner' && memberRole !== 'owner') ||
      ((actorRole === 'host' || actorRole === 'moderator') &&
        memberRole === 'member')

    if (!canKick) {
      throw new Error('Недостаточно прав, чтобы выгнать этого участника.')
    }

    await removeRoomQueueMemberInTransaction(transaction, {
      changedBy: user.uid,
      memberId,
      roomId,
      strict: false,
    })
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
