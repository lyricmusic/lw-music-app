import { FormEvent, useState } from 'react'
import { Link as RouterLink, useLocation, useNavigate } from 'react-router-dom'
import { toast } from 'react-toastify'

import { getAuthErrorMessage, loginWithEmail } from '@/services/auth'
import { Box, Button, CircularProgress, TextField } from '@mui/material'

export function SignIn() {
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
      await loginWithEmail(email, password)
      const from = (location.state as { from?: { pathname?: string } } | null)
        ?.from?.pathname
      navigate(from && from !== '/' ? from : '/rooms', { replace: true })
    } catch (error) {
      toast.error(getAuthErrorMessage(error))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <h1 className="text-[38px] font-ultrabold mb-5">Вход</h1>
      <Box component="form" noValidate onSubmit={handleLogin}>
        <div className="flex flex-col gap-y-3 mb-6">
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
            autoComplete="current-password"
            error={submitted && !password}
            fullWidth
            helperText={submitted && !password ? 'Обязательное поле.' : ' '}
            label="Пароль"
            onChange={event => setPassword(event.target.value)}
            type="password"
            value={password}
            variant="filled"
          />
        </div>

        <Button
          className="w-full font-neue"
          disabled={loading}
          type="submit"
          variant="contained"
        >
          {loading ? <CircularProgress color="inherit" size={22} /> : 'Войти'}
        </Button>

        <div className="flex justify-center mt-5 gap-x-[10px]">
          <span className="text-[#A99FAD]">Нет аккаунта?</span>
          <RouterLink className="text-[#180022] underline" to="/register">
            Зарегистрироваться
          </RouterLink>
        </div>
      </Box>
    </div>
  )
}
