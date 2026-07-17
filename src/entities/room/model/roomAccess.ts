import type { RoomSettings, RoomStatus, RoomVisibility } from './types'

export const DEFAULT_ROOM_VISIBILITY: RoomVisibility = 'public'
export const DEFAULT_ROOM_STATUS: RoomStatus = 'active'
export const DEFAULT_ROOM_SETTINGS: RoomSettings = {
  allowGuestChat: true,
  allowGuestQueue: true,
  slowModeSeconds: 0,
}

export function parseRoomVisibility(value: unknown): RoomVisibility {
  return value === 'private' || value === 'unlisted' || value === 'public'
    ? value
    : DEFAULT_ROOM_VISIBILITY
}

export function parseRoomStatus(value: unknown): RoomStatus {
  return value === 'archived' || value === 'active'
    ? value
    : DEFAULT_ROOM_STATUS
}

export function parseRoomSettings(value: unknown): RoomSettings {
  if (!value || typeof value !== 'object') {
    return { ...DEFAULT_ROOM_SETTINGS }
  }

  const settings = value as Record<string, unknown>
  const slowModeSeconds = settings.slowModeSeconds

  return {
    allowGuestChat:
      typeof settings.allowGuestChat === 'boolean'
        ? settings.allowGuestChat
        : DEFAULT_ROOM_SETTINGS.allowGuestChat,
    allowGuestQueue:
      typeof settings.allowGuestQueue === 'boolean'
        ? settings.allowGuestQueue
        : DEFAULT_ROOM_SETTINGS.allowGuestQueue,
    slowModeSeconds:
      typeof slowModeSeconds === 'number' &&
      Number.isInteger(slowModeSeconds) &&
      slowModeSeconds >= 0
        ? slowModeSeconds
        : DEFAULT_ROOM_SETTINGS.slowModeSeconds,
  }
}
