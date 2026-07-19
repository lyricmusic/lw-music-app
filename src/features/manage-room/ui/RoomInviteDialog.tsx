import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'react-toastify'

import {
  createRoomInvite,
  getRoomInviteUrl,
  revokeRoomInvite,
  type RoomVisibility,
} from '@/entities/room'
import { routes } from '@/shared/config/routes'
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
} from '@mui/material'

interface RoomInviteDialogProps {
  onClose: () => void
  open: boolean
  roomId: string
  visibility: RoomVisibility
}

interface InviteFormValues {
  maxUses: number
  validForHours: number
}

interface CreatedInvite {
  expiresAt: Date
  id: string
  maxUses: number
  revoked: boolean
  url: string
}

async function copyLink(url: string) {
  try {
    await navigator.clipboard.writeText(url)
    toast.success('Ссылка скопирована.')
  } catch {
    toast.error('Не удалось скопировать ссылку. Скопируйте её из поля вручную.')
  }
}

export function RoomInviteDialog({
  onClose,
  open,
  roomId,
  visibility,
}: RoomInviteDialogProps) {
  const [createdInvite, setCreatedInvite] = useState<CreatedInvite | null>(null)
  const [revoking, setRevoking] = useState(false)
  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
  } = useForm<InviteFormValues>({
    defaultValues: { maxUses: 1, validForHours: 24 },
  })
  const directRoomUrl = new URL(
    routes.room(roomId),
    window.location.origin,
  ).toString()

  const handleCreate = async (values: InviteFormValues) => {
    const expiresAt = new Date(
      Date.now() + values.validForHours * 60 * 60 * 1000,
    )

    try {
      const id = await createRoomInvite({
        expiresAt,
        maxUses: values.maxUses,
        roomId,
      })
      const url = getRoomInviteUrl(id)
      setCreatedInvite({
        expiresAt,
        id,
        maxUses: values.maxUses,
        revoked: false,
        url,
      })
      await copyLink(url)
    } catch (reason) {
      toast.error(
        reason instanceof Error
          ? reason.message
          : 'Не удалось создать приглашение.',
      )
    }
  }

  const handleRevoke = async () => {
    if (!createdInvite || createdInvite.revoked) return

    setRevoking(true)
    try {
      await revokeRoomInvite(createdInvite.id)
      setCreatedInvite(current =>
        current ? { ...current, revoked: true } : current,
      )
      toast.success('Приглашение отозвано.')
    } catch (reason) {
      toast.error(
        reason instanceof Error
          ? reason.message
          : 'Не удалось отозвать приглашение.',
      )
    } finally {
      setRevoking(false)
    }
  }

  const isPrivate = visibility === 'private'

  return (
    <Dialog fullWidth maxWidth="sm" onClose={onClose} open={open}>
      <DialogTitle>
        {isPrivate ? 'Приглашение в приватную комнату' : 'Ссылка на комнату'}
      </DialogTitle>
      <DialogContent sx={{ paddingTop: '12px !important' }}>
        {!isPrivate ? (
          <Stack gap={2}>
            <Alert severity="info">
              {visibility === 'unlisted'
                ? 'Комната не отображается в каталоге. Любой пользователь с этой постоянной ссылкой сможет войти.'
                : 'Комната отображается в каталоге, а эта постоянная ссылка ведёт прямо в неё.'}
            </Alert>
            <TextField
              fullWidth
              InputProps={{ readOnly: true }}
              label="Постоянная ссылка"
              value={directRoomUrl}
            />
            <Button
              onClick={() => void copyLink(directRoomUrl)}
              variant="contained"
            >
              Скопировать ссылку
            </Button>
          </Stack>
        ) : (
          <Stack component="form" gap={2} onSubmit={handleSubmit(handleCreate)}>
            <Alert severity="info">
              Одного идентификатора комнаты недостаточно для входа. Ссылка
              создаёт членство и перестанет работать после истечения срока,
              достижения лимита или отзыва.
            </Alert>
            <TextField
              disabled={isSubmitting}
              error={Boolean(errors.validForHours)}
              helperText={errors.validForHours?.message}
              inputProps={{ max: 720, min: 1, step: 1 }}
              label="Срок действия, часов"
              type="number"
              {...register('validForHours', {
                max: { message: 'Не больше 720 часов.', value: 720 },
                min: { message: 'Не меньше 1 часа.', value: 1 },
                required: 'Укажите срок действия.',
                setValueAs: value => Number(value),
                validate: value =>
                  Number.isInteger(value) || 'Введите целое количество часов.',
              })}
            />
            <TextField
              disabled={isSubmitting}
              error={Boolean(errors.maxUses)}
              helperText={errors.maxUses?.message}
              inputProps={{ max: 100, min: 1, step: 1 }}
              label="Максимум активаций"
              type="number"
              {...register('maxUses', {
                max: { message: 'Не больше 100 активаций.', value: 100 },
                min: { message: 'Не меньше 1 активации.', value: 1 },
                required: 'Укажите число активаций.',
                setValueAs: value => Number(value),
                validate: value =>
                  Number.isInteger(value) || 'Введите целое число активаций.',
              })}
            />
            <Button disabled={isSubmitting} type="submit" variant="contained">
              {isSubmitting ? 'Создаём…' : 'Создать и скопировать'}
            </Button>

            {createdInvite && (
              <Stack gap={1.5} sx={{ marginTop: 1 }}>
                <TextField
                  fullWidth
                  InputProps={{ readOnly: true }}
                  label="Последнее приглашение"
                  value={createdInvite.url}
                />
                <Typography color="text.secondary" variant="body2">
                  До {createdInvite.expiresAt.toLocaleString('ru-RU')};
                  активаций: не более {createdInvite.maxUses}.
                </Typography>
                {createdInvite.revoked ? (
                  <Alert severity="warning">Приглашение отозвано.</Alert>
                ) : (
                  <Stack direction={{ sm: 'row', xs: 'column' }} gap={1}>
                    <Button
                      onClick={() => void copyLink(createdInvite.url)}
                      variant="outlined"
                    >
                      Скопировать ещё раз
                    </Button>
                    <Button
                      color="error"
                      disabled={revoking}
                      onClick={() => void handleRevoke()}
                      variant="outlined"
                    >
                      {revoking ? 'Отзываем…' : 'Отозвать'}
                    </Button>
                  </Stack>
                )}
              </Stack>
            )}
          </Stack>
        )}
      </DialogContent>
      <DialogActions sx={{ padding: 3, paddingTop: 2 }}>
        <Button onClick={onClose}>Закрыть</Button>
      </DialogActions>
    </Dialog>
  )
}
