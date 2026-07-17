import { Link as RouterLink, useLocation, useNavigate } from 'react-router-dom'
import { toast } from 'react-toastify'
import { useForm } from 'react-hook-form'

import { routes } from '@/shared/config/routes'
import { TextField } from '@/shared/ui/text-field'
import { Box, Button, CircularProgress, Typography } from '@mui/material'

import { getAuthErrorMessage, signInWithEmail } from '../api/auth'
import { authSubmitButtonSx } from './authFormStyles'

export function SignInForm() {
  const navigate = useNavigate()
  const location = useLocation()
  const {
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
  } = useForm<{ email: string; password: string }>({
    defaultValues: { email: '', password: '' },
  })

  const handleLogin = async ({
    email,
    password,
  }: {
    email: string
    password: string
  }) => {
    try {
      await signInWithEmail(email, password)
      const from = (
        location.state as {
          from?: { hash?: string; pathname?: string; search?: string }
        } | null
      )?.from
      const destination = from?.pathname
        ? `${from.pathname}${from.search ?? ''}${from.hash ?? ''}`
        : routes.rooms
      navigate(destination, { replace: true })
    } catch (error) {
      toast.error(getAuthErrorMessage(error))
    }
  }

  return (
    <div>
      <Typography component="h1" variant="h1">
        Вход
      </Typography>
      <Box component="form" noValidate onSubmit={handleSubmit(handleLogin)}>
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
            autoComplete="current-password"
            error={Boolean(errors.password)}
            helperText={errors.password?.message}
            placeholder="Пароль"
            {...register('password', { required: 'Обязательное поле.' })}
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
            'Войти'
          )}
        </Button>

        <div className="flex justify-center mt-5 gap-x-[10px]">
          <span style={{ color: 'var(--color-auth-muted)' }}>
            Нет аккаунта?
          </span>
          <RouterLink className="text-white underline" to={routes.signUp}>
            Зарегистрироваться
          </RouterLink>
        </div>
      </Box>
    </div>
  )
}
