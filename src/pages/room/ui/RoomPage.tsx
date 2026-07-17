import { useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { toast } from 'react-toastify'

import {
  createRoomInvite,
  getRoomInviteUrl,
  useCurrentRoomMember,
  useRoomExists,
  useRoomMembership,
  useRoomPresence,
} from '@/entities/room'
import { useSession } from '@/entities/session'
import {
  RoomRestrictionsDialog,
  RoomSettingsDialog,
} from '@/features/manage-room'
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
  const [searchParams] = useSearchParams()
  const { roomId = 'demo-room' } = useParams<{ roomId: string }>()
  const { profile, user } = useSession()
  const [inviteCreating, setInviteCreating] = useState(false)
  const [restrictionsOpen, setRestrictionsOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const inviteId = searchParams.get('invite')?.trim() || undefined
  const membership = useRoomMembership(
    roomId,
    profile?.onboardingCompleted === true,
    inviteId,
  )
  const room = useRoomExists(roomId, membership.status)
  const currentMember = useCurrentRoomMember(
    membership.status === 'joined' ? roomId : '',
  )
  useRoomPresence(membership.status === 'joined' ? roomId : '')

  const leaveRoomEntry = () =>
    navigate(user?.isAnonymous ? routes.signIn : routes.rooms, {
      replace: true,
    })

  const handleCreateInvite = async () => {
    setInviteCreating(true)
    try {
      const inviteId = await createRoomInvite({
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        roomId,
      })
      await navigator.clipboard.writeText(getRoomInviteUrl(roomId, inviteId))
      toast.success('Ссылка-приглашение скопирована. Она действует 24 часа.')
    } catch (reason) {
      toast.error(
        reason instanceof Error
          ? reason.message
          : 'Не удалось создать приглашение.',
      )
    } finally {
      setInviteCreating(false)
    }
  }

  if (
    room.error === 'forbidden' &&
    membership.status !== 'joining' &&
    membership.status !== 'joined'
  ) {
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

  if (currentMember?.status === 'left') {
    return (
      <RoomEntryState
        actionLabel="К комнатам"
        message="Вы больше не участвуете в этой комнате."
        onAction={() => navigate(routes.rooms, { replace: true })}
      />
    )
  }

  if (room.access?.status === 'archived') {
    if (!currentMember) {
      return <RoomEntryState message="Загружаем настройки архива…" pending />
    }

    const isOwner = currentMember.role === 'owner'
    return (
      <>
        <RoomEntryState
          actionLabel={isOwner ? 'Настройки' : 'К комнатам'}
          message={
            isOwner
              ? 'Комната находится в архиве. Вы можете снова сделать её активной в настройках.'
              : 'Владелец переместил эту комнату в архив.'
          }
          onAction={
            isOwner ? () => setSettingsOpen(true) : () => navigate(routes.rooms)
          }
        />
        {isOwner && room.access && (
          <RoomSettingsDialog
            access={room.access}
            onClose={() => setSettingsOpen(false)}
            open={settingsOpen}
            roomId={roomId}
          />
        )}
      </>
    )
  }

  const outlinedActionSx = {
    '&:hover': {
      backgroundColor: 'rgba(255, 255, 255, 0.08)',
      borderColor: '#FFFFFF',
    },
    borderColor: 'rgba(255, 255, 255, 0.85)',
    color: '#FFFFFF',
  }

  const roomActions = currentMember ? (
    <Box
      sx={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 1,
        justifyContent: 'flex-end',
      }}
    >
      {currentMember.role === 'owner' && (
        <Button
          color="inherit"
          onClick={() => setSettingsOpen(true)}
          size="small"
          sx={outlinedActionSx}
          variant="outlined"
        >
          Настройки
        </Button>
      )}
      {['moderator', 'owner'].includes(currentMember.role) && (
        <Button
          color="inherit"
          onClick={() => setRestrictionsOpen(true)}
          size="small"
          sx={outlinedActionSx}
          variant="outlined"
        >
          Ограничения
        </Button>
      )}
      {['host', 'moderator', 'owner'].includes(currentMember.role) && (
        <Button
          disabled={inviteCreating}
          onClick={handleCreateInvite}
          size="small"
          variant="contained"
        >
          {inviteCreating ? 'Создаём ссылку…' : 'Пригласить'}
        </Button>
      )}
    </Box>
  ) : null

  return (
    <Box
      className="relative h-full min-h-0 overflow-hidden bg-[#3F3F59] px-1"
      component="main"
    >
      <Box className="room-content-grid">
        <Box className="room-player-column">
          <SyncedYouTubePlayer
            currentMemberRole={currentMember?.role}
            key={roomId}
            roomId={roomId}
          />
        </Box>
        <Box className="room-chat-column">
          <RoomChat actions={roomActions} key={roomId} roomId={roomId} />
        </Box>
      </Box>
      {currentMember?.role === 'owner' && room.access && (
        <RoomSettingsDialog
          access={room.access}
          onClose={() => setSettingsOpen(false)}
          open={settingsOpen}
          roomId={roomId}
        />
      )}
      {currentMember && ['moderator', 'owner'].includes(currentMember.role) && (
        <RoomRestrictionsDialog
          onClose={() => setRestrictionsOpen(false)}
          open={restrictionsOpen}
          roomId={roomId}
        />
      )}
    </Box>
  )
}
