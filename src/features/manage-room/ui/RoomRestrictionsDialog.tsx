import { useState } from 'react'
import { toast } from 'react-toastify'

import {
  unbanRoomUser,
  unmuteRoomUser,
  useRoomRestrictions,
  type RoomRestriction,
} from '@/entities/room'
import { Button } from '@/shared/ui/button'
import {
  Avatar,
  Box,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Typography,
} from '@mui/material'

interface RoomRestrictionsDialogProps {
  onClose: () => void
  open: boolean
  roomId: string
}

function getInitials(displayName: string) {
  return displayName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(part => part[0])
    .join('')
    .toUpperCase()
}

function formatExpiration(restriction: RoomRestriction) {
  if (!restriction.expiresAt) return 'Бессрочно'
  if (restriction.expiresAt.toMillis() <= Date.now()) return 'Срок истёк'
  return `До ${restriction.expiresAt.toDate().toLocaleString('ru-RU')}`
}

export function RoomRestrictionsDialog({
  onClose,
  open,
  roomId,
}: RoomRestrictionsDialogProps) {
  const { error, loading, restrictions } = useRoomRestrictions(roomId, open)
  const [pendingKey, setPendingKey] = useState<null | string>(null)

  const handleLiftRestriction = async (restriction: RoomRestriction) => {
    const key = `${restriction.kind}:${restriction.userId}`
    setPendingKey(key)
    try {
      if (restriction.kind === 'ban') {
        await unbanRoomUser(roomId, restriction.userId)
        toast.success(`Блокировка ${restriction.displayName} снята.`)
      } else {
        await unmuteRoomUser(roomId, restriction.userId)
        toast.success(`${restriction.displayName} снова может писать в чат.`)
      }
    } catch (reason) {
      toast.error(
        reason instanceof Error
          ? reason.message
          : 'Не удалось снять ограничение.',
      )
    } finally {
      setPendingKey(null)
    }
  }

  return (
    <Dialog
      fullWidth
      maxWidth="sm"
      onClose={onClose}
      open={open}
      slotProps={{
        paper: {
          sx: {
            backgroundColor: '#24143D',
            backgroundImage: 'none',
            border: '1px solid #4A2B6D',
            color: '#F8F3FF',
          },
        },
      }}
    >
      <DialogTitle>Ограничения участников</DialogTitle>
      <DialogContent sx={{ minHeight: 180 }}>
        {loading && (
          <Box
            alignItems="center"
            display="flex"
            justifyContent="center"
            py={5}
          >
            <CircularProgress size={28} />
          </Box>
        )}

        {!loading && restrictions.length === 0 && !error && (
          <Typography color="#CDBCE2" py={3} textAlign="center">
            Активных и сохранённых ограничений нет.
          </Typography>
        )}

        <Box display="grid" gap={1.5} mt={1}>
          {restrictions.map(restriction => {
            const key = `${restriction.kind}:${restriction.userId}`
            return (
              <Box
                alignItems={{ sm: 'center', xs: 'stretch' }}
                display="flex"
                flexDirection={{ sm: 'row', xs: 'column' }}
                gap={1.5}
                key={key}
                sx={{
                  backgroundColor: '#32204B',
                  border: '1px solid #4A2B6D',
                  borderRadius: 2,
                  padding: 1.5,
                }}
              >
                <Avatar
                  alt={restriction.displayName}
                  src={restriction.photoURL ?? undefined}
                  sx={{ backgroundColor: '#6F4B91' }}
                >
                  {getInitials(restriction.displayName)}
                </Avatar>
                <Box flex={1} minWidth={0}>
                  <Typography fontWeight={700} noWrap>
                    {restriction.displayName}
                  </Typography>
                  <Typography color="#CDBCE2" variant="body2">
                    {restriction.kind === 'ban' ? 'Блокировка' : 'Запрет чата'}{' '}
                    · {formatExpiration(restriction)}
                  </Typography>
                  {restriction.reason && (
                    <Typography
                      noWrap
                      title={restriction.reason}
                      variant="body2"
                    >
                      {restriction.reason}
                    </Typography>
                  )}
                </Box>
                <Button
                  disabled={pendingKey !== null}
                  fullWidth
                  onClick={() => void handleLiftRestriction(restriction)}
                  size="small"
                  sx={{
                    borderColor: '#B88CFF',
                    color: '#F8F3FF',
                    width: { sm: 'auto', xs: '100%' },
                  }}
                  variant="outlined"
                >
                  {pendingKey === key
                    ? 'Снимаем…'
                    : restriction.kind === 'ban'
                      ? 'Разблокировать'
                      : 'Разрешить чат'}
                </Button>
              </Box>
            )
          })}
        </Box>

        {error && (
          <Typography color="error" mt={2} role="alert">
            {error}
          </Typography>
        )}
      </DialogContent>
      <DialogActions sx={{ padding: 3, paddingTop: 1 }}>
        <Button disabled={pendingKey !== null} onClick={onClose}>
          Закрыть
        </Button>
      </DialogActions>
    </Dialog>
  )
}
