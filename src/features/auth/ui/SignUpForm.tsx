import { Link as RouterLink, useNavigate } from 'react-router-dom'
import { toast } from 'react-toastify'
import { useForm } from 'react-hook-form'

import { routes } from '@/shared/config/routes'
import { TextField } from '@/shared/ui/text-field'
import { Box, Button, CircularProgress, Typography } from '@mui/material'

import { getAuthErrorMessage, signUpWithEmail } from '../api/auth'
import { authSubmitButtonSx } from './authFormStyles'

export function SignUpForm() {
  const navigate = useNavigate()
  const {
    formState: { errors, isSubmitting },
    getValues,
    handleSubmit,
    register,
  } = useForm<{ copyPassword: string; email: string; password: string }>({
    defaultValues: { copyPassword: '', email: '', password: '' },
  })

  const handleRegister = async ({
    email,
    password,
  }: {
    copyPassword: string
    email: string
    password: string
  }) => {
    try {
      await signUpWithEmail({ email, password })
      toast.success('Аккаунт создан. Добро пожаловать!')
      navigate(routes.rooms, { replace: true })
    } catch (error) {
      toast.error(getAuthErrorMessage(error))
    }
  }

  return (
    <div>
      <Typography component="h1" variant="h1">
        Регистрация
      </Typography>
      <Box component="form" noValidate onSubmit={handleSubmit(handleRegister)}>
        <div className="flex flex-col gap-y-3 mb-6">
          <TextField
            autoComplete="email"
            error={Boolean(errors.email)}
            helperText={errors.email?.message}
            placeholder="Email"
            {...register('email', {
              required: 'Обязательное поле.',
              setValueAs: value => value.trim(),
            })}
            type="email"
          />

          <TextField
            autoComplete="new-password"
            error={Boolean(errors.password)}
            helperText={errors.password?.message}
            placeholder="Пароль"
            {...register('password', {
              minLength: { message: 'Минимум 6 символов.', value: 6 },
              required: 'Обязательное поле.',
            })}
            type="password"
          />

          <TextField
            autoComplete="new-password"
            error={Boolean(errors.copyPassword)}
            helperText={errors.copyPassword?.message}
            placeholder="Повторите пароль"
            {...register('copyPassword', {
              deps: ['password'],
              required: 'Обязательное поле.',
              validate: value =>
                value === getValues('password') || 'Пароли не совпадают.',
            })}
            type="password"
          />
        </div>

        <Button
          className="w-full"
          disabled={isSubmitting}
          sx={authSubmitButtonSx}
          type="submit"
          variant="contained"
        >
          {isSubmitting ? (
            <CircularProgress color="inherit" size={22} />
          ) : (
            'Зарегистрироваться'
          )}
        </Button>

        <div className="flex justify-center mt-5 gap-x-[10px]">
          <span style={{ color: 'var(--color-auth-muted)' }}>
            Уже есть аккаунт?
          </span>
          <RouterLink className="text-white underline" to={routes.signIn}>
            Войти
          </RouterLink>
        </div>
      </Box>
    </div>
  )
}
