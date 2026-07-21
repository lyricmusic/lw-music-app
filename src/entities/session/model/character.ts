export const characterGenderOptions = [
  { id: 'male', label: 'Мужской' },
  { id: 'female', label: 'Женский' },
] as const

export const characterAppearanceOptions = [
  { available: true, id: 'base', label: 'Базовая' },
  { available: false, id: 'neon', label: 'Неоновая' },
  { available: false, id: 'club', label: 'Клубная' },
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
export type CharacterGenderId = (typeof characterGenderOptions)[number]['id']

export interface UserCharacter {
  accentColor: CharacterAccentId
  appearanceId: CharacterAppearanceId
  danceId: CharacterDanceId
  genderId: CharacterGenderId
}

export const defaultUserCharacter: UserCharacter = {
  accentColor: 'violet',
  appearanceId: 'base',
  danceId: 'side-step',
  genderId: 'male',
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
  const isLegacyFemale =
    candidate.genderId === undefined && candidate.appearanceId === 'female'
  const genderId = isLegacyFemale
    ? 'female'
    : isOptionId(characterGenderOptions, candidate.genderId)
      ? candidate.genderId
      : defaultUserCharacter.genderId
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

  return { accentColor, appearanceId, danceId, genderId }
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
  const spritePrefix = character.genderId === 'female' ? 'female' : 'base'

  if (!isPlaying) return `/avatars/animated/${spritePrefix}-idle-v1.webp`

  // Only side-step has a production sprite today. Planned choices stay
  // disabled in the editor until their matching WebP files are ready.
  if (character.danceId === 'side-step') {
    return `/avatars/animated/${spritePrefix}-side-step-v1.webp`
  }

  return `/avatars/animated/${spritePrefix}-idle-v1.webp`
}
