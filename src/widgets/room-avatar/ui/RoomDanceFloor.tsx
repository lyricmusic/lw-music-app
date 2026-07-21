import { useState } from 'react'

import {
  defaultUserCharacter,
  getCharacterAccent,
  getCharacterSpriteUrl,
  resolveUserCharacter,
  type CharacterAccentId,
  type UserCharacter,
} from '@/entities/session'
import { Box, Button, Typography } from '@mui/material'

type DanceFloorMode = 'auto' | 'idle' | 'side-step'

interface RoomDanceFloorProps {
  character?: null | UserCharacter
  collapsed: boolean
  displayName?: null | string
  isMusicPlaying: boolean
  onCollapsedChange: (collapsed: boolean) => void
}

interface Dancer {
  accentColor: CharacterAccentId
  animationDelaySeconds: number
  id: string
  name: string
}

const TEST_DANCERS: Dancer[] = [
  {
    accentColor: 'cyan',
    animationDelaySeconds: -0.45,
    id: 'nova',
    name: 'Нова',
  },
  {
    accentColor: 'pink',
    animationDelaySeconds: -1.05,
    id: 'luna',
    name: 'Луна',
  },
  {
    accentColor: 'lime',
    animationDelaySeconds: -1.5,
    id: 'beat',
    name: 'Бит',
  },
  {
    accentColor: 'violet',
    animationDelaySeconds: -0.8,
    id: 'vega',
    name: 'Вега',
  },
  {
    accentColor: 'cyan',
    animationDelaySeconds: -1.7,
    id: 'riff',
    name: 'Рифф',
  },
  {
    accentColor: 'pink',
    animationDelaySeconds: -0.2,
    id: 'echo',
    name: 'Эхо',
  },
  {
    accentColor: 'lime',
    animationDelaySeconds: -1.25,
    id: 'pixel',
    name: 'Пиксель',
  },
  {
    accentColor: 'violet',
    animationDelaySeconds: -1.9,
    id: 'pulse',
    name: 'Пульс',
  },
  {
    accentColor: 'cyan',
    animationDelaySeconds: -0.65,
    id: 'astra',
    name: 'Астра',
  },
  {
    accentColor: 'pink',
    animationDelaySeconds: -1.35,
    id: 'groove',
    name: 'Грув',
  },
  {
    accentColor: 'lime',
    animationDelaySeconds: -0.95,
    id: 'neon',
    name: 'Неон',
  },
  {
    accentColor: 'violet',
    animationDelaySeconds: -1.6,
    id: 'bass',
    name: 'Бас',
  },
]

const MODE_LABELS: Record<DanceFloorMode, string> = {
  auto: 'Авто',
  idle: 'Стоять',
  'side-step': 'Шаги',
}

function DanceFloorDancer({
  dancer,
  isDancing,
}: {
  dancer: Dancer
  isDancing: boolean
}) {
  const character = {
    ...defaultUserCharacter,
    accentColor: dancer.accentColor,
  }
  const accent = getCharacterAccent(character.accentColor)

  return (
    <Box
      aria-label={`${dancer.name}. ${isDancing ? 'Танцует' : 'Стоит спокойно'}.`}
      className="room-dance-floor__dancer"
      component="li"
    >
      <Box aria-hidden="true" className="room-dance-floor__avatar-wrap">
        <Box
          className="room-dance-floor__sprite"
          key={isDancing ? 'side-step' : 'idle'}
          sx={{
            animationDelay: `${dancer.animationDelaySeconds}s`,
            backgroundImage: `url(${getCharacterSpriteUrl(character, isDancing)})`,
            filter: `${accent.filter} drop-shadow(0 0 6px ${accent.color})`,
          }}
        />
      </Box>
    </Box>
  )
}

export function RoomDanceFloor({
  character,
  collapsed,
  displayName,
  isMusicPlaying,
  onCollapsedChange,
}: RoomDanceFloorProps) {
  const userCharacter = resolveUserCharacter(character)
  const userAccent = getCharacterAccent(userCharacter.accentColor)
  const [mode, setMode] = useState<DanceFloorMode>('auto')
  const isDancing = mode === 'auto' ? isMusicPlaying : mode === 'side-step'
  const statusLabel =
    mode === 'auto'
      ? isMusicPlaying
        ? 'Авто · музыка играет'
        : 'Авто · ждём музыку'
      : mode === 'side-step'
        ? 'Локально · шаги'
        : 'Локально · ожидание'
  const djName = displayName?.trim() || 'Ваш персонаж'

  if (collapsed) {
    return (
      <Box
        className="room-dance-floor room-dance-floor--collapsed"
        component="section"
        sx={{ borderColor: userAccent.color }}
      >
        <Box aria-hidden="true" className="room-dance-floor__collapsed-avatar">
          <Box
            className="room-dance-floor__sprite room-dance-floor__sprite--collapsed"
            key={isDancing ? 'side-step' : 'idle'}
            sx={{
              backgroundImage: `url(${getCharacterSpriteUrl(userCharacter, isDancing)})`,
              filter: `${userAccent.filter} drop-shadow(0 0 5px ${userAccent.color})`,
            }}
          />
        </Box>
        <Box className="min-w-0 flex-1">
          <Typography
            className="truncate text-sm font-bold"
            sx={{ color: '#F8F3FF' }}
          >
            Танцплощадка
          </Typography>
          <Typography
            className="truncate text-[11px]"
            sx={{ color: '#CDBCE2' }}
          >
            {statusLabel}
          </Typography>
        </Box>
        <Button
          aria-label="Развернуть танцплощадку"
          onClick={() => onCollapsedChange(false)}
          size="small"
          sx={{ minWidth: 0, padding: '7px 9px' }}
          variant="outlined"
        >
          Развернуть
        </Button>
      </Box>
    )
  }

  return (
    <Box
      className="room-dance-floor"
      component="section"
      sx={{ borderColor: userAccent.color }}
    >
      <Box className="room-dance-floor__header">
        <Box className="min-w-0">
          <Typography
            className="truncate text-sm font-bold sm:text-base"
            component="h2"
            sx={{ color: '#F8F3FF' }}
          >
            Танцплощадка
          </Typography>
          <Typography
            className="truncate text-[11px]"
            sx={{ color: '#CDBCE2' }}
          >
            {statusLabel}
          </Typography>
        </Box>
        <Button
          aria-label="Свернуть танцплощадку"
          onClick={() => onCollapsedChange(true)}
          size="small"
          sx={{ minWidth: 0, padding: '6px 8px' }}
          variant="outlined"
        >
          Свернуть
        </Button>
      </Box>

      <Box aria-label="Режим танца" className="room-dance-floor__controls">
        {(Object.keys(MODE_LABELS) as DanceFloorMode[]).map(modeId => (
          <Button
            aria-pressed={mode === modeId}
            key={modeId}
            onClick={() => setMode(modeId)}
            size="small"
            sx={{
              backgroundColor: mode === modeId ? '#5D3A82' : '#32204B',
              borderColor: mode === modeId ? userAccent.color : '#4A2B6D',
              color: '#F8F3FF',
              minWidth: 0,
              padding: '5px 9px',
            }}
            variant="outlined"
          >
            {MODE_LABELS[modeId]}
          </Button>
        ))}
      </Box>

      <Box className="room-dance-floor__scene">
        <Box aria-hidden="true" className="room-dance-floor__lights" />
        <Box
          aria-label="Тестовые персонажи в толпе"
          className="room-dance-floor__track"
          component="ul"
        >
          {TEST_DANCERS.map(dancer => (
            <DanceFloorDancer
              dancer={dancer}
              isDancing={isDancing}
              key={dancer.id}
            />
          ))}
        </Box>

        <Box
          aria-label={`DJ ${djName}. ${isDancing ? 'Музыка играет' : 'Ожидает музыку'}.`}
          className="room-dance-floor__dj"
          role="img"
        >
          <Box
            aria-hidden="true"
            className="room-dance-floor__dj-sprite"
            key={isDancing ? 'side-step' : 'idle'}
            sx={{
              backgroundImage: `url(${getCharacterSpriteUrl(userCharacter, isDancing)})`,
              filter: `${userAccent.filter} drop-shadow(0 0 8px ${userAccent.color})`,
            }}
          />
          <Box aria-hidden="true" className="room-dance-floor__dj-booth">
            <Box className="room-dance-floor__deck" />
            <Box className="room-dance-floor__mixer" />
            <Box className="room-dance-floor__deck" />
          </Box>
          <Typography
            className="max-w-[150px] truncate text-[10px] font-bold leading-3"
            sx={{ color: userAccent.color }}
          >
            DJ {djName}
          </Typography>
        </Box>
      </Box>
    </Box>
  )
}
