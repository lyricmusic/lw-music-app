import { useState, type MouseEvent } from 'react'
import { toast } from 'react-toastify'

import {
  banRoomUser,
  kickRoomMember,
  muteRoomUser,
  setRoomMemberRole,
  type RoomMemberRole,
  type RoomParticipant,
} from '@/entities/room'
import { useSession } from '@/entities/session'
import { Button } from '@/shared/ui/button'
import {
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  Menu,
  MenuItem,
  TextField,
  Typography,
} from '@mui/material'

interface RoomParticipantActionsProps {
  actorRole: null | RoomMemberRole
  participant: RoomParticipant
  roomId: string
}

type ModerationAction = 'ban' | 'mute'
type RestrictionDuration = '1h' | '24h' | '7d' | 'forever'

const ROLE_LABELS: Record<RoomMemberRole, string> = {
  host: 'ведущим',
  member: 'участником',
  moderator: 'модератором',
  owner: 'владельцем',
}

const DURATION_MILLISECONDS: Record<
  Exclude<RestrictionDuration, 'forever'>,
  number
> = {
  '1h': 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
}

function getRestrictionExpiration(duration: RestrictionDuration) {
  return duration === 'forever'
    ? null
    : new Date(Date.now() + DURATION_MILLISECONDS[duration])
}

export function RoomParticipantActions({
  actorRole,
  participant,
  roomId,
}: RoomParticipantActionsProps) {
  const { user } = useSession()
  const [anchorElement, setAnchorElement] = useState<HTMLElement | null>(null)
  const [moderationAction, setModerationAction] =
    useState<ModerationAction | null>(null)
  const [duration, setDuration] = useState<RestrictionDuration>('24h')
  const [kickDialogOpen, setKickDialogOpen] = useState(false)
  const [kickError, setKickError] = useState<null | string>(null)
  const [reason, setReason] = useState('')
  const [formError, setFormError] = useState<null | string>(null)
  const [pending, setPending] = useState(false)

  const isSelf = participant.id === user?.uid
  const canAssignRole =
    actorRole === 'owner' && participant.role !== 'owner' && !isSelf
  const canModerate =
    (actorRole === 'owner' || actorRole === 'moderator') &&
    participant.role !== 'owner' &&
    !isSelf
  const canKick =
    !isSelf &&
    ((actorRole === 'owner' && participant.role !== 'owner') ||
      ((actorRole === 'host' || actorRole === 'moderator') &&
        participant.role === 'member'))

  if (!canAssignRole && !canModerate && !canKick) return null

  const closeMenu = () => setAnchorElement(null)

  const handleOpenMenu = (event: MouseEvent<HTMLElement>) => {
    setAnchorElement(event.currentTarget)
  }

  const handleRoleChange = async (role: RoomMemberRole) => {
    closeMenu()
    setPending(true)
    try {
      await setRoomMemberRole(roomId, participant.id, role)
      toast.success(`${participant.displayName} теперь ${ROLE_LABELS[role]}.`)
    } catch (reason) {
      toast.error(
        reason instanceof Error ? reason.message : 'Не удалось изменить роль.',
      )
    } finally {
      setPending(false)
    }
  }

  const openModerationDialog = (action: ModerationAction) => {
    closeMenu()
    setModerationAction(action)
    setDuration('24h')
    setReason('')
    setFormError(null)
  }

  const closeModerationDialog = () => {
    if (!pending) setModerationAction(null)
  }

  const openKickDialog = () => {
    closeMenu()
    setKickError(null)
    setKickDialogOpen(true)
  }

  const closeKickDialog = () => {
    if (!pending) setKickDialogOpen(false)
  }

  const handleKick = async () => {
    setPending(true)
    setKickError(null)

    try {
      await kickRoomMember(roomId, participant.id)
      toast.success(`${participant.displayName} исключён из комнаты.`)
      setKickDialogOpen(false)
    } catch (reason) {
      setKickError(
        reason instanceof Error
          ? reason.message
          : 'Не удалось выгнать участника из комнаты.',
      )
    } finally {
      setPending(false)
    }
  }

  const handleModeration = async () => {
    const normalizedReason = reason.trim()
    if (!normalizedReason) {
      setFormError('Укажите причину.')
      return
    }

    if (!moderationAction) return
    setPending(true)
    setFormError(null)

    try {
      const input = {
        expiresAt: getRestrictionExpiration(duration),
        reason: normalizedReason,
        roomId,
        userId: participant.id,
      }

      if (moderationAction === 'ban') {
        await banRoomUser(input)
        toast.success(`${participant.displayName} заблокирован.`)
      } else {
        await muteRoomUser(input)
        toast.success(
          `${participant.displayName} больше не может писать в чат.`,
        )
      }

      setModerationAction(null)
    } catch (reason) {
      setFormError(
        reason instanceof Error
          ? reason.message
          : 'Не удалось применить ограничение.',
      )
    } finally {
      setPending(false)
    }
  }

  return (
    <>
      <IconButton
        aria-label={`Действия с участником ${participant.displayName}`}
        disabled={pending}
        onClick={handleOpenMenu}
        size="small"
        sx={{ color: '#D7DBF0', flexShrink: 0 }}
      >
        <Typography aria-hidden component="span" fontSize={24} lineHeight={1}>
          ⋮
        </Typography>
      </IconButton>

      <Menu
        anchorEl={anchorElement}
        onClose={closeMenu}
        open={Boolean(anchorElement)}
      >
        {canAssignRole && [
          <MenuItem
            disabled={participant.role === 'host'}
            key="host"
            onClick={() => void handleRoleChange('host')}
          >
            Сделать ведущим
          </MenuItem>,
          <MenuItem
            disabled={participant.role === 'moderator'}
            key="moderator"
            onClick={() => void handleRoleChange('moderator')}
          >
            Сделать модератором
          </MenuItem>,
          <MenuItem
            disabled={participant.role === 'member'}
            key="member"
            onClick={() => void handleRoleChange('member')}
          >
            Сделать участником
          </MenuItem>,
        ]}

        {canAssignRole && (canModerate || canKick) && <Divider />}

        {canModerate && (
          <MenuItem onClick={() => openModerationDialog('mute')}>
            Запретить писать…
          </MenuItem>
        )}
        {canKick && (
          <MenuItem onClick={openKickDialog} sx={{ color: 'error.main' }}>
            Выгнать из комнаты…
          </MenuItem>
        )}
        {canModerate && (
          <MenuItem
            onClick={() => openModerationDialog('ban')}
            sx={{ color: 'error.main' }}
          >
            Заблокировать…
          </MenuItem>
        )}
      </Menu>

      <Dialog
        fullWidth
        maxWidth="sm"
        onClose={closeKickDialog}
        open={kickDialogOpen}
      >
        <DialogTitle>Выгнать {participant.displayName} из комнаты?</DialogTitle>
        <DialogContent sx={{ paddingTop: '12px !important' }}>
          <Typography>
            Участник сразу потеряет доступ и будет удалён из очереди. Это не
            блокировка: он сможет снова войти в открытую комнату или получить
            новое приглашение в приватную.
          </Typography>
          {kickError && (
            <Typography color="error" mt={2} role="alert">
              {kickError}
            </Typography>
          )}
        </DialogContent>
        <DialogActions sx={{ padding: 3, paddingTop: 1 }}>
          <Button disabled={pending} onClick={closeKickDialog}>
            Отмена
          </Button>
          <Button
            color="error"
            disabled={pending}
            onClick={() => void handleKick()}
            variant="contained"
          >
            {pending ? 'Исключаем…' : 'Выгнать'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        fullWidth
        maxWidth="sm"
        onClose={closeModerationDialog}
        open={moderationAction !== null}
      >
        <DialogTitle>
          {moderationAction === 'ban'
            ? `Заблокировать ${participant.displayName}`
            : `Запретить писать пользователю ${participant.displayName}`}
        </DialogTitle>
        <DialogContent
          sx={{ display: 'grid', gap: 2, paddingTop: '12px !important' }}
        >
          <TextField
            error={Boolean(formError)}
            helperText={formError}
            inputProps={{ maxLength: 500 }}
            label="Причина"
            minRows={3}
            multiline
            onChange={event => {
              setReason(event.target.value)
              if (formError) setFormError(null)
            }}
            value={reason}
          />
          <TextField
            label="Срок"
            onChange={event =>
              setDuration(event.target.value as RestrictionDuration)
            }
            select
            value={duration}
          >
            <MenuItem value="1h">1 час</MenuItem>
            <MenuItem value="24h">24 часа</MenuItem>
            <MenuItem value="7d">7 дней</MenuItem>
            <MenuItem value="forever">Бессрочно</MenuItem>
          </TextField>
        </DialogContent>
        <DialogActions sx={{ padding: 3, paddingTop: 1 }}>
          <Button disabled={pending} onClick={closeModerationDialog}>
            Отмена
          </Button>
          <Button
            color={moderationAction === 'ban' ? 'error' : 'primary'}
            disabled={pending}
            onClick={() => void handleModeration()}
            variant="contained"
          >
            {pending
              ? 'Сохраняем…'
              : moderationAction === 'ban'
                ? 'Заблокировать'
                : 'Запретить писать'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  )
}
