import { callRoomManagementApi } from '@/shared/api/firebase'

interface SendRoomMessageInput {
  roomId: string
  text: string
}

export const ROOM_MESSAGE_MAX_LENGTH = 1000
export const GUEST_MESSAGE_MIN_INTERVAL_SECONDS = 5

export class RoomSlowModeError extends Error {
  constructor(readonly retryAfterSeconds: number) {
    super(`Подождите ещё ${retryAfterSeconds} сек. перед следующим сообщением.`)
    this.name = 'RoomSlowModeError'
  }
}

export async function sendRoomMessage({ roomId, text }: SendRoomMessageInput) {
  const normalizedText = text.trim()
  if (!roomId) throw new Error('Комната не найдена.')
  if (!normalizedText) return
  if (normalizedText.length > ROOM_MESSAGE_MAX_LENGTH) {
    throw new Error(
      `Сообщение не может быть длиннее ${ROOM_MESSAGE_MAX_LENGTH} символов.`,
    )
  }

  await callRoomManagementApi('sendRoomMessage', {
    roomId,
    text: normalizedText,
  })
}
