import { db } from '@/shared/api/firebase'
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore'

import type { RoomSettings, RoomStatus, RoomVisibility } from '../model/types'

export async function updateRoomAccess(
  roomId: string,
  input: {
    settings: RoomSettings
    status: RoomStatus
    visibility: RoomVisibility
  },
) {
  if (
    !Number.isInteger(input.settings.slowModeSeconds) ||
    input.settings.slowModeSeconds < 0 ||
    input.settings.slowModeSeconds > 300
  ) {
    throw new Error('Slow mode должен быть от 0 до 300 секунд.')
  }

  await updateDoc(doc(db, 'rooms', roomId), {
    settings: input.settings,
    status: input.status,
    updatedAt: serverTimestamp(),
    visibility: input.visibility,
  })
}
