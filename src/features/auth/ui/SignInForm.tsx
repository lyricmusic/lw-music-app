import { FormEvent, useState } from 'react'
import { Link as RouterLink, useLocation, useNavigate } from 'react-router-dom'
import { toast } from 'react-toastify'

import { routes } from '@/shared/config/routes'
import { TextField } from '@/shared/ui/text-field'
import { Box, Button, CircularProgress, Typography } from '@mui/material'

import { getAuthErrorMessage, signInWithEmail } from '../api/auth'
import { authSubmitButtonSx } from './authFormStyles'

export function SignInForm() {
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmitted(true)

    if (!email.trim() || !password) return

    setLoading(true)
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
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <Typography component="h1" variant="h1">
        Вход
      </Typography>
      <Box component="form" noValidate onSubmit={handleLogin}>
        <div className="flex flex-col gap-y-3 mb-6">
          <TextField
            autoComplete="email"
            error={submitted && !email.trim()}
            helperText={
              submitted && !email.trim() ? 'Обязательное поле.' : undefined
            }
            onChange={event => setEmail(event.target.value)}
            placeholder="Email"
            type="email"
            value={email}
          />

          <TextField
            autoComplete="current-password"
            error={submitted && !password}
            helperText={
              submitted && !password ? 'Обязательное поле.' : undefined
            }
            onChange={event => setPassword(event.target.value)}
            placeholder="Пароль"
            type="password"
            value={password}
          />
        </div>

        <Button
          className="w-full"
          disabled={loading}
          sx={authSubmitButtonSx}
          type="submit"
          variant="contained"
        >
          {loading ? <CircularProgress color="inherit" size={22} /> : 'Войти'}
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
