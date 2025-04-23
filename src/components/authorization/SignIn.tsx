import { useEffect, useState } from 'react'
import { useDispatch } from 'react-redux'
import { Link as RouterLink } from 'react-router-dom'
import { useNavigate } from 'react-router-dom'

import { auth } from '@/firebase'
import { AddUserAction } from '@/store'
import { Box, Button } from '@mui/material'
import TextField from '@mui/material/TextField'
import { signInWithEmailAndPassword } from 'firebase/auth'

export function SignIn() {
  const navigate = useNavigate()
  const dispatch = useDispatch()
  const [error, setError] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const handleLogin = () => {
    if (!email || !password) {
      setError(true)
      return
    }

    signInWithEmailAndPassword(auth, email, password).then(resp => {
      console.log('resp', resp)
      navigate('/rooms')
      console.log('auth', auth.currentUser)
    })
  }

  useEffect(() => {
    auth.onAuthStateChanged(user => {
      if (user) {
        console.log('user', user)
        dispatch({
          payload: user,
          type: 'add-user',
        } satisfies AddUserAction)
        navigate('/rooms')
      }
    })
  }, [])

  return (
    <div>
      <h1 className="text-[38px] font-ultrabold mb-5">Вход</h1>
      <Box component="form">
        <div className="flex flex-col gap-y-3 mb-6">
          <TextField
            error={error}
            fullWidth
            helperText={error ? 'Обязательное поле.' : ''}
            label="E-mail"
            onChange={e => setEmail(e.target.value)}
            value={email}
            variant="filled"
          />

          <TextField
            autoComplete="current-password"
            error={error}
            fullWidth
            helperText={error ? 'Обязательное поле.' : ''}
            label="Пароль"
            onChange={e => setPassword(e.target.value)}
            type="password"
            value={password}
            variant="filled"
          />
        </div>

        <Button
          className="w-full font-neue"
          onClick={handleLogin}
          type="button"
          variant="contained"
        >
          Войти
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
