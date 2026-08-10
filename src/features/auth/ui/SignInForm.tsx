import { Link as RouterLink, useLocation, useNavigate } from 'react-router'
import { toast } from 'react-toastify'
import { useForm } from 'react-hook-form'

import { routes } from '@/shared/config/routes'
import { TextField } from '@/shared/ui/text-field'
import { Box, Button, CircularProgress, Typography } from '@mui/material'

import { getAuthErrorMessage, signInWithEmail } from '../api/auth'
import { emailFieldValidation } from '../model/emailFieldValidation'
import { getAuthDestination } from '../model/getAuthDestination'
import { authSubmitButtonSx } from './authFormStyles'
import { PasswordField } from './PasswordField'

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
      navigate(getAuthDestination(location.state), { replace: true })
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
            {...register('email', emailFieldValidation)}
            type="email"
          />

          <PasswordField
            autoComplete="current-password"
            error={Boolean(errors.password)}
            helperText={errors.password?.message}
            placeholder="Пароль"
            {...register('password', { required: 'Обязательное поле.' })}
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

        <div className="mt-5 flex flex-wrap justify-center gap-x-[10px] gap-y-1 text-center">
          <span style={{ color: 'var(--color-auth-muted)' }}>
            Нет аккаунта?
          </span>
          <RouterLink
            className="text-white underline"
            state={location.state}
            to={routes.signUp}
          >
            Зарегистрироваться
          </RouterLink>
        </div>
      </Box>
    </div>
  )
}
