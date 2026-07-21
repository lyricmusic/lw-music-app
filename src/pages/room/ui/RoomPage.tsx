import { useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  useCurrentRoomMember,
  useRoomExists,
  useRoomMembership,
  useRoomPresence,
} from '@/entities/room'
import { useSession } from '@/entities/session'
import {
  RoomInviteDialog,
  RoomRestrictionsDialog,
  RoomSettingsDialog,
} from '@/features/manage-room'
import { ReportDialog } from '@/features/report-content'
import { routes } from '@/shared/config/routes'
import { RoomChat } from '@/widgets/room-chat'
import { SyncedRutubePlayer } from '@/widgets/synced-rutube-player'
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
      className="min-h-[calc(100dvh-100px)] rounded-[20px] border border-[#4A2B6D] bg-[#1B0C32] xl:h-full xl:min-h-0"
      display="flex"
      flexDirection="column"
      gap={3}
      justifyContent="center"
      padding={{ xs: 2.5, sm: 3 }}
      textAlign="center"
    >
      {pending && <CircularProgress sx={{ color: '#B88CFF' }} />}
      <Typography color="#F8F3FF" maxWidth={520} variant="h5">
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
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false)
  const [restrictionsOpen, setRestrictionsOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [reportTarget, setReportTarget] = useState<'cover' | 'room' | null>(
    null,
  )
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
      {currentMember.role !== 'owner' && (
        <>
          <Button
            color="inherit"
            onClick={() => setReportTarget('room')}
            size="small"
            sx={outlinedActionSx}
            variant="outlined"
          >
            Жалоба на комнату
          </Button>
          <Button
            color="inherit"
            onClick={() => setReportTarget('cover')}
            size="small"
            sx={outlinedActionSx}
            variant="outlined"
          >
            Жалоба на обложку
          </Button>
        </>
      )}
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
      {['host', 'moderator', 'owner'].includes(currentMember.role) && (
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
          onClick={() => setInviteDialogOpen(true)}
          size="small"
          variant="contained"
        >
          Пригласить
        </Button>
      )}
    </Box>
  ) : null

  return (
    <Box
      className="relative min-h-full bg-[#160B2D] px-0 sm:px-1 xl:h-full xl:min-h-0 xl:overflow-hidden"
      component="main"
    >
      <Box className="room-content-grid">
        <Box className="room-player-column">
          <SyncedRutubePlayer
            currentMemberRole={currentMember?.role}
            key={roomId}
            queueEnabled={
              !currentMember?.isGuest ||
              room.access?.settings.allowGuestQueue === true
            }
            roomId={roomId}
          />
        </Box>
        <Box className="room-chat-column">
          <RoomChat
            actions={roomActions}
            chatEnabled={
              !currentMember?.isGuest ||
              room.access?.settings.allowGuestChat === true
            }
            currentMemberRole={currentMember?.role}
            key={roomId}
            roomId={roomId}
          />
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
      {currentMember &&
        ['host', 'moderator', 'owner'].includes(currentMember.role) &&
        room.access && (
          <RoomInviteDialog
            onClose={() => setInviteDialogOpen(false)}
            open={inviteDialogOpen}
            roomId={roomId}
            visibility={room.access.visibility}
          />
        )}
      {currentMember &&
        ['host', 'moderator', 'owner'].includes(currentMember.role) && (
          <RoomRestrictionsDialog
            onClose={() => setRestrictionsOpen(false)}
            open={restrictionsOpen}
            roomId={roomId}
          />
        )}
      <ReportDialog
        description={
          reportTarget === 'cover'
            ? 'Текущая обложка и данные комнаты будут сохранены в снимке жалобы.'
            : 'Название, владелец, статус и обложка комнаты будут сохранены в снимке жалобы.'
        }
        onClose={() => setReportTarget(null)}
        open={reportTarget !== null}
        roomId={roomId}
        targetId={roomId}
        targetType={reportTarget ?? 'room'}
      />
    </Box>
  )
}
