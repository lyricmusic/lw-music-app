export const presetAvatars = [
  { id: 'pulse', name: 'Пульс', url: '/avatars/pulse.svg' },
  { id: 'beat', name: 'Бит', url: '/avatars/beat.svg' },
  { id: 'cherry', name: 'Вишня', url: '/avatars/cherry.svg' },
  { id: 'lime', name: 'Лайм', url: '/avatars/lime.svg' },
  { id: 'night', name: 'Ночь', url: '/avatars/night.svg' },
] as const

export type PresetAvatarId = (typeof presetAvatars)[number]['id']

export function getPresetAvatar(presetId: PresetAvatarId) {
  return presetAvatars.find(avatar => avatar.id === presetId)
}
