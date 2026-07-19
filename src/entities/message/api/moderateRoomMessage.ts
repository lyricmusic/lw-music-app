import { createReport } from '@/entities/report'
import { callRoomManagementApi } from '@/shared/api/firebase'

export function deleteRoomMessage(roomId: string, messageId: string) {
  return callRoomManagementApi('deleteRoomMessage', { messageId, roomId })
}

export function reportRoomMessage(
  roomId: string,
  messageId: string,
  reason: string,
) {
  const normalizedReason = reason.trim()
  if (!normalizedReason) throw new Error('Укажите причину жалобы.')
  if (normalizedReason.length > 500) {
    throw new Error('Причина не может быть длиннее 500 символов.')
  }
  return createReport({
    comment: '',
    reason: normalizedReason,
    roomId,
    targetId: messageId,
    targetType: 'message',
  })
}
