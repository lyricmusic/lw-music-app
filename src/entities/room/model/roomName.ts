export const ROOM_NAME_MAX_LENGTH = 80

export function normalizeRoomName(name: string) {
  return name.normalize('NFKC').trim().replace(/\s+/gu, ' ')
}

export function getRoomNameKey(name: string) {
  const normalizedName = normalizeRoomName(name).toLocaleLowerCase('ru-RU')

  return `v1:${encodeURIComponent(normalizedName)}`
}
