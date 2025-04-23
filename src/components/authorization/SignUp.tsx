import { useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { toast } from 'react-toastify'

import { auth, db } from '@/firebase'
import { Box, Button, CircularProgress } from '@mui/material'
import TextField from '@mui/material/TextField'
import {
  createUserWithEmailAndPassword,
  // signInWithEmailAndPassword,
} from 'firebase/auth'
import { doc, setDoc } from 'firebase/firestore'

export function SignUp() {
  const [loading, setLoading] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [copyPassword, setCopyPassword] = useState('')

  const errorPassword: boolean =
    Boolean(copyPassword) && password !== copyPassword
  const disabled = !email || !password || !copyPassword || errorPassword

  const resetForm = () => {
    setEmail('')
    setPassword('')
    setCopyPassword('')
  }

  const handleRegister = async () => {
    if (disabled) {
      toast.error('Вы не ввели данные!')
      return
    }
    setLoading(true)

    try {
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        email,
        password,
      )
      const user = userCredential.user

      await setDoc(doc(db, 'users', user.uid), {
        avatar: '',
        email: user.email,
        login: '',
      })

      toast.success('Вы успешно зарегистрировались')
      resetForm()
    } catch (error) {
      toast.error('Возникла ошибка при регистрации')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <h1 className="text-[38px] font-ultrabold mb-5">Регистрация</h1>
      <Box component="form">
        <div className="flex flex-col gap-y-3 mb-6">
          <TextField
            fullWidth
            label="E-mail"
            onChange={e => setEmail(e.target.value)}
            value={email}
            variant="filled"
          />

          <TextField
            autoComplete="new-password"
            fullWidth
            label="Пароль"
            onChange={e => setPassword(e.target.value)}
            type="password"
            value={password}
            variant="filled"
          />

          <TextField
            autoComplete="new-password"
            error={errorPassword}
            fullWidth
            helperText={errorPassword ? 'Пароли не совпадают.' : ''}
            label="Повторите пароль"
            onChange={e => setCopyPassword(e.target.value)}
            type="password"
            value={copyPassword}
            variant="filled"
          />
        </div>

        <Button className="w-full" onClick={handleRegister} variant="contained">
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
