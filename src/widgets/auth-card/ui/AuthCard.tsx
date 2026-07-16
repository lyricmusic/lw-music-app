import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'react-toastify'

import logo from '@/assets/lw.svg'
import {
  SignInForm,
  SignUpForm,
  getAuthErrorMessage,
  signInWithGoogle,
} from '@/features/auth'
import { routes } from '@/shared/config/routes'
import { GoogleIcon } from '@/shared/ui/icons'
import { Button, CircularProgress } from '@mui/material'

interface AuthCardProps {
  mode: 'sign-in' | 'sign-up'
}

export function AuthCard({ mode }: AuthCardProps) {
  const navigate = useNavigate()
  const [googleLoading, setGoogleLoading] = useState(false)

  const handleGoogleLogin = async () => {
    setGoogleLoading(true)
    try {
      await signInWithGoogle()
      navigate(routes.rooms, { replace: true })
    } catch (error) {
      toast.error(getAuthErrorMessage(error))
    } finally {
      setGoogleLoading(false)
    }
  }

  return (
    <div className="w-[424px] px-10 py-[38px] bg-gray-block rounded-xl m-0.5 flex flex-col justify-between">
      <div>
        <img alt="Логотип" src={logo} />
      </div>
      {mode === 'sign-in' ? <SignInForm /> : <SignUpForm />}

      <Button
        disabled={googleLoading}
        onClick={handleGoogleLogin}
        sx={{
          '&:active': {
            color: '#fff',
          },
          '&:hover': {
            backgroundColor: '#180022',
            borderColor: '#180022',
            color: '#fff',
          },
          backgroundColor: 'transparent',
          border: '1px solid #DFDDDF',
          color: '#180022',
        }}
        variant="outlined"
      >
        {googleLoading ? (
          <CircularProgress color="inherit" size={22} />
        ) : (
          <>
            <GoogleIcon className="mr-3" />
            Войти через Google
          </>
        )}
      </Button>
    </div>
  )
}
