export const characterAppearanceOptions = [
  { available: true, id: 'base', label: 'Базовый' },
  { available: false, id: 'neon', label: 'Неоновый' },
  { available: false, id: 'club', label: 'Клубный' },
] as const

export const characterAccentOptions = [
  {
    color: '#B88CFF',
    filter: 'none',
    glow: 'rgba(184, 140, 255, 0.42)',
    id: 'violet',
    label: 'Фиолетовый',
  },
  {
    color: '#76E6FF',
    filter: 'hue-rotate(-90deg) saturate(1.08)',
    glow: 'rgba(118, 230, 255, 0.38)',
    id: 'cyan',
    label: 'Бирюзовый',
  },
  {
    color: '#FF84CE',
    filter: 'hue-rotate(30deg) saturate(1.12)',
    glow: 'rgba(255, 132, 206, 0.38)',
    id: 'pink',
    label: 'Розовый',
  },
  {
    color: '#9BEF9B',
    filter: 'hue-rotate(-150deg) saturate(1.08)',
    glow: 'rgba(155, 239, 155, 0.34)',
    id: 'lime',
    label: 'Лаймовый',
  },
] as const

export const characterDanceOptions = [
  { available: true, id: 'side-step', label: 'Шаги' },
  { available: false, id: 'groove', label: 'Покачивание' },
  { available: false, id: 'jump', label: 'Прыжки' },
  { available: false, id: 'arms-up', label: 'Руки вверх' },
] as const

export type CharacterAppearanceId =
  (typeof characterAppearanceOptions)[number]['id']
export type CharacterAccentId = (typeof characterAccentOptions)[number]['id']
export type CharacterDanceId = (typeof characterDanceOptions)[number]['id']

export interface UserCharacter {
  accentColor: CharacterAccentId
  appearanceId: CharacterAppearanceId
  danceId: CharacterDanceId
}

export const defaultUserCharacter: UserCharacter = {
  accentColor: 'violet',
  appearanceId: 'base',
  danceId: 'side-step',
}

function isOptionId<T extends readonly { id: string }[]>(
  options: T,
  value: unknown,
): value is T[number]['id'] {
  return options.some(option => option.id === value)
}

export function resolveUserCharacter(value: unknown): UserCharacter {
  if (!value || typeof value !== 'object') return defaultUserCharacter

  const candidate = value as Partial<Record<keyof UserCharacter, unknown>>
  const appearanceId = isOptionId(
    characterAppearanceOptions,
    candidate.appearanceId,
  )
    ? candidate.appearanceId
    : defaultUserCharacter.appearanceId
  const accentColor = isOptionId(characterAccentOptions, candidate.accentColor)
    ? candidate.accentColor
    : defaultUserCharacter.accentColor
  const danceId = isOptionId(characterDanceOptions, candidate.danceId)
    ? candidate.danceId
    : defaultUserCharacter.danceId

  return { accentColor, appearanceId, danceId }
}

export function getCharacterAccent(accentColor: CharacterAccentId) {
  return (
    characterAccentOptions.find(option => option.id === accentColor) ??
    characterAccentOptions[0]
  )
}

export function getCharacterSpriteUrl(
  character: UserCharacter,
  isPlaying: boolean,
) {
  if (!isPlaying) return '/avatars/animated/base-idle-v1.webp'

  // Only side-step has a production sprite today. Planned choices stay
  // disabled in the editor until their matching WebP files are ready.
  if (character.danceId === 'side-step') {
    return '/avatars/animated/base-side-step-v1.webp'
  }

  return '/avatars/animated/base-idle-v1.webp'
}
