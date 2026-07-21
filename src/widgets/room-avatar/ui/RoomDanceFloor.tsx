import { useState, type CSSProperties } from 'react'

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
  desktopXPercent: number
  id: string
  name: string
  scale: number
  xPercent: number
  yPercent: number
}

const TEST_DANCERS: Dancer[] = [
  {
    accentColor: 'cyan',
    animationDelaySeconds: -0.45,
    desktopXPercent: 7,
    id: 'nova',
    scale: 0.88,
    xPercent: 8,
    yPercent: 47,
    name: 'Нова',
  },
  {
    accentColor: 'pink',
    animationDelaySeconds: -1.05,
    desktopXPercent: 24,
    id: 'luna',
    scale: 0.98,
    xPercent: 21,
    yPercent: 44,
    name: 'Луна',
  },
  {
    accentColor: 'lime',
    animationDelaySeconds: -1.5,
    desktopXPercent: 75,
    id: 'beat',
    scale: 0.92,
    xPercent: 79,
    yPercent: 45,
    name: 'Бит',
  },
  {
    accentColor: 'violet',
    animationDelaySeconds: -0.8,
    desktopXPercent: 93,
    id: 'vega',
    scale: 0.86,
    xPercent: 92,
    yPercent: 49,
    name: 'Вега',
  },
  {
    accentColor: 'cyan',
    animationDelaySeconds: -1.7,
    desktopXPercent: 14,
    id: 'riff',
    scale: 0.96,
    xPercent: 10,
    yPercent: 68,
    name: 'Рифф',
  },
  {
    accentColor: 'pink',
    animationDelaySeconds: -0.2,
    desktopXPercent: 36,
    id: 'echo',
    scale: 1.04,
    xPercent: 21,
    yPercent: 64,
    name: 'Эхо',
  },
  {
    accentColor: 'lime',
    animationDelaySeconds: -1.25,
    desktopXPercent: 64,
    id: 'pixel',
    scale: 1,
    xPercent: 79,
    yPercent: 66,
    name: 'Пиксель',
  },
  {
    accentColor: 'violet',
    animationDelaySeconds: -1.9,
    desktopXPercent: 86,
    id: 'pulse',
    scale: 0.94,
    xPercent: 90,
    yPercent: 70,
    name: 'Пульс',
  },
  {
    accentColor: 'cyan',
    animationDelaySeconds: -0.65,
    desktopXPercent: 5,
    id: 'astra',
    scale: 1.02,
    xPercent: 7,
    yPercent: 83,
    name: 'Астра',
  },
  {
    accentColor: 'pink',
    animationDelaySeconds: -1.35,
    desktopXPercent: 30,
    id: 'groove',
    scale: 1.08,
    xPercent: 29,
    yPercent: 80,
    name: 'Грув',
  },
  {
    accentColor: 'lime',
    animationDelaySeconds: -0.95,
    desktopXPercent: 69,
    id: 'neon',
    scale: 1.06,
    xPercent: 71,
    yPercent: 81,
    name: 'Неон',
  },
  {
    accentColor: 'violet',
    animationDelaySeconds: -1.6,
    desktopXPercent: 95,
    id: 'bass',
    scale: 1,
    xPercent: 93,
    yPercent: 84,
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
      style={
        {
          '--dancer-scale': dancer.scale,
          '--dancer-x': `${dancer.xPercent}%`,
          '--dancer-x-wide': `${dancer.desktopXPercent}%`,
          '--dancer-y': `${dancer.yPercent}%`,
        } as CSSProperties
      }
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
            className="room-dance-floor__dj-label max-w-[150px] truncate text-[10px] font-bold leading-3"
            sx={{ color: userAccent.color }}
          >
            DJ {djName}
          </Typography>
        </Box>
      </Box>
    </Box>
  )
}
