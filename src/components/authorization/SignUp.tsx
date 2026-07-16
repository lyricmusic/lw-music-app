import { FormEvent, useState } from 'react'
import { Link as RouterLink, useNavigate } from 'react-router-dom'
import { toast } from 'react-toastify'

import { getAuthErrorMessage, registerWithEmail } from '@/services/auth'
import { Box, Button, CircularProgress, TextField } from '@mui/material'

export function SignUp() {
  const navigate = useNavigate()
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [copyPassword, setCopyPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const passwordsDoNotMatch = Boolean(copyPassword) && password !== copyPassword
  const passwordIsTooShort = Boolean(password) && password.length < 6
  const formIsInvalid =
    !displayName.trim() ||
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
      await registerWithEmail({ displayName, email, password })
      toast.success('Аккаунт создан. Добро пожаловать!')
      navigate('/rooms', { replace: true })
    } catch (error) {
      toast.error(getAuthErrorMessage(error))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <h1 className="text-[38px] font-ultrabold mb-5">Регистрация</h1>
      <Box component="form" noValidate onSubmit={handleRegister}>
        <div className="flex flex-col gap-y-3 mb-6">
          <TextField
            autoComplete="nickname"
            error={submitted && !displayName.trim()}
            fullWidth
            helperText={
              submitted && !displayName.trim() ? 'Обязательное поле.' : ' '
            }
            label="Никнейм"
            onChange={event => setDisplayName(event.target.value)}
            value={displayName}
            variant="filled"
          />

          <TextField
            autoComplete="email"
            error={submitted && !email.trim()}
            fullWidth
            helperText={
              submitted && !email.trim() ? 'Обязательное поле.' : ' '
            }
            label="E-mail"
            onChange={event => setEmail(event.target.value)}
            type="email"
            value={email}
            variant="filled"
          />

          <TextField
            autoComplete="new-password"
            error={(submitted && !password) || passwordIsTooShort}
            fullWidth
            helperText={
              passwordIsTooShort
                ? 'Минимум 6 символов.'
                : submitted && !password
                  ? 'Обязательное поле.'
                  : ' '
            }
            label="Пароль"
            onChange={event => setPassword(event.target.value)}
            type="password"
            value={password}
            variant="filled"
          />

          <TextField
            autoComplete="new-password"
            error={(submitted && !copyPassword) || passwordsDoNotMatch}
            fullWidth
            helperText={
              passwordsDoNotMatch
                ? 'Пароли не совпадают.'
                : submitted && !copyPassword
                  ? 'Обязательное поле.'
                  : ' '
            }
            label="Повторите пароль"
            onChange={event => setCopyPassword(event.target.value)}
            type="password"
            value={copyPassword}
            variant="filled"
          />
        </div>

        <Button
          className="w-full"
          disabled={loading}
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
          <span className="text-[#A99FAD]">Уже есть аккаунт?</span>
          <RouterLink className="text-[#180022] underline" to="/">
            Войти
          </RouterLink>
        </div>
      </Box>
    </div>
  )
}
