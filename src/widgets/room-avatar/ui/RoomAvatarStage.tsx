import {
  characterDanceOptions,
  getCharacterAccent,
  getCharacterSpriteUrl,
  resolveUserCharacter,
  type UserCharacter,
} from '@/entities/session'
import { Box, Typography } from '@mui/material'

interface RoomAvatarStageProps {
  character?: null | UserCharacter
  isPlaying: boolean
}

export function RoomAvatarStage({
  character,
  isPlaying,
}: RoomAvatarStageProps) {
  const resolvedCharacter = resolveUserCharacter(character)
  const accent = getCharacterAccent(resolvedCharacter.accentColor)
  const danceLabel =
    characterDanceOptions.find(
      option => option.id === resolvedCharacter.danceId,
    )?.label ?? 'Шаги'
  const stateLabel = isPlaying ? `Танцует: ${danceLabel}` : 'Ждёт музыку'

  return (
    <Box
      aria-label={`Ваш персонаж. ${stateLabel}.`}
      className="room-avatar-stage"
      component="section"
      sx={{
        background: `radial-gradient(circle at 50% 36%, ${accent.glow}, transparent 58%), #24143D`,
        borderColor: accent.color,
      }}
    >
      <Box aria-hidden="true" className="room-avatar-stage__viewport">
        <Box
          className="room-avatar-sprite"
          key={isPlaying ? 'side-step' : 'idle'}
          sx={{
            backgroundImage: `url(${getCharacterSpriteUrl(resolvedCharacter, isPlaying)})`,
            filter: `${accent.filter} drop-shadow(0 0 5px ${accent.color})`,
          }}
        />
      </Box>

      <Box className="min-w-0 text-center max-sm:text-left">
        <Typography
          className="truncate text-[13px] font-bold leading-4 sm:text-sm"
          component="p"
          sx={{ color: '#F8F3FF' }}
        >
          Ваш персонаж
        </Typography>
        <Typography
          className="mt-0.5 truncate text-[11px] leading-[14px] sm:text-xs"
          component="p"
          sx={{ color: isPlaying ? accent.color : '#CDBCE2' }}
        >
          {stateLabel}
        </Typography>
      </Box>
    </Box>
  )
}
