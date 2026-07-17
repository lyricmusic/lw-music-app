import { FormEvent, useState } from 'react'
import { Link as RouterLink, useNavigate } from 'react-router-dom'
import { toast } from 'react-toastify'

import { routes } from '@/shared/config/routes'
import { TextField } from '@/shared/ui/text-field'
import { Box, Button, CircularProgress } from '@mui/material'

import { getAuthErrorMessage, signUpWithEmail } from '../api/auth'
import { authSubmitButtonSx } from './authFormStyles'

export function SignUpForm() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [copyPassword, setCopyPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const passwordsDoNotMatch = Boolean(copyPassword) && password !== copyPassword
  const passwordIsTooShort = Boolean(password) && password.length < 6
  const formIsInvalid =
    !email.trim() ||
    !password ||
    !copyPassword ||
    passwordsDoNotMatch ||
    passwordIsTooShort

  const handleRegister = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmitted(true)

    if (formIsInvalid) return

    setLoading(true)
    try {
      await signUpWithEmail({ email, password })
      toast.success('Аккаунт создан. Добро пожаловать!')
      navigate(routes.rooms, { replace: true })
    } catch (error) {
      toast.error(getAuthErrorMessage(error))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <h1 className="mb-8 text-[38px] leading-none font-ultrabold">
        Регистрация
      </h1>
      <Box component="form" noValidate onSubmit={handleRegister}>
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
            autoComplete="new-password"
            error={(submitted && !password) || passwordIsTooShort}
            helperText={
              passwordIsTooShort
                ? 'Минимум 6 символов.'
                : submitted && !password
                  ? 'Обязательное поле.'
                  : undefined
            }
            onChange={event => setPassword(event.target.value)}
            placeholder="Пароль"
            type="password"
            value={password}
          />

          <TextField
            autoComplete="new-password"
            error={(submitted && !copyPassword) || passwordsDoNotMatch}
            helperText={
              passwordsDoNotMatch
                ? 'Пароли не совпадают.'
                : submitted && !copyPassword
                  ? 'Обязательное поле.'
                  : undefined
            }
            onChange={event => setCopyPassword(event.target.value)}
            placeholder="Повторите пароль"
            type="password"
            value={copyPassword}
          />
        </div>

        <Button
          className="w-full"
          disabled={loading}
          sx={authSubmitButtonSx}
          type="submit"
          variant="contained"
        >
          {loading ? (
            <CircularProgress color="inherit" size={22} />
          ) : (
            'Зарегистрироваться'
          )}
        </Button>

        <div className="flex justify-center mt-5 gap-x-[10px]">
          <span className="text-auth-muted">Уже есть аккаунт?</span>
          <RouterLink className="text-white underline" to={routes.signIn}>
            Войти
          </RouterLink>
        </div>
      </Box>
    </div>
  )
}
