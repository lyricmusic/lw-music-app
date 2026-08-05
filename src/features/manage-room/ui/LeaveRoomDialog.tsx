import type { RoomMemberRole } from '@/entities/room'
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
} from '@mui/material'

interface LeaveRoomDialogProps {
  onClose: () => void
  onConfirm: () => void
  open: boolean
  pending: boolean
  role?: RoomMemberRole
}

export function LeaveRoomDialog({
  onClose,
  onConfirm,
  open,
  pending,
  role,
}: LeaveRoomDialogProps) {
  const isOwner = role === 'owner'

  return (
    <Dialog
      aria-describedby="leave-room-description"
      aria-labelledby="leave-room-title"
      fullWidth
      maxWidth="xs"
      onClose={pending ? undefined : onClose}
      open={open}
    >
      <DialogTitle id="leave-room-title">
        {isOwner ? 'Вы владелец комнаты' : 'Покинуть комнату?'}
      </DialogTitle>
      <DialogContent>
        <DialogContentText
          id="leave-room-description"
          sx={{ color: '#CDBCE2', lineHeight: 1.6 }}
        >
          {isOwner
            ? 'Владелец не может отключить своё участие. Чтобы окончательно выйти, сначала передайте права другому зарегистрированному участнику. Сейчас можно вернуться к списку комнат — владение сохранится.'
            : 'Ваше активное участие завершится, а позиция в очереди, присутствие и текущая реакция будут удалены. В открытую комнату можно присоединиться снова; для приватной понадобится действующее приглашение.'}
        </DialogContentText>
      </DialogContent>
      <DialogActions sx={{ padding: { xs: 2, sm: 3 }, paddingTop: 1 }}>
        <Button disabled={pending} onClick={onClose} variant="outlined">
          Остаться
        </Button>
        <Button
          color={isOwner ? 'primary' : 'error'}
          disabled={pending}
          onClick={onConfirm}
          variant={isOwner ? 'contained' : 'outlined'}
        >
          {pending ? 'Выходим…' : isOwner ? 'К списку комнат' : 'Покинуть'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
