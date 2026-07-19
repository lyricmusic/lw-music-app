import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'react-toastify'

import { YandexIcon } from '@/shared/ui/icons'
import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  TextField,
  Typography,
} from '@mui/material'

import {
  getAuthErrorMessage,
  saveAnonymousUserWithEmail,
  signInWithYandex,
} from '../api/auth'
import { emailFieldValidation } from '../model/emailFieldValidation'
import { PasswordField } from './PasswordField'

interface SaveAccountDialogProps {
  onClose: () => void
  open: boolean
}

interface SaveAccountFormValues {
  copyPassword: string
  email: string
  password: string
}

export function SaveAccountDialog({ onClose, open }: SaveAccountDialogProps) {
  const [yandexLoading, setYandexLoading] = useState(false)
  const {
    formState: { errors, isSubmitting },
    getValues,
    handleSubmit,
    register,
    reset,
  } = useForm<SaveAccountFormValues>({
    defaultValues: { copyPassword: '', email: '', password: '' },
  })

  const closeDialog = () => {
    if (isSubmitting || yandexLoading) return
    reset()
    onClose()
  }

  const handleEmailSave = async ({
    email,
    password,
  }: SaveAccountFormValues) => {
    try {
      await saveAnonymousUserWithEmail({ email, password })
      toast.success(
        'Профиль сохранён. Ваши комнаты и история остались на месте.',
      )
      reset()
      onClose()
    } catch (error) {
      toast.error(getAuthErrorMessage(error))
    }
  }

  const handleYandexSave = async () => {
    setYandexLoading(true)
    try {
      await signInWithYandex({ linkAnonymousUser: true })
      toast.success('Яндекс ID подключён без смены профиля.')
      reset()
      onClose()
    } catch (error) {
      toast.error(getAuthErrorMessage(error))
    } finally {
      setYandexLoading(false)
    }
  }

  return (
    <Dialog fullWidth maxWidth="sm" onClose={closeDialog} open={open}>
      <DialogTitle>Сохранить профиль</DialogTitle>
      <DialogContent sx={{ paddingTop: '12px !important' }}>
        <Typography color="text.secondary" marginBottom={2}>
          Подключите способ входа. UID не изменится, поэтому участие в комнатах,
          настройки, блокировки и будущие покупки сохранятся.
        </Typography>

        <Button
          disabled={isSubmitting || yandexLoading}
          fullWidth
          onClick={() => void handleYandexSave()}
          sx={{ height: 52 }}
          variant="outlined"
        >
          {yandexLoading ? (
            <CircularProgress color="inherit" size={22} />
          ) : (
            <>
              <YandexIcon className="mr-3" />
              Подключить Яндекс ID
            </>
          )}
        </Button>

        <Divider sx={{ margin: '24px 0' }}>или email и пароль</Divider>

        <Box
          component="form"
          display="grid"
          gap={1.5}
          id="save-account-form"
          noValidate
          onSubmit={handleSubmit(handleEmailSave)}
        >
          <TextField
            autoComplete="email"
            error={Boolean(errors.email)}
            helperText={errors.email?.message}
            label="Email"
            {...register('email', emailFieldValidation)}
            type="email"
          />
          <PasswordField
            autoComplete="new-password"
            error={Boolean(errors.password)}
            helperText={errors.password?.message}
            label="Пароль"
            {...register('password', {
              minLength: { message: 'Минимум 6 символов.', value: 6 },
              required: 'Обязательное поле.',
            })}
          />
          <PasswordField
            autoComplete="new-password"
            error={Boolean(errors.copyPassword)}
            helperText={errors.copyPassword?.message}
            label="Повторите пароль"
            {...register('copyPassword', {
              deps: ['password'],
              required: 'Обязательное поле.',
              validate: value =>
                value === getValues('password') || 'Пароли не совпадают.',
            })}
          />
        </Box>
      </DialogContent>
      <DialogActions sx={{ padding: 3, paddingTop: 1 }}>
        <Button disabled={isSubmitting || yandexLoading} onClick={closeDialog}>
          Позже
        </Button>
        <Button
          disabled={isSubmitting || yandexLoading}
          form="save-account-form"
          type="submit"
          variant="contained"
        >
          {isSubmitting ? 'Сохраняем…' : 'Сохранить с email'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
