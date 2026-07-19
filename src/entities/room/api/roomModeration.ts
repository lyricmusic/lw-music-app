import { auth, callRoomManagementApi } from '@/shared/api/firebase'

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

async function moderateRoomUser(
  action: 'ban' | 'mute',
  { expiresAt, reason, roomId, userId }: ModerateRoomUserInput,
) {
  const user = auth.currentUser
  if (!user) throw new Error('Чтобы модерировать комнату, авторизуйтесь.')
  if (user.uid === userId) throw new Error('Нельзя применить действие к себе.')

  await callRoomManagementApi('moderateRoomMember', {
    action,
    expiresAtMillis: expiresAt?.getTime() ?? null,
    memberId: userId,
    reason: normalizeReason(reason),
    roomId,
  })
}

export function banRoomUser(input: ModerateRoomUserInput) {
  return moderateRoomUser('ban', input)
}

export function muteRoomUser(input: ModerateRoomUserInput) {
  return moderateRoomUser('mute', input)
}

async function clearRoomRestriction(
  action: 'unban' | 'unmute',
  roomId: string,
  userId: string,
) {
  if (!auth.currentUser) {
    throw new Error('Чтобы изменить ограничения, авторизуйтесь.')
  }
  await callRoomManagementApi('clearRoomRestriction', {
    action,
    memberId: userId,
    roomId,
  })
}

export function unbanRoomUser(roomId: string, userId: string) {
  return clearRoomRestriction('unban', roomId, userId)
}

export function unmuteRoomUser(roomId: string, userId: string) {
  return clearRoomRestriction('unmute', roomId, userId)
}
