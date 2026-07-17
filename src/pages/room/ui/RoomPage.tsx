import { useNavigate, useParams } from 'react-router-dom'

import {
  useRoomExists,
  useRoomMembership,
  useRoomPresence,
} from '@/entities/room'
import { useSession } from '@/entities/session'
import { routes } from '@/shared/config/routes'
import { RoomChat } from '@/widgets/room-chat'
import { SyncedYouTubePlayer } from '@/widgets/synced-youtube-player'
import { Box, Button, CircularProgress, Typography } from '@mui/material'

function RoomEntryState({
  actionLabel,
  message,
  onAction,
  pending = false,
}: {
  actionLabel?: string
  message: string
  onAction?: () => void
  pending?: boolean
}) {
  return (
    <Box
      alignItems="center"
      className="h-full rounded-[20px] bg-[#ECEDF2]"
      display="flex"
      flexDirection="column"
      gap={3}
      justifyContent="center"
      padding={3}
      textAlign="center"
    >
      {pending && <CircularProgress sx={{ color: '#6F70E7' }} />}
      <Typography color="#25263E" maxWidth={520} variant="h5">
        {message}
      </Typography>
      {actionLabel && onAction && (
        <Button onClick={onAction} variant="contained">
          {actionLabel}
        </Button>
      )}
    </Box>
  )
}

export function RoomPage() {
  const navigate = useNavigate()
  const { roomId = 'demo-room' } = useParams<{ roomId: string }>()
  const { profile, user } = useSession()
  const room = useRoomExists(roomId)
  const membership = useRoomMembership(
    roomId,
    room.exists === true && profile?.onboardingCompleted === true,
  )
  useRoomPresence(membership.status === 'joined' ? roomId : '')

  const leaveRoomEntry = () =>
    navigate(user?.isAnonymous ? routes.signIn : routes.rooms, {
      replace: true,
    })

  if (room.error === 'forbidden') {
    return (
      <RoomEntryState
        actionLabel={user?.isAnonymous ? 'Войти в аккаунт' : 'К комнатам'}
        message="Нет доступа к этой комнате. Она может быть приватной или уже закрытой."
        onAction={leaveRoomEntry}
      />
    )
  }

  if (room.error === 'unknown') {
    return (
      <RoomEntryState
        actionLabel="Попробовать снова"
        message="Не удалось загрузить комнату. Проверьте соединение и повторите попытку."
        onAction={() => window.location.reload()}
      />
    )
  }

  if (room.exists === false) {
    return (
      <RoomEntryState
        actionLabel={user?.isAnonymous ? 'Войти в аккаунт' : 'К комнатам'}
        message="Комната не найдена или уже удалена."
        onAction={leaveRoomEntry}
      />
    )
  }

  if (membership.status === 'forbidden' || membership.status === 'error') {
    return (
      <RoomEntryState
        actionLabel={user?.isAnonymous ? 'Войти в аккаунт' : 'К комнатам'}
        message={membership.error ?? 'Не удалось присоединиться к комнате.'}
        onAction={leaveRoomEntry}
      />
    )
  }

  if (room.exists !== true || membership.status !== 'joined') {
    return (
      <RoomEntryState
        message={
          profile?.onboardingCompleted
            ? 'Присоединяемся к комнате…'
            : 'Подготавливаем гостевой профиль…'
        }
        pending
      />
    )
  }

  return (
    <Box
      className="h-full min-h-0 overflow-hidden bg-[#3F3F59] px-1"
      component="main"
    >
      <Box className="room-content-grid">
        <Box className="room-player-column">
          <SyncedYouTubePlayer key={roomId} roomId={roomId} />
        </Box>
        <Box className="room-chat-column">
          <RoomChat key={roomId} roomId={roomId} />
        </Box>
      </Box>
    </Box>
  )
}
