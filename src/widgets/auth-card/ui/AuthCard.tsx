import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'react-toastify'

import {
  SignInForm,
  SignUpForm,
  getAuthErrorMessage,
  signInWithGoogle,
} from '@/features/auth'
import { routes } from '@/shared/config/routes'
import { GoogleIcon } from '@/shared/ui/icons'
import { Button, CircularProgress } from '@mui/material'
import logo from '@assets/lw.svg'

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
    <div
      className="m-0.5 flex w-[calc(100%-0.25rem)] max-w-[424px] flex-col justify-between rounded-[20px] bg-auth-card px-6 py-8 text-white min-[480px]:w-[424px] min-[480px]:px-10 min-[480px]:py-[38px]"
      style={{ backgroundColor: 'var(--color-auth-card, #2A2B47)' }}
    >
      <div className="relative h-[52px] w-[167px]">
        <img className="brightness-0 invert" alt="Логотип" src={logo} />
        <span
          aria-hidden="true"
          className="absolute bottom-[9.5px] right-[10.5px] h-2 w-2 rounded-full bg-accent"
        />
      </div>
      {mode === 'sign-in' ? <SignInForm /> : <SignUpForm />}

      <Button
        disabled={googleLoading}
        onClick={handleGoogleLogin}
        sx={{
          '&:active': {
            color: 'var(--color-auth-text)',
          },
          '&:hover': {
            backgroundColor: 'var(--color-accent)',
            borderColor: 'var(--color-accent)',
            color: 'var(--color-auth-card)',
          },
          backgroundColor: 'transparent',
          border: '2px solid var(--color-auth-border)',
          borderRadius: '12px',
          color: 'var(--color-auth-text)',
          fontSize: '14px',
          fontWeight: 800,
          height: '52px',
          padding: 0,
          textTransform: 'uppercase',
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
