import { useEffect } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { toast } from 'react-toastify'

import {
  updateRoomAccess,
  type RoomAccess,
  type RoomStatus,
  type RoomVisibility,
} from '@/entities/room'
import { Button } from '@/shared/ui/button'
import {
  Alert,
  Box,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  MenuItem,
  Switch,
  TextField,
  Typography,
} from '@mui/material'

interface RoomSettingsDialogProps {
  access: RoomAccess
  onClose: () => void
  open: boolean
  roomId: string
}

interface RoomSettingsFormValues {
  allowGuestChat: boolean
  allowGuestQueue: boolean
  slowModeSeconds: number
  status: RoomStatus
  visibility: RoomVisibility
}

function getDefaultValues(access: RoomAccess): RoomSettingsFormValues {
  return {
    allowGuestChat: access.settings.allowGuestChat,
    allowGuestQueue: access.settings.allowGuestQueue,
    slowModeSeconds: access.settings.slowModeSeconds,
    status: access.status,
    visibility: access.visibility,
  }
}

export function RoomSettingsDialog({
  access,
  onClose,
  open,
  roomId,
}: RoomSettingsDialogProps) {
  const {
    control,
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
    reset,
    watch,
  } = useForm<RoomSettingsFormValues>({
    defaultValues: getDefaultValues(access),
  })

  useEffect(() => {
    if (open) reset(getDefaultValues(access))
  }, [access, open, reset])

  const selectedStatus = watch('status')

  const handleClose = () => {
    if (!isSubmitting) onClose()
  }

  const handleSave = async (values: RoomSettingsFormValues) => {
    try {
      await updateRoomAccess(roomId, {
        settings: {
          allowGuestChat: values.allowGuestChat,
          allowGuestQueue: values.allowGuestQueue,
          slowModeSeconds: values.slowModeSeconds,
        },
        status: values.status,
        visibility: values.visibility,
      })
      toast.success(
        values.status === 'archived'
          ? 'Комната перемещена в архив.'
          : 'Настройки комнаты сохранены.',
      )
      onClose()
    } catch (reason) {
      toast.error(
        reason instanceof Error
          ? reason.message
          : 'Не удалось сохранить настройки комнаты.',
      )
    }
  }

  return (
    <Dialog
      fullWidth
      maxWidth="sm"
      onClose={handleClose}
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
      <DialogTitle>Настройки комнаты</DialogTitle>
      <DialogContent sx={{ paddingTop: '12px !important' }}>
        <Box
          component="form"
          display="grid"
          gap={2.5}
          id="room-settings-form"
          onSubmit={handleSubmit(handleSave)}
        >
          <TextField
            disabled={isSubmitting}
            label="Видимость"
            select
            {...register('visibility')}
          >
            <MenuItem value="public">Публичная — видна в списке</MenuItem>
            <MenuItem value="unlisted">По ссылке — скрыта из списка</MenuItem>
            <MenuItem value="private">
              Приватная — только участникам и по приглашению
            </MenuItem>
          </TextField>

          <Controller
            control={control}
            name="allowGuestChat"
            render={({ field }) => (
              <FormControlLabel
                control={
                  <Switch
                    checked={field.value}
                    disabled={isSubmitting}
                    onChange={field.onChange}
                  />
                }
                label="Разрешить гостям писать в чат"
              />
            )}
          />

          <Controller
            control={control}
            name="allowGuestQueue"
            render={({ field }) => (
              <FormControlLabel
                control={
                  <Switch
                    checked={field.value}
                    disabled={isSubmitting}
                    onChange={field.onChange}
                  />
                }
                label="Разрешить гостям добавлять видео в очередь"
              />
            )}
          />

          <TextField
            disabled={isSubmitting}
            error={Boolean(errors.slowModeSeconds)}
            helperText={
              errors.slowModeSeconds?.message ??
              '0 оставляет базовый интервал: 2 секунды для профилей и 5 секунд для гостей.'
            }
            inputProps={{ max: 300, min: 0, step: 1 }}
            label="Интервал сообщений, секунд"
            type="number"
            {...register('slowModeSeconds', {
              max: { message: 'Не больше 300 секунд.', value: 300 },
              min: { message: 'Не меньше 0 секунд.', value: 0 },
              required: 'Укажите интервал.',
              setValueAs: value => Number(value),
              validate: value =>
                Number.isInteger(value) || 'Введите целое количество секунд.',
            })}
          />

          <TextField
            disabled={isSubmitting}
            label="Статус"
            select
            {...register('status')}
          >
            <MenuItem value="active">Активная</MenuItem>
            <MenuItem value="archived">В архиве</MenuItem>
          </TextField>

          {selectedStatus === 'archived' && (
            <Alert severity="warning">
              Участники потеряют доступ к чату, очереди и плееру. Владелец
              сможет снова открыть настройки этой комнаты и вернуть её в
              активное состояние.
            </Alert>
          )}

          <Typography color="text.secondary" variant="body2">
            Изменять эти параметры может только владелец комнаты.
          </Typography>
        </Box>
      </DialogContent>
      <DialogActions sx={{ padding: 3, paddingTop: 1 }}>
        <Button disabled={isSubmitting} onClick={handleClose}>
          Отмена
        </Button>
        <Button
          disabled={isSubmitting}
          form="room-settings-form"
          type="submit"
          variant="contained"
        >
          {isSubmitting ? 'Сохраняем…' : 'Сохранить'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
