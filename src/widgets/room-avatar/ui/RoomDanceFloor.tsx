import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'

import {
  ROOM_REACTION_OPTIONS,
  type RoomParticipant,
  type RoomReactionEmoji,
} from '@/entities/room'
import {
  characterAppearanceOptions,
  characterDanceOptions,
  characterGenderOptions,
  getCharacterAccent,
  getCharacterSpriteUrl,
  preloadCharacterSprites,
} from '@/entities/session'
import { Box, Button, Typography } from '@mui/material'

interface RoomDanceFloorProps {
  collapsed: boolean
  currentUserId?: null | string
  djUserId?: null | string
  isMusicPlaying: boolean
  onCollapsedChange: (collapsed: boolean) => void
  onReaction: (reaction: RoomReactionEmoji) => void
  onShowAllParticipants: () => void
  participants: RoomParticipant[]
  reactionPending?: boolean
  reactions: ReadonlyMap<string, RoomReactionEmoji>
}

interface DancerPosition {
  scale: number
  xPercent: number
  yPercent: number
}

type FloorCapacity = 6 | 8 | 12

const DANCER_LAYOUTS: Record<FloorCapacity, DancerPosition[]> = {
  6: [
    { scale: 0.84, xPercent: 10, yPercent: 48 },
    { scale: 0.84, xPercent: 90, yPercent: 48 },
    { scale: 0.98, xPercent: 12, yPercent: 76 },
    { scale: 1.04, xPercent: 35, yPercent: 78 },
    { scale: 1.04, xPercent: 65, yPercent: 78 },
    { scale: 0.98, xPercent: 88, yPercent: 76 },
  ],
  8: [
    { scale: 0.84, xPercent: 8, yPercent: 46 },
    { scale: 0.9, xPercent: 27, yPercent: 49 },
    { scale: 0.9, xPercent: 73, yPercent: 49 },
    { scale: 0.84, xPercent: 92, yPercent: 46 },
    { scale: 0.98, xPercent: 10, yPercent: 77 },
    { scale: 1.06, xPercent: 34, yPercent: 79 },
    { scale: 1.06, xPercent: 66, yPercent: 79 },
    { scale: 0.98, xPercent: 90, yPercent: 77 },
  ],
  12: [
    { scale: 0.82, xPercent: 7, yPercent: 43 },
    { scale: 0.88, xPercent: 24, yPercent: 46 },
    { scale: 0.88, xPercent: 76, yPercent: 46 },
    { scale: 0.82, xPercent: 93, yPercent: 43 },
    { scale: 0.94, xPercent: 13, yPercent: 64 },
    { scale: 1, xPercent: 35, yPercent: 66 },
    { scale: 1, xPercent: 65, yPercent: 66 },
    { scale: 0.94, xPercent: 87, yPercent: 64 },
    { scale: 1.02, xPercent: 6, yPercent: 84 },
    { scale: 1.08, xPercent: 29, yPercent: 85 },
    { scale: 1.08, xPercent: 71, yPercent: 85 },
    { scale: 1.02, xPercent: 94, yPercent: 84 },
  ],
}

function getFloorCapacity(width: number): FloorCapacity {
  if (width < 420) return 6
  if (width < 620) return 8
  return 12
}

function getCharacterLabels(participant: RoomParticipant) {
  const appearance =
    characterAppearanceOptions.find(
      option => option.id === participant.character.appearanceId,
    )?.label ?? 'Базовая'
  const dance =
    characterDanceOptions.find(
      option => option.id === participant.character.danceId,
    )?.label ?? 'Шаги'
  const gender =
    characterGenderOptions.find(
      option => option.id === participant.character.genderId,
    )?.label ?? 'Мужской'

  return { appearance, dance, gender }
}

function DanceFloorDancer({
  isMusicPlaying,
  participant,
  position,
  reaction,
}: {
  isMusicPlaying: boolean
  participant: RoomParticipant
  position: DancerPosition
  reaction?: RoomReactionEmoji
}) {
  const accent = getCharacterAccent(participant.character.accentColor)
  const labels = getCharacterLabels(participant)
  const isDancing = isMusicPlaying && participant.online

  return (
    <Box
      aria-label={`${participant.displayName}. ${participant.online ? 'В сети' : 'Не в сети'}. Образ: ${labels.appearance}, ${labels.gender.toLocaleLowerCase('ru')}. Танец: ${labels.dance}.${reaction ? ` Реакция: ${reaction}.` : ''}`}
      className={`room-dance-floor__dancer ${
        participant.online ? '' : 'room-dance-floor__dancer--inactive'
      }`}
      component="li"
      style={
        {
          '--dancer-scale': position.scale,
          '--dancer-x': `${position.xPercent}%`,
          '--dancer-y': `${position.yPercent}%`,
        } as CSSProperties
      }
      tabIndex={0}
    >
      {reaction && (
        <Box aria-hidden="true" className="room-dance-floor__reaction">
          {reaction}
        </Box>
      )}
      <Box aria-hidden="true" className="room-dance-floor__avatar-wrap">
        <Box
          className="character-sprite room-dance-floor__sprite"
          sx={{
            '--character-sprite-image': `url(${getCharacterSpriteUrl(participant.character, isDancing)})`,
            filter: `${accent.filter} drop-shadow(0 0 6px ${accent.color})`,
          }}
        />
        <Box
          className={`room-dance-floor__activity ${
            participant.online ? 'room-dance-floor__activity--online' : ''
          }`}
        />
      </Box>
      <Box className="room-dance-floor__participant-label">
        <Typography component="span">{participant.displayName}</Typography>
        <Typography component="span">
          {labels.appearance} · {labels.dance}
        </Typography>
      </Box>
    </Box>
  )
}

function DanceFloorDj({
  participant,
  reaction,
}: {
  participant: RoomParticipant
  reaction?: RoomReactionEmoji
}) {
  const accent = getCharacterAccent(participant.character.accentColor)
  const labels = getCharacterLabels(participant)

  return (
    <Box
      aria-label={`DJ ${participant.displayName}. ${participant.online ? 'В сети' : 'Не в сети'}. Образ: ${labels.appearance}. Танец: ${labels.dance}.${reaction ? ` Реакция: ${reaction}.` : ''}`}
      className={`room-dance-floor__dj ${
        participant.online ? '' : 'room-dance-floor__dj--inactive'
      }`}
      role="img"
    >
      {reaction && (
        <Box aria-hidden="true" className="room-dance-floor__reaction">
          {reaction}
        </Box>
      )}
      <Box
        aria-hidden="true"
        className="character-sprite room-dance-floor__dj-sprite"
        sx={{
          '--character-sprite-image': `url(${getCharacterSpriteUrl(participant.character, false)})`,
          filter: `${accent.filter} drop-shadow(0 0 8px ${accent.color})`,
        }}
      />
      <Box aria-hidden="true" className="room-dance-floor__dj-booth">
        <Box className="room-dance-floor__deck" />
        <Box className="room-dance-floor__mixer" />
        <Box className="room-dance-floor__deck" />
      </Box>
      <Box className="room-dance-floor__dj-label">
        <Typography component="span" sx={{ color: accent.color }}>
          DJ {participant.displayName}
        </Typography>
        <Typography component="span">
          {labels.appearance} · {labels.dance}
        </Typography>
      </Box>
      <Box
        aria-hidden="true"
        className={`room-dance-floor__activity room-dance-floor__activity--dj ${
          participant.online ? 'room-dance-floor__activity--online' : ''
        }`}
      />
    </Box>
  )
}

export function RoomDanceFloor({
  collapsed,
  currentUserId,
  djUserId,
  isMusicPlaying,
  onCollapsedChange,
  onReaction,
  onShowAllParticipants,
  participants,
  reactionPending = false,
  reactions,
}: RoomDanceFloorProps) {
  const sceneRef = useRef<HTMLDivElement>(null)
  const [capacity, setCapacity] = useState<FloorCapacity>(8)

  useEffect(() => {
    participants.forEach(participant => {
      preloadCharacterSprites(participant.character)
    })
  }, [participants])

  useEffect(() => {
    const scene = sceneRef.current
    if (!scene) return

    const updateCapacity = (width: number) => {
      setCapacity(currentCapacity => {
        const nextCapacity = getFloorCapacity(width)
        return currentCapacity === nextCapacity ? currentCapacity : nextCapacity
      })
    }

    updateCapacity(scene.getBoundingClientRect().width)
    const observer = new ResizeObserver(entries => {
      const entry = entries[0]
      if (entry) updateCapacity(entry.contentRect.width)
    })
    observer.observe(scene)

    return () => observer.disconnect()
  }, [collapsed])

  const dj = useMemo(
    () =>
      participants.find(participant => participant.id === djUserId) ??
      participants.find(participant => participant.role === 'owner') ??
      participants.find(participant => participant.id === currentUserId) ??
      participants[0] ??
      null,
    [currentUserId, djUserId, participants],
  )
  const visibleDancers = useMemo(
    () =>
      participants
        .filter(participant => participant.id !== dj?.id)
        .slice(0, capacity),
    [capacity, dj?.id, participants],
  )
  const visibleParticipantCount = visibleDancers.length + (dj ? 1 : 0)
  const hiddenParticipantCount = Math.max(
    0,
    participants.length - visibleParticipantCount,
  )
  const featuredParticipant =
    participants.find(participant => participant.id === currentUserId) ?? dj
  const featuredAccent = featuredParticipant
    ? getCharacterAccent(featuredParticipant.character.accentColor)
    : null
  const onlineParticipantCount = participants.filter(
    participant => participant.online,
  ).length
  const statusLabel = `${onlineParticipantCount} в сети · ${
    isMusicPlaying ? 'танцуют' : 'ждут музыку'
  }`

  if (collapsed) {
    return (
      <Box
        className="room-dance-floor room-dance-floor--collapsed"
        component="section"
        sx={{ borderColor: featuredAccent?.color ?? '#4A2B6D' }}
      >
        {featuredParticipant && featuredAccent && (
          <Box
            aria-hidden="true"
            className="room-dance-floor__collapsed-avatar"
          >
            <Box
              className="character-sprite room-dance-floor__sprite room-dance-floor__sprite--collapsed"
              sx={{
                '--character-sprite-image': `url(${getCharacterSpriteUrl(featuredParticipant.character, false)})`,
                filter: `${featuredAccent.filter} drop-shadow(0 0 5px ${featuredAccent.color})`,
              }}
            />
          </Box>
        )}
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
      sx={{ borderColor: featuredAccent?.color ?? '#4A2B6D' }}
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
        <Box className="room-dance-floor__header-actions">
          {currentUserId && (
            <Box
              aria-label="Отправить реакцию"
              className="room-dance-floor__reaction-picker"
              role="group"
            >
              {ROOM_REACTION_OPTIONS.map(reaction => (
                <Button
                  aria-label={`Отправить реакцию ${reaction}`}
                  disabled={reactionPending}
                  key={reaction}
                  onClick={() => onReaction(reaction)}
                  size="small"
                >
                  {reaction}
                </Button>
              ))}
            </Box>
          )}
          {hiddenParticipantCount > 0 && (
            <Button
              onClick={onShowAllParticipants}
              size="small"
              sx={{ whiteSpace: 'nowrap' }}
              variant="outlined"
            >
              Все ({participants.length})
            </Button>
          )}
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
      </Box>

      <Box className="room-dance-floor__scene" ref={sceneRef}>
        <Box aria-hidden="true" className="room-dance-floor__lights" />
        <Box
          aria-label={`Участники на танцплощадке. Показано ${visibleParticipantCount} из ${participants.length}.`}
          className="room-dance-floor__track"
          component="ul"
        >
          {visibleDancers.map((participant, index) => (
            <DanceFloorDancer
              isMusicPlaying={isMusicPlaying}
              key={participant.id}
              participant={participant}
              position={DANCER_LAYOUTS[capacity][index]}
              reaction={reactions.get(participant.id)}
            />
          ))}
        </Box>

        {dj && (
          <DanceFloorDj participant={dj} reaction={reactions.get(dj.id)} />
        )}

        {!dj && (
          <Typography className="room-dance-floor__empty">
            Ждём участников…
          </Typography>
        )}

      </Box>
    </Box>
  )
}
